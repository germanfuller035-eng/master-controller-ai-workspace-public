# =============================================================
# start_master_bot.ps1 — Telegram Master Controller launcher
# Steps: 1..9 preflight + bot launch
#
# Preflight [2/9] uses find_telegram_pollers.ps1 -Json
# (JSON mode) — NO false positives from text headers.
# =============================================================

$ErrorActionPreference = 'SilentlyContinue'

# ---- UTF-8 console ----
try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}
try { chcp 65001 | Out-Null } catch {}

$BOT_DIR    = $PSScriptRoot
$BOT_SCRIPT = Join-Path $BOT_DIR "telegram_master_bot.mjs"
$LOCK_FILE  = Join-Path $BOT_DIR ".telegram_master_bot.lock"
$PID_FILE   = Join-Path $BOT_DIR ".telegram_master_bot.pid"
$LOG_DIR    = Join-Path $BOT_DIR "logs"
$LOG_FILE   = Join-Path $LOG_DIR "start_master_bot.log"
$DATA_DIR   = Join-Path $BOT_DIR "data"
$HB_FILE    = Join-Path $DATA_DIR "bot_heartbeat.json"

# ---- CANONICAL WRITER GUARD (Release 2 cutover) ----
# Refuse to start the local direct-file writer while the VPS owns canonical state.
$MARKER = Join-Path $BOT_DIR ".canonical_writer_location"
if (Test-Path $MARKER) {
    $loc = (Get-Content $MARKER -ErrorAction SilentlyContinue | Where-Object { $_ -and -not $_.StartsWith('#') } | Select-Object -First 1)
    if ($loc -and $loc.Trim().ToUpper() -ne 'LOCAL') {
        Write-Host "LOCAL_PRODUCTION_START_ATTEMPT -> refused"
        Write-Host "reason=VPS_CANONICAL_WRITER_ACTIVE (marker=$($loc.Trim()))"
        exit 2
    }
}


if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Force -Path $LOG_DIR | Out-Null }
if (-not (Test-Path $DATA_DIR)) { New-Item -ItemType Directory -Force -Path $DATA_DIR | Out-Null }

$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Log($msg) {
    $line = "[$ts] $msg"
    Add-Content -Path $LOG_FILE -Value $line -ErrorAction SilentlyContinue
    Write-Host $line
}

function Step($n, $total, $desc) {
    Write-Host ""
    Write-Host "  [$n/$total] $desc" -ForegroundColor Cyan
}

function OK($msg)   { Write-Host "    [OK]  $msg" -ForegroundColor Green }
function FAIL($msg) { Write-Host "    [RED] $msg" -ForegroundColor Red }
function WARN($msg) { Write-Host "    [YEL] $msg" -ForegroundColor DarkYellow }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  START MASTER BOT  [$ts]" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Log "start_master_bot.ps1 started"

# ============================================================
# [1/9] Check bot script exists
# ============================================================
Step 1 9 "Checking telegram_master_bot.mjs..."
if (-not (Test-Path $BOT_SCRIPT)) {
    FAIL "telegram_master_bot.mjs NOT FOUND: $BOT_SCRIPT"
    Log "ABORT: telegram_master_bot.mjs not found"
    exit 1
}
OK "telegram_master_bot.mjs found"

# ============================================================
# [2/9] Preflight: check for conflicting Telegram pollers (JSON mode)
# ============================================================
Step 2 9 "Preflight: checking for conflicting Telegram pollers..."

$pollerScript = Join-Path $BOT_DIR "find_telegram_pollers.ps1"
$pollers = $null
$pollerError = $null

