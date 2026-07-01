# run_full_acceptance.ps1 — FAST_AUTOMATED full instrumented acceptance against production.
# Requires the worker token via env MATER_WORKER_TOKEN (never printed). Visible emulator must be running.
param([string]$ProdBase = "https://195-96-132-82.sslip.io/api/v1")
$ErrorActionPreference = 'Stop'
$app = "$PSScriptRoot\..\..\apps\mater_controller_android"
$log = "$PSScriptRoot\..\..\_generated\android_acceptance_lab\logs\acceptance.log"
function Log($m) { $line = "[{0}] {1}" -f (Get-Date -Format o), $m; Write-Host $line; Add-Content -Path $log -Value $line -Encoding utf8 }
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

if (-not $env:MATER_WORKER_TOKEN) { Log "MATER_WORKER_TOKEN not set — live write tests will skip"; }
Log "=== FULL_ACCEPTANCE (FAST_AUTOMATED) start; prodBase=$ProdBase ==="
Push-Location $app
try {
    & .\gradlew.bat :app:connectedDebugAndroidTest `
        "-Pandroid.testInstrumentationRunnerArguments.prodBase=$ProdBase" `
        "-Pandroid.testInstrumentationRunnerArguments.workerToken=$($env:MATER_WORKER_TOKEN)" 2>&1 | Tee-Object -Variable out | Out-Null
    $code = $LASTEXITCODE
    $out | Select-String 'Tests .*completed|BUILD SUCC|BUILD FAIL|FAILED' | ForEach-Object { Log $_.Line.Trim() }
    Log "ACCEPTANCE_EXIT=$code"
    exit $code
} finally { Pop-Location }
