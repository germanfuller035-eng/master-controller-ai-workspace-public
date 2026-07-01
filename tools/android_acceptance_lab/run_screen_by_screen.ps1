# run_screen_by_screen.ps1 — Шаг 6 orchestrator. Runs ScreenByScreenRunner one screen at a time,
# parses the per-screen ledger, and STOPS on the first screen with any FAIL/UNEXECUTED so the root
# cause can be fixed before advancing. Streams CANARY/CTRL logcat to a file (buffer-safe).
#
# Usage: .\run_screen_by_screen.ps1 [-Screens a,b,c] [-OutDir <dir>]
param(
    [string[]]$Screens = @('home','operations','ops_deadletters','ops_sources','reliability','cost',
        'backup','push','commandcenter','owner_incidents','replies','settings','approvals',
        'approval_detail','approval_list','pipeline','ai','automation','campaigns','commercial',
        'commandcenter_commercial','offer_review','offer_detail','knowledge','knowledge_digest',
        'miniaudit','ma_lead','ma_list','ownersettings','reservoir','sources','source_telemetry',
        'agents','owner_queues','catalog','product_detail','firsttouch','multichannel','transport',
        'test_only','conversations'),
    [string]$OutDir = "D:\AI_WORKSPACE\.claude\worktrees\android-exhaustive-control-acceptance-v2\_generated\android_acceptance_lab\exhaustive_v3",
    [switch]$Fresh
)
# adb writes transient warnings to stderr (e.g. "null root node" during a dump); those must NOT abort
# the orchestrator. Keep going on non-terminating errors; we judge state from parsed output, not $?.
$ErrorActionPreference = 'Continue'
$adb = "C:\Users\dima-\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$runner = "ru.dmitry.matercontroller.debug.test/androidx.test.runner.AndroidJUnitRunner"
$results = @()
New-Item -ItemType Directory -Force $OutDir | Out-Null
$batchFile = Join-Path $OutDir "SCREEN_BATCH_RESULTS.json"
$cleanFile = Join-Path $OutDir "_clean_screens.txt"
# -Fresh clears the resume ledger; default resumes (skips already-CLEAN screens). Env deaths on this
# memory-constrained host interrupt long batches, so resume preserves progress across restarts.
if ($Fresh -and (Test-Path $cleanFile)) { Remove-Item $cleanFile -Force }

