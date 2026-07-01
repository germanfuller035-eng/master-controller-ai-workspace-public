# Telegram API route discovery probe.
# SAFE: does NOT use BOT_TOKEN, only HEAD against api.telegram.org root.
# Author: route-fix operator, 2026-05-27.

$ErrorActionPreference = 'Continue'
$target = 'https://api.telegram.org/'
$timeout = 10

function Test-Route {
    param(
        [string]$Label,
        [string[]]$ExtraArgs
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $args = @('-I', $target, '--max-time', "$timeout", '-s', '-S', '-o', 'NUL', '-w', 'HTTP=%{http_code} CTYPE=%{content_type} TT=%{time_total}')
    $args += $ExtraArgs
    try {
        $out = & curl.exe @args 2>&1
        $sw.Stop()
        $exit = $LASTEXITCODE
        $line = ($out | Out-String).Trim()
        Write-Host ("[$Label] exit=$exit elapsed=$([math]::Round($sw.Elapsed.TotalSeconds,2))s | $line")
    } catch {
        $sw.Stop()
        Write-Host ("[$Label] EXCEPTION elapsed=$([math]::Round($sw.Elapsed.TotalSeconds,2))s | " + $_.Exception.Message)
    }
}

Write-Host '=== STEP 1: DIRECT ==='
Test-Route -Label 'direct' -ExtraArgs @()

Write-Host ''
Write-Host '=== STEP 2: discover candidate gateways ==='
# Parse ipconfig: collect Default Gateway lines, then de-duplicate non-empty IPv4s.
$ipcfg = ipconfig | Out-String
$gwLines = $ipcfg -split "`r?`n" | Where-Object { $_ -match 'Default Gateway|Основной шлюз' }
$gws = @()
foreach ($l in $gwLines) {
    if ($l -match '(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})') {
        $ip = $matches[1]
        if ($ip -ne '0.0.0.0' -and ($gws -notcontains $ip)) { $gws += $ip }
    }
}
# Also try common phone-tether IPs commonly used by HAPP/Android USB-tether/Hotspot.
$commonPhone = @('192.168.42.129','192.168.42.1','192.168.43.1','172.20.10.1','192.168.49.1')
foreach ($ip in $commonPhone) { if ($gws -notcontains $ip) { $gws += $ip } }

Write-Host ('Candidate IPs to probe: ' + ($gws -join ', '))

$httpPorts  = @(10809, 7890, 8080, 2080, 1080, 8888)
$socksPorts = @(10808, 7891, 2081, 1080)

Write-Host ''
Write-Host '=== STEP 3: HTTP proxy candidates ==='
foreach ($ip in $gws) {
    foreach ($p in $httpPorts) {
        Test-Route -Label ("http  " + $ip + ":" + $p) -ExtraArgs @('-x', ("http://" + $ip + ":" + $p))
    }
}

Write-Host ''
Write-Host '=== STEP 4: SOCKS5 proxy candidates ==='
foreach ($ip in $gws) {
    foreach ($p in $socksPorts) {
        Test-Route -Label ("socks " + $ip + ":" + $p) -ExtraArgs @('--socks5-hostname', ($ip + ":" + $p))
    }
}

Write-Host ''
Write-Host '=== DONE ==='
