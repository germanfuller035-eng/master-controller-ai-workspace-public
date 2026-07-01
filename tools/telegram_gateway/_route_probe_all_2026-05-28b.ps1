# Probes Telegram API routes (direct + proxy candidates) WITHOUT printing any token.
# Writes results to a JSON file. No bot, no restart, no secrets.

$ErrorActionPreference = 'Continue'
$out = [ordered]@{
  timestamp = (Get-Date).ToString('o')
  direct    = $null
  gateway   = $null
  http_probes  = @()
  socks_probes = @()
}

function Probe-Http([string]$proxy) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    if ([string]::IsNullOrEmpty($proxy)) {
      $res = & curl.exe -I -s -o NUL -w "%{http_code}" --max-time 10 https://api.telegram.org/ 2>&1
    } else {
      $res = & curl.exe -I -s -o NUL -w "%{http_code}" --max-time 10 -x $proxy https://api.telegram.org/ 2>&1
    }
    $sw.Stop()
    $code = "$res".Trim()
    return [ordered]@{ proxy=$proxy; http_code=$code; latency_ms=$sw.ElapsedMilliseconds; ok = ($code -match '^[1-5]\d\d$' -and $code -ne '000') }
  } catch {
    $sw.Stop()
    return [ordered]@{ proxy=$proxy; http_code='ERR'; error="$($_.Exception.Message)"; latency_ms=$sw.ElapsedMilliseconds; ok=$false }
  }
}

function Probe-Socks([string]$proxy) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    # curl supports socks5:// via --proxy
    $res = & curl.exe -I -s -o NUL -w "%{http_code}" --max-time 10 --proxy $proxy https://api.telegram.org/ 2>&1
    $sw.Stop()
    $code = "$res".Trim()
    return [ordered]@{ proxy=$proxy; http_code=$code; latency_ms=$sw.ElapsedMilliseconds; ok = ($code -match '^[1-5]\d\d$' -and $code -ne '000') }
  } catch {
    $sw.Stop()
    return [ordered]@{ proxy=$proxy; http_code='ERR'; error="$($_.Exception.Message)"; latency_ms=$sw.ElapsedMilliseconds; ok=$false }
  }
}

# 1) Direct
$out.direct = Probe-Http $null

# 2) Determine default gateway
$gw = $null
try {
  $r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object -Property RouteMetric,InterfaceMetric | Select-Object -First 1
  if ($r) { $gw = $r.NextHop }
} catch {}
if (-not $gw) {
  try {
    $ipc = ipconfig | Out-String
    $m = [regex]::Match($ipc,'Default Gateway[^\:]*:\s*([0-9\.]+)')
    if ($m.Success) { $gw = $m.Groups[1].Value }
  } catch {}
}
$out.gateway = $gw

# 3) HTTP proxy candidates
$httpPorts = @(10809,7890,8080,2080)
foreach ($p in $httpPorts) { $out.http_probes += (Probe-Http ("http://127.0.0.1:" + $p)) }
if ($gw) {
  foreach ($p in $httpPorts) { $out.http_probes += (Probe-Http ("http://" + $gw + ":" + $p)) }
}

# 4) SOCKS proxy candidates
$socksPorts = @(10808,7891,2081)
foreach ($p in $socksPorts) { $out.socks_probes += (Probe-Socks ("socks5://127.0.0.1:" + $p)) }
if ($gw) {
  foreach ($p in $socksPorts) { $out.socks_probes += (Probe-Socks ("socks5://" + $gw + ":" + $p)) }
}

$outPath = 'D:\AI_WORKSPACE\tools\telegram_gateway\_route_probe_all_2026-05-28_result.json'
$out | ConvertTo-Json -Depth 6 | Out-File -FilePath $outPath -Encoding utf8 -Force
Write-Host ("WROTE " + $outPath)
Write-Host ("direct_ok=" + $out.direct.ok + " direct_code=" + $out.direct.http_code + " gw=" + $gw)
$any = $false
foreach ($x in $out.http_probes) { if ($x.ok) { $any = $true; Write-Host ("HTTP_OK " + $x.proxy + " code=" + $x.http_code + " " + $x.latency_ms + "ms") } }
foreach ($x in $out.socks_probes) { if ($x.ok) { $any = $true; Write-Host ("SOCKS_OK " + $x.proxy + " code=" + $x.http_code + " " + $x.latency_ms + "ms") } }
if (-not $any) { Write-Host "NO_WORKING_ROUTE" }
