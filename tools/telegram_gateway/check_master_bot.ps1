# =============================================================
# check_master_bot.ps1 — Telegram Master Bot health check
#
# Checks:
#   1. Node process (telegram_master_bot.mjs)
#   2. Lock file
#   3. Heartbeat (with STOPPED / STALE detection)
#   4. Telegram network (DNS, TCP 443)
#   5. Telegram API getMe (via telegram_api_diagnostics.mjs)
#
# STOPPED/STALE HEARTBEAT logic:
#   - Process count = 0 AND lock absent AND heartbeat age > 90s
#     => [STOPPED] / [STALE HEARTBEAT] — not shown as "active running"
# =============================================================

$ErrorActionPreference = 'SilentlyContinue'

# ---- UTF-8 console ----
try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}
try { chcp 65001 | Out-Null } catch {}

$scriptDir  = $PSScriptRoot
$lockFile   = Join-Path $scriptDir ".telegram_master_bot.lock"
$pidFile    = Join-Path $scriptDir ".telegram_master_bot.pid"
$dataDir    = Join-Path $scriptDir "data"
$hbFile     = Join-Path $dataDir "bot_heartbeat.json"
$diagScript = Join-Path $scriptDir "telegram_api_diagnostics.mjs"

$HB_STALE_THRESHOLD_SEC = 90
$ts  = Get-Date
$tsStr = $ts.ToString("yyyy-MM-dd HH:mm:ss")

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CHECK MASTER BOT  [$tsStr]" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ============================================================
# [1] Process check
# ============================================================
Write-Host ""
Write-Host "[ Process: telegram_master_bot.mjs ]" -ForegroundColor Yellow

$botProcs = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -imatch 'telegram_master_bot\.mjs' })

$procCount = $botProcs.Count
if ($procCount -gt 0) {
    foreach ($bp in $botProcs) {
        Write-Host "  [OK] RUNNING  PID: $($bp.ProcessId)  Created: $($bp.CreationDate)" -ForegroundColor Green
    }
} else {
    Write-Host "  [--] process count: 0  (not running)" -ForegroundColor DarkYellow
}

# ============================================================
# [2] Lock file check
# ============================================================
Write-Host ""
Write-Host "[ Lock file ]" -ForegroundColor Yellow

