$files = @(
    'D:\AI_WORKSPACE\tools\telegram_gateway\check_master_bot.ps1',
    'D:\AI_WORKSPACE\tools\telegram_gateway\start_master_bot.ps1',
    'D:\AI_WORKSPACE\tools\telegram_gateway\stop_master_bot.ps1'
)
Write-Host '=== SYNTAX CHECK ===' -ForegroundColor Cyan
$allOk = $true
foreach ($f in $files) {
    $name = Split-Path $f -Leaf
    $parseErrors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$null, [ref]$parseErrors)
    if ($parseErrors.Count -eq 0) {
        Write-Host "  [SYNTAX OK] $name" -ForegroundColor Green
    } else {
        $allOk = $false
        Write-Host "  [SYNTAX ERR] $name : $($parseErrors.Count) errors" -ForegroundColor Red
        $parseErrors | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
    }
}
if ($allOk) {
    Write-Host ''
    Write-Host 'All files syntactically valid.' -ForegroundColor Green
}
