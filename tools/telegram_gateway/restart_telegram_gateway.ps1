# RESTART TELEGRAM GATEWAY
$WORKSPACE = "D:\AI_WORKSPACE"

Write-Host ""
Write-Host "=== TELEGRAM GATEWAY RESTART ===" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"
Write-Host ""

Write-Host "Step 1: Stopping..." -ForegroundColor Yellow
powershell.exe -ExecutionPolicy Bypass -File "$WORKSPACE\tools\telegram_gateway\stop_telegram_gateway.ps1"

Write-Host "Step 2: Waiting 2 seconds..." -ForegroundColor Gray
Start-Sleep -Seconds 2

Write-Host "Step 3: Starting..." -ForegroundColor Green
powershell.exe -ExecutionPolicy Bypass -File "$WORKSPACE\tools\telegram_gateway\start_telegram_gateway.ps1"

Write-Host ""
Write-Host "✅ Restart sequence complete." -ForegroundColor Green
Write-Host ""
