# open_latest_report.ps1 — open the latest HTML acceptance report in the default browser.
$ErrorActionPreference = 'SilentlyContinue'
$root = "$PSScriptRoot\..\.."
$candidates = @(
  "$root\_generated\android_acceptance_lab\reports\connected\index.html",
  "$root\apps\mater_controller_android\app\build\reports\androidTests\connected\index.html"
)
$rep = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($rep) { Write-Host "Opening $rep"; Start-Process $rep; exit 0 }
else { Write-Host "No HTML report found yet — run run_full_acceptance.ps1 first."; exit 1 }
