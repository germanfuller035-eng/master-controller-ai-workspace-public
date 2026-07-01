# run_exhaustive_owner_visible.ps1 — owner-visible exhaustive run: relaunch app, run the full
# ControlLedgerRunner via am instrument while the emulator window is visible, and tail the ledger
# with [CONTROL]/[SCREEN]/[STATUS] narration in this terminal. This is the FULL run, not a smoke.
$ErrorActionPreference = 'Continue'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$testPkg = "ru.dmitry.matercontroller.debug.test/androidx.test.runner.AndroidJUnitRunner"
function Log($m) { Write-Host ("[{0}] {1}" -f (Get-Date -Format HH:mm:ss), $m) }

Log "=== EXHAUSTIVE_OWNER_VISIBLE_RUN start (full control-by-control) ==="
& $adb shell monkey -p ru.dmitry.matercontroller.debug -c android.intent.category.LAUNCHER 1 2>$null | Out-Null
Start-Sleep -Seconds 4
& $adb logcat -c
# run instrument in background job; tail logcat in foreground for visible narration
$job = Start-Job -ScriptBlock { param($a,$t) & $a shell am instrument -w -r -e class ru.dmitry.matercontroller.ExhaustiveControlRunner $t } -ArgumentList $adb,$testPkg
$seen = 0
while ($true) {
    Start-Sleep -Seconds 2
    $rows = & $adb logcat -d -s CTRL_LEDGER 2>$null | Select-String 'ROW (\{.*\})'
    for ($i = $seen; $i -lt $rows.Count; $i++) {
        $m = [regex]::Match($rows[$i].Line, 'ROW (\{.*\})')
        if ($m.Success) {
            $o = $m.Groups[1].Value | ConvertFrom-Json
            Log ("[CONTROL {0}] [{1}] {2} -> {3}" -f ($i+1), $o.screen, $o.control_id, $o.status)
        }
    }
    $seen = $rows.Count
    if ((& $adb logcat -d -s CTRL_LEDGER 2>$null | Select-String 'LEDGER_END').Count -ge 1) { break }
    if ($job.State -ne 'Running' -and $seen -gt 0) { break }
}
Log "=== EXHAUSTIVE_OWNER_VISIBLE_RUN end: $seen controls narrated ==="
Stop-Job $job -ErrorAction SilentlyContinue; Remove-Job $job -ErrorAction SilentlyContinue
exit 0
