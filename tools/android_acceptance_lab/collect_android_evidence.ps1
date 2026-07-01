# collect_android_evidence.ps1 — gather logcat, test reports, screenshots into the evidence dir.
$ErrorActionPreference = 'SilentlyContinue'
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$adb = "$sdk\platform-tools\adb.exe"
$root = "$PSScriptRoot\..\.."
$ev = "$root\_generated\android_acceptance_lab"
$app = "$root\apps\mater_controller_android"
function Log($m) { Write-Host ("[{0}] {1}" -f (Get-Date -Format o), $m) }

New-Item -ItemType Directory -Force "$ev\logs","$ev\reports","$ev\screenshots" | Out-Null
Log "Collecting logcat…"
& $adb logcat -d 2>$null | Out-File "$ev\logs\logcat_full.txt" -Encoding utf8
& $adb logcat -d 2>$null | Select-String 'FATAL EXCEPTION|ANR in ru.dmitry|AndroidRuntime.*ru.dmitry' | Out-File "$ev\logs\crash_anr_scan.txt" -Encoding utf8
Log "Copying instrumented test reports…"
$rep = "$app\app\build\reports\androidTests\connected"
if (Test-Path $rep) { Copy-Item -Recurse -Force $rep "$ev\reports\connected" }
$xml = "$app\app\build\outputs\androidTest-results\connected"
if (Test-Path $xml) { Copy-Item -Recurse -Force $xml "$ev\reports\junit" }
Log "Screenshot snapshot…"
& $adb exec-out screencap -p > "$ev\screenshots\current.png" 2>$null
Log "EVIDENCE_COLLECTED in $ev"
exit 0
