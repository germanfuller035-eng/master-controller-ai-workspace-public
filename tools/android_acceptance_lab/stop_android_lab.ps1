# stop_android_lab.ps1 — gracefully stop the acceptance emulator (does NOT delete the AVD or data).
$ErrorActionPreference = 'SilentlyContinue'
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$adb = "$sdk\platform-tools\adb.exe"
function Log($m) { Write-Host ("[{0}] {1}" -f (Get-Date -Format o), $m) }
$dev = (& $adb devices | Select-String 'emulator-\d+').Matches.Value
if ($dev) { Log "Stopping $dev"; & $adb -s $dev emu kill; Log "STOPPED" } else { Log "No emulator online" }
exit 0