if (-not (Test-Path $pollerScript)) {
    WARN "find_telegram_pollers.ps1 not found — skipping poller check"
    Log "WARN: find_telegram_pollers.ps1 not found, skipping"
} else {
    try {
        # ---- JSON MODE ONLY — no text parsing, no false positives ----
        $rawJson = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $pollerScript -Json 2>&1
        $jsonText = ($rawJson | Where-Object { $_ -is [string] }) -join "`n"

        # Strip any accidental non-JSON prefix lines
        $firstBrace = $jsonText.IndexOf('{')
        if ($firstBrace -gt 0) { $jsonText = $jsonText.Substring($firstBrace) }

        $pollers = $jsonText | ConvertFrom-Json
    } catch {
        $pollerError = "$_"
    }

    if ($pollerError) {
        WARN "Could not parse pollers JSON: $pollerError"
        WARN "Skipping poller check — proceeding cautiously"
        Log "WARN: pollers JSON parse error: $pollerError"
    } elseif ($null -eq $pollers) {
        WARN "Pollers JSON returned null — skipping check"
        Log "WARN: pollers null"
    } else {
        $suspCount = [int]$pollers.suspicious_count
        $allCount  = [int]$pollers.all_node_count

        if ($suspCount -gt 0) {
            FAIL "Suspicious Telegram polling process(es) detected! suspicious_count=$suspCount"
            Log "ABORT: suspicious_count=$suspCount"
            Write-Host ""
            Write-Host "  Conflicting processes:" -ForegroundColor Red
            foreach ($sp in $pollers.suspicious) {
                Write-Host "    PID: $($sp.pid)  CMD: $($sp.command_line)" -ForegroundColor Red
            }
            Write-Host ""
            Write-Host "  Run first:" -ForegroundColor Yellow
            Write-Host "    powershell -ExecutionPolicy Bypass -File .\stop_master_bot.ps1 -Deep" -ForegroundColor White
            exit 1
        } else {
            OK "Preflight pollers: OK  suspicious_count=$suspCount  all_node=$allCount"
            Log "Preflight pollers OK suspicious_count=$suspCount all_node=$allCount"
        }
    }
}

# ============================================================
# [3/9] Check .env token
# ============================================================
Step 3 9 "Checking .env / TELEGRAM_BOT_TOKEN..."
$envFile = Join-Path $BOT_DIR ".env"
if (-not (Test-Path $envFile)) {
    FAIL ".env not found: $envFile"
    Log "ABORT: .env not found"
    exit 1
}
$envContent = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
if ($envContent -match "TELEGRAM_BOT_TOKEN\s*=\s*([^\s#\r\n]+)") {
    $tok = $Matches[1]
    if ($tok -eq "PASTE_YOUR_BOTFATHER_TOKEN_HERE" -or $tok.Length -lt 10) {
        FAIL "TELEGRAM_BOT_TOKEN is a placeholder — set real token in .env"
        Log "ABORT: token placeholder"
        exit 1
    }
    OK "TELEGRAM_BOT_TOKEN: present (value hidden)"
    Log "Token present"

    # ---- [3b] Webhook state preflight ----
    # Active webhook blocks long-polling (Telegram 409). Check and warn before launch.
    Write-Host "    [3b] Webhook state: querying getWebhookInfo..." -ForegroundColor DarkGray
    try {
        $whUri  = "https://api.telegram.org/bot$($tok)/getWebhookInfo"
        $whResp = Invoke-WebRequest -Uri $whUri -UseBasicParsing -TimeoutSec 6 -ErrorAction Stop
        $whJson = $whResp.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($whJson -and $whJson.result.url -and $whJson.result.url -ne '') {
            WARN "Webhook ACTIVE: $($whJson.result.url)"
            WARN "Active webhook may conflict with long polling — bot handles 409 automatically"
            Log "WARN: webhook active url=$($whJson.result.url)"
        } else {
            OK "Webhook: inactive — long-polling safe"
            Log "Webhook inactive"
        }
    } catch {
        Write-Host "    [3b] Webhook check skipped (network unavailable: $($_.Exception.Message.Split("`n")[0]))" -ForegroundColor DarkGray
        Log "Webhook check skipped: $($_.Exception.Message.Split("`n")[0])"
    }
} else {
    FAIL "TELEGRAM_BOT_TOKEN not found in .env"
    Log "ABORT: token not in .env"
    exit 1
}

# ============================================================
# [4/9] Check lock file (stale lock guard)
# ============================================================
Step 4 9 "Checking for stale lock..."
if (Test-Path $LOCK_FILE) {
    $lockPid = $null
    try {
        $lockObj = Get-Content $LOCK_FILE -Raw | ConvertFrom-Json
        $lockPid = $lockObj.pid
    } catch {}

    if ($lockPid) {
        $liveProc = Get-Process -Id $lockPid -ErrorAction SilentlyContinue
        if ($liveProc) {
            FAIL "Lock file exists and PID $lockPid is ALIVE — bot already running!"
            Log "ABORT: PID $lockPid alive, lock present"
            Write-Host "  Run: powershell -ExecutionPolicy Bypass -File .\stop_master_bot.ps1 -Deep" -ForegroundColor Yellow
            exit 1
        } else {
            WARN "Stale lock found (PID $lockPid dead) — removing"
            Remove-Item -Path $LOCK_FILE -Force -ErrorAction SilentlyContinue
            Log "Removed stale lock PID=$lockPid"
        }
    } else {
        WARN "Lock file unreadable — removing it"
        Remove-Item -Path $LOCK_FILE -Force -ErrorAction SilentlyContinue
        Log "Removed unreadable lock"
    }
} else {
    OK "No lock file — clean start"
}