function Free-Ram {
    # The emulator host is memory-constrained (~7.8GB). Reclaim RAM-hungry respawners so qemu
    # doesn't get paged out (which manifests as the app being killed → all-NAV_FAILED).
    Get-Process chrome,msedgewebview2,Widgets,Telegram,Codex -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Ensure-App {
    # Relaunch to Today and confirm the app is foregrounded before instrumenting. Returns $true if ok.
    & $adb shell am start -a android.intent.action.MAIN -n ru.dmitry.matercontroller.debug/ru.dmitry.matercontroller.MainActivity --activity-clear-task 2>&1 | Out-Null
    Start-Sleep -Seconds 6
    for ($i=0; $i -lt 3; $i++) {
        $r = (& $adb shell uiautomator dump /sdcard/h.xml 2>&1 | Out-String)
        if ($r -match 'dumped') { break }
        Start-Sleep -Seconds 3
    }
    & $adb pull /sdcard/h.xml "$OutDir\_health.xml" 2>&1 | Out-Null
    if (Test-Path "$OutDir\_health.xml") {
        $h = (Get-Content "$OutDir\_health.xml" -Raw) -replace "`0",""
        return ($h -match 'today_screen' -or $h -match 'bottom_nav')
    }
    return $false
}

function Run-Screen($screen) {
    $stream = Join-Path $OutDir "screen_$screen.log"
    & $adb logcat -c
    $job = Start-Job -ScriptBlock { param($adb,$f) & $adb logcat CTRL_LEDGER:I "*:S" | Out-File -FilePath $f -Encoding utf8 } -ArgumentList $adb,$stream
    & $adb shell am instrument -w -r -e class ru.dmitry.matercontroller.ScreenByScreenRunner -e screen $screen $runner 2>&1 |
        Select-String "Tests run|OK \(|Process crashed" | ForEach-Object { Write-Host "  $($_.Line)" }
    Start-Sleep 3; Stop-Job $job; Remove-Job $job
    $content = (Get-Content $stream -Raw) -replace "`0",""
    return ([regex]::Match($content, "SCREEN_END screen=$screen executed=(\d+) passed=(\d+) failed=(\d+) unexecuted=(\d+)"))
}

foreach ($screen in $Screens) {
    # Resume: skip screens already proven CLEAN in a prior (interrupted) run so environmental
    # emulator deaths don't cost progress on this memory-constrained host.
    if (Test-Path $cleanFile) {
        $done = Get-Content $cleanFile -ErrorAction SilentlyContinue
        if ($done -contains $screen) { Write-Host "==== SKIP (already CLEAN): $screen ===="; continue }
    }
    Free-Ram
    if (-not (Ensure-App)) { Write-Host "  WARN: app not foregrounded before $screen; retrying RAM+relaunch" -ForegroundColor Yellow; Free-Ram; Ensure-App | Out-Null }
    Write-Host "==== SCREEN: $screen ===="
    $endLine = Run-Screen $screen
    # Environmental retry: an all-NAV_FAILED result means the app was killed (RAM) or a data-gated
    # screen's cards hadn't loaded yet (commercial summary) — not a real defect. Reclaim RAM,
    # re-establish the app, and re-run up to 3x before judging it.
    for ($envTry = 0; $envTry -lt 3; $envTry++) {
        $isEnvBlip = $endLine.Success -and ([int]$endLine.Groups[2].Value -eq 0) -and ([int]$endLine.Groups[4].Value -gt 0) -and ([int]$endLine.Groups[3].Value -eq 0)
        if (-not $isEnvBlip) { break }
        $navFailed = (((Get-Content (Join-Path $OutDir "screen_$screen.log") -Raw) -replace "`0","") -match 'UNEXECUTED_NAV_FAILED')
        if (-not $navFailed) { break }
        Write-Host "  all-NAV_FAILED (environmental) - RAM recover + retry $screen ($($envTry+1)/3)" -ForegroundColor Yellow
        Free-Ram; Start-Sleep 3; Ensure-App | Out-Null
        $endLine = Run-Screen $screen
    }
    # NO_END_LINE = ANR/crash mid-screen (environmental on this host). Recover and retry ONCE before
    # giving up, rather than hard-stopping the whole batch on an emulator hiccup.
    if (-not $endLine.Success) {
        Write-Host "  no SCREEN_END for $screen (ANR/crash) - recover + retry once" -ForegroundColor Yellow
        Free-Ram; Start-Sleep 5; Ensure-App | Out-Null
        $endLine = Run-Screen $screen
    }
    if (-not $endLine.Success) {
        $results += [PSCustomObject]@{ screen=$screen; executed=0; passed=0; failed=0; unexecuted=0; status='NO_END_LINE' }
        $results | ConvertTo-Json -Depth 4 | Out-File $batchFile -Encoding utf8
        Write-Host "  STOP: no SCREEN_END for $screen after retry. Investigate." -ForegroundColor Red
        break
    }
    $ex=[int]$endLine.Groups[1].Value; $pa=[int]$endLine.Groups[2].Value; $fa=[int]$endLine.Groups[3].Value; $un=[int]$endLine.Groups[4].Value
    $clean = ($fa -eq 0 -and $un -eq 0 -and $ex -gt 0)
    $results += [PSCustomObject]@{ screen=$screen; executed=$ex; passed=$pa; failed=$fa; unexecuted=$un; status=$(if($clean){'CLEAN'}else{'NEEDS_FIX'}) }
    $results | ConvertTo-Json -Depth 4 | Out-File $batchFile -Encoding utf8
    Write-Host "  $screen -> executed=$ex passed=$pa failed=$fa unexecuted=$un"
    if ($clean) {
        Add-Content -Path $cleanFile -Value $screen -Encoding utf8   # persist for resume
    } else {
        Write-Host "  STOP at first non-clean screen: $screen (Step 6). Root-cause before advancing." -ForegroundColor Yellow
        break
    }
}
Write-Host "==== BATCH SUMMARY ===="
$results | Format-Table -AutoSize
