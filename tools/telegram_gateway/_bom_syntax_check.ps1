$files = @('check_master_bot.ps1','start_master_bot.ps1','stop_master_bot.ps1')
foreach ($f in $files) {
    $path = "D:\AI_WORKSPACE\tools\telegram_gateway\$f"
    # BOM check
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $hasBOM = ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    # Syntax check
    $errs = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$errs)
    $syntaxOK = ($errs.Count -eq 0)
    $bomStr = if ($hasBOM) { "BOM=UTF8-BOM" } else { "BOM=MISSING!" }
    $synStr = if ($syntaxOK) { "SYNTAX=OK" } else { "SYNTAX=ERRORS($($errs.Count))" }
    Write-Host "$f  |  $bomStr  |  $synStr"
}