# ============================================================
# [5/9] Check for existing telegram_master_bot.mjs process
# ============================================================
Step 5 9 "Checking for existing bot process..."
$existingBotProcs = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -imatch 'telegram_master_bot\.mjs' })

if ($existingBotProcs.Count -gt 0) {
    FAIL "telegram_master_bot.mjs already running (count=$($existingBotProcs.Count))"
    foreach ($ep in $existingBotProcs) {
        Write-Host "    PID: $($ep.ProcessId)" -ForegroundColor Red
    }
    Log "ABORT: bot already running count=$($existingBotProcs.Count)"
    exit 1
} else {
    OK "No existing bot process — safe to start"
}

# ============================================================
# [6/9] Check node.exe availability
# ============================================================
Step 6 9 "Checking node.exe..."
$nodeVer = & node --version 2>&1
if ($LASTEXITCODE -ne 0 -or -not $nodeVer) {
    FAIL "node.exe not found or not working"
    Log "ABORT: node not available"
    exit 1
}
OK "node $nodeVer"

# ============================================================
# [7/9] Check data directory
# ============================================================
Step 7 9 "Checking data directory..."
$DLF_DATA = "D:\AI_WORKSPACE\13_sales\daily_lead_factory\data"
$dailyReport = Join-Path $DLF_DATA "daily_report.json"
if (Test-Path $dailyReport) {
    OK "daily_report.json exists"
} else {
    WARN "daily_report.json not found at $dailyReport (bot creates it on first run)"
}

# ============================================================
# [8/9] Write lock file
# ============================================================
Step 8 9 "Writing lock file..."
$lockData = [PSCustomObject]@{
    pid        = $PID
    started_at = (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz')
    script_path = $BOT_SCRIPT
    host       = $env:COMPUTERNAME
}
try {
    $lockData | ConvertTo-Json -Depth 3 | Set-Content -Path $LOCK_FILE -Encoding UTF8
    OK "Lock written: $LOCK_FILE"
    Log "Lock written PID=$PID"
} catch {
    WARN "Could not write lock: $_"
}

# ============================================================
# [9/9] Launch bot
# ============================================================
Step 9 9 "Launching telegram_master_bot.mjs..."
Write-Host ""
Write-Host "  [STARTING]  node $BOT_SCRIPT" -ForegroundColor Green
Log "Launching node $BOT_SCRIPT"

Set-Location $BOT_DIR

# Launch detached in background so this script can monitor briefly
$proc = Start-Process -FilePath "node" `
    -ArgumentList "`"$BOT_SCRIPT`"" `
    -WorkingDirectory $BOT_DIR `
    -PassThru `
    -WindowStyle Hidden

if (-not $proc -or $proc.Id -le 0) {
    FAIL "Failed to start node process"
    Log "ABORT: Start-Process failed"
    Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue
    exit 1
}

$botPid = $proc.Id
OK "Bot started! PID: $botPid"
Log "Bot started PID=$botPid"

# Update lock with real PID
$lockData.pid = $botPid
try {
    $lockData | ConvertTo-Json -Depth 3 | Set-Content -Path $LOCK_FILE -Encoding UTF8
} catch {}

# Save PID file
try {
    $botPid | Set-Content -Path $PID_FILE -Encoding UTF8
} catch {}

# Brief wait to confirm process is still alive
Start-Sleep -Seconds 3
$stillAlive = Get-Process -Id $botPid -ErrorAction SilentlyContinue
if ($stillAlive) {
    Write-Host ""
    OK "Process confirmed alive after 3s — bot is running."
    Log "Confirmed alive PID=$botPid"
} else {
    Write-Host ""
    FAIL "Process died within 3s — check logs:"
    Write-Host "    $LOG_DIR\telegram_master_bot.log" -ForegroundColor Yellow
    Log "WARN: process died within 3s PID=$botPid"
    Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue
    Remove-Item $PID_FILE  -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  LAUNCH COMPLETE" -ForegroundColor Cyan
Write-Host "  PID:         $botPid" -ForegroundColor White
Write-Host "  Log:         $LOG_DIR\telegram_master_bot.log" -ForegroundColor White
Write-Host "  Heartbeat:   $HB_FILE" -ForegroundColor White
Write-Host ""
Write-Host "  Monitor:   .\check_master_bot.ps1" -ForegroundColor Cyan
Write-Host "  Watchdog:  .\watch_master_bot.ps1" -ForegroundColor Cyan
Write-Host "  Stop:      .\stop_master_bot.ps1 -Deep" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""
Log "start_master_bot.ps1 done PID=$botPid"
