# TELEGRAM API ROUTE PROBE 2026-05-28
# Read-only network probe. Does NOT use BOT_TOKEN. Does NOT print secrets.
# Tests: direct + HTTP proxy candidates + SOCKS proxy candidates (via curl).

$ErrorActionPreference = "SilentlyContinue"
$TARGET = "https://api.telegram.org/"
$TIMEOUT = 10

function Probe-Route($label, $curlArgs) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $out = & curl.exe @curlArgs 2>&1
    $sw.Stop()
    $latency = $sw.ElapsedMilliseconds
    $okLine = ($out | Select-String -Pattern "HTTP/").Line | Select-Object -First 1
    $errLine = ($out | Select-String -Pattern "curl: \(").Line | Select-Object -First 1
    $status = if ($okLine) { ($okLine -replace '\s+',' ').Trim() } elseif ($errLine) { $errLine.Trim() } else { "UNKNOWN" }
    $ok = if ($okLine -match "HTTP/[\d\.]+ [23]\d\d|HTTP/[\d\.]+ 4\d\d") { "yes" } else { "no" }
    [pscustomobject]@{
        route   = $label
        ok      = $ok
        status  = $status
        latency_ms = $latency
    }
}

Write-Host "=== TELEGRAM API ROUTE PROBE 2026-05-28 ===" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"
Write-Host ""

# --- Gateway detect ---
Write-Host "--- GATEWAY ---" -ForegroundColor Yellow
$ipcfg = ipconfig | Out-String
$gws = [regex]::Matches($ipcfg, "Default Gateway[ \.\s]*:\s*([\d\.]+)") | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -and $_ -ne "" } | Select-Object -Unique
foreach ($gw in $gws) { Write-Host "Gateway: $gw" }
$PHONE_GATEWAY = if ($gws.Count -gt 0) { $gws[0] } else { $null }
Write-Host ""

$results = @()

# --- DIRECT ---
Write-Host "--- DIRECT ---" -ForegroundColor Yellow
$r = Probe-Route "direct" @("-I", $TARGET, "--max-time", "$TIMEOUT", "-sS")
Write-Host ("{0,-45} ok={1,-3} latency={2}ms  status={3}" -f $r.route, $r.ok, $r.latency_ms, $r.status)
$results += $r
Write-Host ""

# --- HTTP PROXY CANDIDATES ---
Write-Host "--- HTTP PROXY CANDIDATES ---" -ForegroundColor Yellow
$httpCandidates = @(
    "http://127.0.0.1:10809",
    "http://127.0.0.1:7890",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:2080"
)
if ($PHONE_GATEWAY) {
    $httpCandidates += "http://${PHONE_GATEWAY}:10809"
    $httpCandidates += "http://${PHONE_GATEWAY}:7890"
    $httpCandidates += "http://${PHONE_GATEWAY}:8080"
    $httpCandidates += "http://${PHONE_GATEWAY}:2080"
}
foreach ($p in $httpCandidates) {
    $r = Probe-Route $p @("-I", $TARGET, "--max-time", "$TIMEOUT", "-sS", "-x", $p)
    Write-Host ("{0,-45} ok={1,-3} latency={2}ms  status={3}" -f $r.route, $r.ok, $r.latency_ms, $r.status)
    $results += $r
}
Write-Host ""

# --- SOCKS PROXY CANDIDATES ---
Write-Host "--- SOCKS PROXY CANDIDATES ---" -ForegroundColor Yellow
$socksCandidates = @(
    "socks5h://127.0.0.1:10808",
    "socks5h://127.0.0.1:7891",
    "socks5h://127.0.0.1:2081"
)
if ($PHONE_GATEWAY) {
    $socksCandidates += "socks5h://${PHONE_GATEWAY}:10808"
    $socksCandidates += "socks5h://${PHONE_GATEWAY}:7891"
    $socksCandidates += "socks5h://${PHONE_GATEWAY}:2081"
}
foreach ($p in $socksCandidates) {
    $r = Probe-Route $p @("-I", $TARGET, "--max-time", "$TIMEOUT", "-sS", "--proxy", $p)
    Write-Host ("{0,-45} ok={1,-3} latency={2}ms  status={3}" -f $r.route, $r.ok, $r.latency_ms, $r.status)
    $results += $r
}
Write-Host ""

# --- SUMMARY ---
Write-Host "--- SUMMARY ---" -ForegroundColor Cyan
$working = $results | Where-Object { $_.ok -eq "yes" }
if ($working) {
    Write-Host ("WORKING ROUTES FOUND: " + $working.Count) -ForegroundColor Green
    foreach ($w in $working) {
        Write-Host ("  - {0}  ({1}ms)  {2}" -f $w.route, $w.latency_ms, $w.status) -ForegroundColor Green
    }
} else {
    Write-Host "NO WORKING ROUTE FOUND" -ForegroundColor Red
}

# Save JSON
$jsonPath = "D:\AI_WORKSPACE\tools\telegram_gateway\_route_probe_2026-05-28.json"
$results | ConvertTo-Json -Depth 4 | Out-File -FilePath $jsonPath -Encoding UTF8
Write-Host ""
Write-Host "Saved: $jsonPath" -ForegroundColor Gray
