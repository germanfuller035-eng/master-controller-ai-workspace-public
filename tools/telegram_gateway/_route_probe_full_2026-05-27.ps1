# Telegram API route probe — no tokens used
$ErrorActionPreference = 'SilentlyContinue'

function Probe-Route {
    param([string]$Label, [string[]]$ExtraArgs)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $args = @('-sS','-o','NUL','-D','-','-I','https://api.telegram.org/','--max-time','10') + $ExtraArgs
    $out = & curl.exe @args 2>&1
    $sw.Stop()
    $code = $LASTEXITCODE
    $statusLine = ($out | Select-String -Pattern '^HTTP/' | Select-Object -First 1).ToString()
    $ms = $sw.ElapsedMilliseconds
    if ($code -eq 0 -and $statusLine) {
        Write-Host ("OK   | {0,-45} | {1} | latency={2}ms" -f $Label, $statusLine.Trim(), $ms)
    } else {
        $errLine = ($out | Select-Object -Last 1)
        Write-Host ("FAIL | {0,-45} | exit={1} err={2} | latency={3}ms" -f $Label, $code, $errLine, $ms)
    }
}

Write-Host '=== DIRECT ==='
Probe-Route -Label 'direct' -ExtraArgs @()

Write-Host ''
Write-Host '=== GATEWAY ==='
$gw = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1).IPv4DefaultGateway.NextHop
Write-Host ("active_gateway={0}" -f $gw)

Write-Host ''
Write-Host '=== HTTP PROXY LOCAL ==='
foreach ($p in @('http://127.0.0.1:10809','http://127.0.0.1:7890','http://127.0.0.1:8080','http://127.0.0.1:2080')) {
    Probe-Route -Label $p -ExtraArgs @('--proxy', $p)
}

Write-Host ''
Write-Host '=== HTTP PROXY GATEWAY ==='
if ($gw) {
    foreach ($port in @(10809,7890,8080,2080)) {
        $url = "http://${gw}:${port}"
        Probe-Route -Label $url -ExtraArgs @('--proxy', $url)
    }
}

Write-Host ''
Write-Host '=== SOCKS5 PROXY LOCAL ==='
foreach ($p in @('socks5://127.0.0.1:10808','socks5://127.0.0.1:7891','socks5://127.0.0.1:2081')) {
    Probe-Route -Label $p -ExtraArgs @('--proxy', $p)
}

Write-Host ''
Write-Host '=== SOCKS5 PROXY GATEWAY ==='
if ($gw) {
    foreach ($port in @(10808,7891,2081)) {
        $url = "socks5://${gw}:${port}"
        Probe-Route -Label $url -ExtraArgs @('--proxy', $url)
    }
}

Write-Host ''
Write-Host '=== DONE ==='