$lockExists = Test-Path $lockFile
if ($lockExists) {
    try {
        $lockObj = Get-Content $lockFile -Raw | ConvertFrom-Json
        Write-Host "  [LOCK] Present  PID: $($lockObj.pid)  Started: $($lockObj.started_at)" -ForegroundColor DarkYellow
    } catch {
        Write-Host "  [LOCK] Present (unreadable)" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  [OK]  No lock file (clean)" -ForegroundColor Green
}

# ============================================================
# [3] Heartbeat check — with STOPPED / STALE HEARTBEAT logic
# ============================================================
Write-Host ""
Write-Host "[ Heartbeat: bot_heartbeat.json ]" -ForegroundColor Yellow

$hbStatus         = "unknown"
$hbPolling        = $false
$hbAgeSec         = $null
$hbIsStale        = $false
$hbIsMarkedStopped = $false

if (-not (Test-Path $hbFile)) {
    Write-Host "  [--] bot_heartbeat.json NOT FOUND" -ForegroundColor DarkYellow
    $hbStatus = "no_heartbeat"
} else {
    try {
        $hb = Get-Content $hbFile -Raw | ConvertFrom-Json

        # Determine age
        $hbAtStr = $hb.last_heartbeat_at
        if (-not $hbAtStr) { $hbAtStr = $hb.last_update_at }
        if (-not $hbAtStr) { $hbAtStr = $hb.stopped_at }

        if ($hbAtStr) {
            try {
                $hbTime = [DateTimeOffset]::Parse($hbAtStr)
                $hbAgeSec = ($ts - $hbTime.LocalDateTime).TotalSeconds
            } catch {
                $hbAgeSec = $null
            }
        }

        $hbStatus  = if ($hb.status)  { $hb.status }  else { "unknown" }
        $hbPolling = if ($null -ne $hb.polling) { [bool]$hb.polling } else { $false }
        $hbIsMarkedStopped = ($hbStatus -eq "stopped")

        # --- STOPPED / STALE HEARTBEAT detection ---
        if ($procCount -eq 0 -and -not $lockExists) {
            # Process is definitely not running
            if ($hbIsMarkedStopped) {
                Write-Host "  [STOPPED] Bot not running. Heartbeat is marked stopped." -ForegroundColor DarkYellow
                Write-Host "  status    = stopped" -ForegroundColor DarkYellow
                Write-Host "  polling   = false"   -ForegroundColor DarkYellow
                if ($hb.stopped_at) {
                    Write-Host "  stopped_at = $($hb.stopped_at)" -ForegroundColor DarkYellow
                }
                if ($hb.stop_reason) {
                    Write-Host "  stop_reason = $($hb.stop_reason)" -ForegroundColor DarkYellow
                }
                Write-Host ""
                Write-Host "  Resolution:" -ForegroundColor Cyan
                Write-Host "    powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1" -ForegroundColor White
                $hbStatus = "stopped"
            } elseif ($hbAgeSec -ne $null -and $hbAgeSec -gt $HB_STALE_THRESHOLD_SEC) {
                $hbIsStale = $true
                $ageMin = [math]::Round($hbAgeSec / 60, 1)
                Write-Host "  [STOPPED]        Bot not running."               -ForegroundColor Red
                Write-Host "  [STALE HEARTBEAT] Old heartbeat from previous run." -ForegroundColor DarkYellow
                Write-Host "  polling   = false"    -ForegroundColor DarkYellow
                Write-Host "  status    = stopped/stale" -ForegroundColor DarkYellow
                Write-Host "  age       = ${ageMin} min (threshold: ${HB_STALE_THRESHOLD_SEC}s)" -ForegroundColor DarkYellow
                if ($hbAtStr) {
                    Write-Host "  last_hb   = $hbAtStr" -ForegroundColor DarkYellow
                }
                Write-Host ""
                Write-Host "  Resolution:" -ForegroundColor Cyan
                Write-Host "    powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1" -ForegroundColor White
                $hbStatus = "stopped/stale"
                $hbPolling = $false
            } else {
                # Process 0, no lock, heartbeat exists but recent (just stopped?)
                $ageStr = if ($hbAgeSec -ne $null) { "$([math]::Round($hbAgeSec,0))s ago" } else { "(unknown age)" }
                Write-Host "  [STOPPED] Bot process not running. Recent heartbeat: $ageStr" -ForegroundColor DarkYellow
                Write-Host "  status    = stopped" -ForegroundColor DarkYellow
                Write-Host "  polling   = false"   -ForegroundColor DarkYellow
                Write-Host ""
                Write-Host "  Resolution:" -ForegroundColor Cyan
                Write-Host "    powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1" -ForegroundColor White
                $hbStatus = "stopped"
                $hbPolling = $false
            }
        } else {
            # Process IS running — show normal heartbeat
            $ageStr = if ($hbAgeSec -ne $null) { "$([math]::Round($hbAgeSec,0))s ago" } else { "(unknown age)" }
            $freshColor = if ($hbAgeSec -ne $null -and $hbAgeSec -lt $HB_STALE_THRESHOLD_SEC) { "Green" } else { "DarkYellow" }

            Write-Host "  status    = $hbStatus"  -ForegroundColor $freshColor
            Write-Host "  polling   = $hbPolling" -ForegroundColor $freshColor
            Write-Host "  last_hb   = $hbAtStr ($ageStr)" -ForegroundColor $freshColor

            if ($hbAgeSec -ne $null -and $hbAgeSec -gt $HB_STALE_THRESHOLD_SEC) {
                Write-Host ""
                Write-Host "  [WARN] Heartbeat is older than ${HB_STALE_THRESHOLD_SEC}s — bot may be hung!" -ForegroundColor DarkYellow
            }
        }
    } catch {
        Write-Host "  [ERR] Could not parse bot_heartbeat.json: $_" -ForegroundColor Red
        $hbStatus = "parse_error"
    }
}

# ============================================================
# [4] Telegram Network diagnostics
# ============================================================
Write-Host ""
Write-Host "[ Telegram Network ]" -ForegroundColor Yellow

# 4a: DNS resolve
$dnsOk = $false
try {
    $dnsResult = [System.Net.Dns]::GetHostAddresses("api.telegram.org")
    if ($dnsResult -and $dnsResult.Count -gt 0) {
        $ipStr = ($dnsResult | Select-Object -First 3 | ForEach-Object { $_.ToString() }) -join ", "
        Write-Host "  [OK]  DNS  api.telegram.org -> $ipStr" -ForegroundColor Green
        $dnsOk = $true
    } else {
        Write-Host "  [YEL] DNS  api.telegram.org -> resolved but no IPs" -ForegroundColor DarkYellow
    }
} catch {
    Write-Host "  [RED] DNS  api.telegram.org -> FAILED: $_" -ForegroundColor Red
}

# 4b: TCP 443 connectivity
$tcpOk = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $task = $tcp.ConnectAsync("api.telegram.org", 443)
    $connected = $task.Wait(5000)   # 5 second timeout
    if ($connected -and $tcp.Connected) {
        Write-Host "  [OK]  TCP  api.telegram.org:443 -> Connected" -ForegroundColor Green
        $tcpOk = $true
    } else {
        Write-Host "  [YEL] TCP  api.telegram.org:443 -> Timeout (5s)" -ForegroundColor DarkYellow
    }
    $tcp.Close()
} catch {
    $errMsg = "$_" -replace '\d{7,12}:[A-Za-z0-9_-]{30,}', '[TOKEN_HIDDEN]'
    Write-Host "  [RED] TCP  api.telegram.org:443 -> FAILED: $errMsg" -ForegroundColor Red
}

