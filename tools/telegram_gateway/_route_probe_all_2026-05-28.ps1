# Network route probe for api.telegram.org — NO secrets used.
# Outputs: direct test + gateway + HTTP/SOCKS proxy candidate matrix.

$ErrorActionPreference = 'SilentlyContinue'
$report = @()

function Probe-Url($label, $url, $proxy) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $status = ''; $err = ''
    try {
        if ($proxy) {
            $r = curl.exe -I $url --max-time 10 --proxy $proxy 2>&1
        } else {
            $r = curl.exe -I $url --max-time 10 2>&1
        }
        $sw.Stop()
        $first = ($r | Where-Object { $_ -match 'HTTP/' } | Select-Object -First 1)
        if ($first) { $status = $first.Trim() } else {
            $errLine = ($r | Where-Object { $_ -match 'curl:' } | Select-Object -First 1)
            $err = if ($errLine) { $errLine.Trim() } else { ($r | Select-Object -First 1) }
        }
    } catch {
        $sw.Stop()
        $err = $_.Exception.Message
    }
    [PSCustomObject]@{
        Route   = $label
        Status  = $status
        Error   = $err
        Latency = "$($sw.ElapsedMilliseconds)ms"
    }
}

Write-Host "=== STEP 1: DIRECT api.telegram.org ==="
$direct = Probe-Url "DIRECT https://api.telegram.org/" "https://api.telegram.org/" $null
$direct | Format-List | Out-String | Write-Host
$report += $direct

Write-Host "=== STEP 2: GATEWAY (ipconfig) ==="
$cfg = ipconfig 2>&1
$gws = @()
$cfg | Select-String -Pattern 'Default Gateway' | ForEach-Object {
    $line = $_.Line
    if ($line -match '(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})') {
        $gws += $Matches[1]
    }
}
$gws = $gws | Sort-Object -Unique
Write-Host "Detected gateways: $($gws -join ', ')"

Write-Host ""
Write-Host "=== STEP 3: HTTP PROXY CANDIDATES ==="
$httpCands = @(
    'http://127.0.0.1:10809',
    'http://127.0.0.1:7890',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:2080'
)
foreach ($gw in $gws) {
    foreach ($p in 10809, 7890, 8080, 2080) {
        $httpCands += "http://${gw}:${p}"
    }
}
foreach ($cand in $httpCands) {
    $r = Probe-Url $cand "https://api.telegram.org/" $cand
    Write-Host ("  {0,-35} | {1,-25} | {2}" -f $cand, ($r.Status + $r.Error).Substring(0,[Math]::Min(25,($r.Status + $r.Error).Length)), $r.Latency)
    $report += $r
}

Write-Host ""
Write-Host "=== STEP 4: SOCKS PROXY CANDIDATES ==="
$socksCands = @(
    'socks5://127.0.0.1:10808',
    'socks5://127.0.0.1:7891',
    'socks5://127.0.0.1:2081'
)
foreach ($gw in $gws) {
    foreach ($p in 10808, 7891, 2081) {
        $socksCands += "socks5://${gw}:${p}"
    }
}
foreach ($cand in $socksCands) {
    $r = Probe-Url $cand "https://api.telegram.org/" $cand
    Write-Host ("  {0,-35} | {1,-25} | {2}" -f $cand, ($r.Status + $r.Error).Substring(0,[Math]::Min(25,($r.Status + $r.Error).Length)), $r.Latency)
    $report += $r
}

Write-Host ""
Write-Host "=== SUMMARY ==="
$working = $report | Where-Object { $_.Status -match '^HTTP/' }
if ($working) {
    Write-Host "WORKING ROUTES:"
    $working | Format-Table Route, Status, Latency -AutoSize | Out-String | Write-Host
} else {
    Write-Host "NO WORKING ROUTE FOUND."
}

# Save JSON for the report
$out = [PSCustomObject]@{
    timestamp  = (Get-Date).ToString('o')
    gateways   = $gws
    direct     = $direct
    candidates = $report
    working    = $working
}
$json = $out | ConvertTo-Json -Depth 5
$dest = 'D:\AI_WORKSPACE\tools\telegram_gateway\_route_probe_all_2026-05-28_result.json'
Set-Content -Path $dest -Value $json -Encoding UTF8
Write-Host "Result saved: $dest"
