# start_visible_emulator.ps1 — launch the acceptance AVD in a VISIBLE window (never headless).
# Idempotent: if an emulator is already online, it is reused. Waits for boot completion.
$ErrorActionPreference = 'Stop'
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$adb = "$sdk\platform-tools\adb.exe"
$emu = "$sdk\emulator\emulator.exe"
$log = "$PSScriptRoot\..\..\_generated\android_acceptance_lab\logs\emulator.log"
function Log($m) { $line = "[{0}] {1}" -f (Get-Date -Format o), $m; Write-Host $line; Add-Content -Path $log -Value $line -Encoding utf8 }
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

# Pick AVD: prefer MasterController_Acceptance, else first available.
$avds = & $emu -list-avds
$avd = if ($avds -contains 'MasterController_Acceptance') { 'MasterController_Acceptance' } else { ($avds | Select-Object -First 1) }
Log "Selected AVD: $avd"

$online = (& $adb devices | Select-String 'emulator-\d+\s+device')
if ($online) {
    Log "Emulator already online: $($online.Line.Trim()) — reusing (visible window assumed if not started headless)"
} else {
    # VISIBLE: no -no-window / -headless. -gpu host for accel; -no-snapshot-load for clean boot.
    Log "Launching VISIBLE emulator (no -no-window)…"
    Start-Process -FilePath $emu -ArgumentList @("-avd", $avd, "-gpu", "host", "-no-boot-anim", "-no-snapshot-save") -WindowStyle Normal
}

Log "Waiting for device…"
& $adb wait-for-device
$deadline = (Get-Date).AddMinutes(5)
do {
    Start-Sleep -Seconds 3
    $booted = (& $adb shell getprop sys.boot_completed 2>$null).Trim()
} until ($booted -eq '1' -or (Get-Date) -gt $deadline)

if ($booted -eq '1') { & $adb shell input keyevent 82 2>$null; Log "BOOT_COMPLETED=1"; exit 0 }
else { Log "BOOT_TIMEOUT"; exit 1 }