# 4c: Summary network line
if ($dnsOk -and $tcpOk) {
    Write-Host "  [OK]  Network connectivity to Telegram: HEALTHY" -ForegroundColor Green
} elseif ($dnsOk -and -not $tcpOk) {
    Write-Host "  [YEL] DNS ok but TCP failed — check firewall/proxy" -ForegroundColor DarkYellow
} else {
    Write-Host "  [RED] No network access to api.telegram.org" -ForegroundColor Red
    Write-Host "        Recent errors: ENOTFOUND / ECONNRESET / ETIMEDOUT may occur" -ForegroundColor DarkYellow
}

# ============================================================
# [5] Telegram API getMe
# ============================================================
Write-Host ""
Write-Host "[ Telegram API: getMe ]" -ForegroundColor Yellow

if (Test-Path $diagScript) {
    try {
        $diagOut = & node $diagScript 2>&1
        $diagLines = $diagOut | Where-Object { "$_" -notmatch '\d{7,12}:[A-Za-z0-9_-]{30,}' }
        foreach ($line in $diagLines) {
            $lineStr = "$line"
            if ($lineStr -imatch "ok|success|getme.*true|bot.*username") {
                Write-Host "  [OK]  $lineStr" -ForegroundColor Green
            } elseif ($lineStr -imatch "error|fail|enotfound|econnreset|etimedout|hang") {
                Write-Host "  [RED] $lineStr" -ForegroundColor Red
            } elseif ($lineStr.Trim()) {
                Write-Host "  [--]  $lineStr" -ForegroundColor Gray
            }
        }
    } catch {
        Write-Host "  [YEL] telegram_api_diagnostics.mjs error: $_" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  [YEL] telegram_api_diagnostics.mjs not found — skipping API check" -ForegroundColor DarkYellow
}

# ============================================================
# Summary
# ============================================================
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  processes telegram_master_bot.mjs : $procCount"
Write-Host "  lock present                       : $lockExists"
Write-Host "  heartbeat status                   : $hbStatus"
Write-Host "  heartbeat polling                  : $hbPolling"
Write-Host "  network DNS ok                     : $dnsOk"
Write-Host "  network TCP 443 ok                 : $tcpOk"

if ($procCount -gt 0 -and $hbPolling) {
    Write-Host ""
    Write-Host "  [RUNNING & POLLING]  Bot is ACTIVE." -ForegroundColor Green
} elseif ($procCount -gt 0 -and -not $hbPolling) {
    Write-Host ""
    Write-Host "  [RUNNING / NOT POLLING]  Bot process alive but polling=false." -ForegroundColor DarkYellow
} elseif ($hbIsStale) {
    Write-Host ""
    Write-Host "  [STOPPED / STALE HEARTBEAT]  Old heartbeat leftover. Bot is NOT running." -ForegroundColor Red
    Write-Host "  Start: powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "  [STOPPED]  Bot is NOT running." -ForegroundColor DarkYellow
    Write-Host "  Start: powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1" -ForegroundColor Cyan
}

Write-Host ""
