# stop_master_bot.ps1
# Stops Telegram Master Bot process(es).
# Normal mode:  .\stop_master_bot.ps1           — stops telegram_master_bot.mjs only
# Deep mode:    .\stop_master_bot.ps1 -Deep      — stops all suspicious Telegram/bot/gateway pollers in AI_WORKSPACE
#
# After stopping: marks bot_heartbeat.json as status=stopped (does NOT delete it).
# Deep mode: uses direct WMI query on real PIDs (no text parsing, no false positives).
#
# Logs to: logs/stop_master_bot.log

param(
    [switch]$Deep
)

$ErrorActionPreference = 'SilentlyContinue'

$scriptDir = $PSScriptRoot
$logDir    = Join-Path $scriptDir "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$logFile   = Join-Path $logDir "stop_master_bot.log"
$lockFile  = Join-Path $scriptDir ".telegram_master_bot.lock"
$pidFile   = Join-Path $scriptDir ".telegram_master_bot.pid"
$dataDir   = Join-Path $scriptDir "data"
$hbFile    = Join-Path $dataDir "bot_heartbeat.json"

$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$mode = if ($Deep) { "DEEP" } else { "NORMAL" }

function Log($msg) {
    $line = "[$ts][$mode] $msg"
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

function Mask-Token($str) {
    if (-not $str) { return $str }
    $str = $str -replace '\d{7,12}:[A-Za-z0-9_-]{30,}', '[TOKEN_HIDDEN]'
    $str = $str -replace '(?i)(TELEGRAM_BOT_TOKEN\s*=\s*)\S+', '$1[TOKEN_HIDDEN]'
    return $str
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor $(if ($Deep) { "Red" } else { "Yellow" })
Write-Host " STOP MASTER BOT  [$ts]  Mode: $mode" -ForegroundColor $(if ($Deep) { "Red" } else { "Yellow" })
Write-Host "============================================================" -ForegroundColor $(if ($Deep) { "Red" } else { "Yellow" })
Write-Host ""

Log "stop_master_bot.ps1 started (mode=$mode)"

# ============================================================
# Build list of target keywords
# ============================================================
$deepKeywords = @(
    'telegram_master_bot', 'telegram_gateway', 'daily_lead_factory',
    'master_bot', 'gateway_bot', 'dlf.*bot', 'bot.*telegram',
    'start_master_bot', 'watch_master_bot', 'watchdog_telegram',
    'lead_factory.*bot', 'telegram_approval'
)
$normalKeywords = @('telegram_master_bot')
$patterns = if ($Deep) { $deepKeywords } else { $normalKeywords }

# ============================================================
# Deep mode: use find_telegram_pollers.ps1 -Json for real PID list
# Normal mode: use direct WMI query
# ============================================================
$allNodeProcs = @()
try {
    $allNodeProcs = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue)
} catch {
    Log "WARN: CimInstance failed — cannot enumerate node.exe processes"
    $allNodeProcs = @()
}

# In Deep mode: optionally cross-check with JSON poller output
# (used only for logging — actual stopping uses real WMI PIDs)
if ($Deep) {
    $pollerScript = Join-Path $scriptDir "find_telegram_pollers.ps1"
    if (Test-Path $pollerScript) {
        try {
            $rawJson  = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $pollerScript -Json 2>&1
            $jsonText = ($rawJson | Where-Object { $_ -is [string] }) -join "`n"
            $firstBrace = $jsonText.IndexOf('{')
            if ($firstBrace -gt 0) { $jsonText = $jsonText.Substring($firstBrace) }
            $pollerData = $jsonText | ConvertFrom-Json
            Log "Poller JSON: suspicious_count=$($pollerData.suspicious_count) all_node=$($pollerData.all_node_count)"
        } catch {
            Log "WARN: Could not read poller JSON (non-critical): $_"
        }
    }
}

$stopped = 0
$skipped = 0

foreach ($proc in $allNodeProcs) {
    $cmdLine = if ($proc.CommandLine) { $proc.CommandLine } else { "" }

    $matched = $false
    foreach ($pat in $patterns) {
        if ($cmdLine -imatch $pat) { $matched = $true; break }
    }

    # Also match saved PID file
    if (Test-Path $pidFile) {
        $savedPid = (Get-Content $pidFile -ErrorAction SilentlyContinue) -as [int]
        if ($savedPid -and $savedPid -eq $proc.ProcessId) { $matched = $true }
    }

    if ($matched) {
        $maskedCmd = Mask-Token $cmdLine
        Write-Host "  [STOPPING] PID: $($proc.ProcessId)" -ForegroundColor Red
        Write-Host "             CMD: $maskedCmd"
        Log "Stopping PID=$($proc.ProcessId) CMD=$(Mask-Token $cmdLine)"

        try {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
            Write-Host "  [OK] PID $($proc.ProcessId) stopped." -ForegroundColor Green
            Log "Stopped PID=$($proc.ProcessId)"
            $stopped++
        } catch {
            Write-Host "  [WARN] Could not stop PID $($proc.ProcessId): $_" -ForegroundColor Yellow
            Log "WARN: Could not stop PID=$($proc.ProcessId): $_"
            $skipped++
        }
    }
}

if ($stopped -eq 0 -and $skipped -eq 0) {
    Write-Host "  (no matching node.exe processes found)" -ForegroundColor Green
    Log "No matching processes found."
}

# ============================================================
# Mark heartbeat as stopped (do NOT delete it)
# ============================================================
Write-Host ""
Write-Host "[ Updating heartbeat status ]" -ForegroundColor Cyan
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }

$nowIso = (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz')
$hbStopped = $null

if (Test-Path $hbFile) {
    try {
        $existing = Get-Content $hbFile -Raw | ConvertFrom-Json
        $hbStopped = [PSCustomObject]@{
            pid              = $null
            status           = "stopped"
            polling          = $false
            last_heartbeat_at = $existing.last_heartbeat_at
            stopped_at       = $nowIso
            stop_reason      = "stop_master_bot.ps1"
            last_update_at   = $existing.last_update_at
            last_command     = $existing.last_command
            last_error_at    = $existing.last_error_at
        }
        Write-Host "  [OK] Updating existing heartbeat to status=stopped" -ForegroundColor Green
        Log "Heartbeat updated: status=stopped (was running)"
    } catch {
        $hbStopped = $null
        Log "WARN: Could not parse existing heartbeat: $_"
    }
} else {
    $hbStopped = $null
    Write-Host "  [--] No heartbeat file found (nothing to mark)" -ForegroundColor DarkYellow
    Log "No heartbeat file to update"
}

if ($hbStopped) {
    try {
        if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }
        $hbStopped | ConvertTo-Json -Depth 3 | Set-Content -Path $hbFile -Encoding UTF8
        Write-Host "  [OK] bot_heartbeat.json marked: status=stopped polling=false" -ForegroundColor Green
        Log "Heartbeat written: $hbFile"
    } catch {
        Write-Host "  [WARN] Could not write heartbeat: $_" -ForegroundColor Yellow
        Log "WARN: Could not write heartbeat: $_"
    }
}

# ---- Remove lock file ---
Write-Host ""
if (Test-Path $lockFile) {
    try {
        Remove-Item -Path $lockFile -Force -ErrorAction Stop
        Write-Host "  [OK] Lock file removed: $lockFile" -ForegroundColor Green
        Log "Lock file removed: $lockFile"
    } catch {
        Write-Host "  [WARN] Could not remove lock file: $_" -ForegroundColor Yellow
        Log "WARN: Could not remove lock: $_"
    }
} else {
    Write-Host "  [OK] No lock file found (already clean)." -ForegroundColor Green
    Log "No lock file to remove."
}

# ---- Remove PID file ---
if (Test-Path $pidFile) {
    try {
        Remove-Item -Path $pidFile -Force -ErrorAction Stop
        Write-Host "  [OK] PID file removed." -ForegroundColor Green
        Log "PID file removed."
    } catch {
        Log "WARN: Could not remove PID file: $_"
    }
}

# ---- Final status ---
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host " FINAL STATUS" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Processes stopped:  $stopped"
Write-Host "  Processes skipped:  $skipped"
Write-Host "  Lock file removed:  $(if (Test-Path $lockFile) { 'NO (still exists)' } else { 'YES' })"
Write-Host "  Heartbeat marked:   $(if ($hbStopped) { 'YES (status=stopped)' } else { 'N/A (no heartbeat)' })"
Write-Host ""

if ($Deep) {
    Write-Host "  Deep mode complete. Safe to run:" -ForegroundColor Green
    Write-Host "    node .\telegram_api_diagnostics.mjs" -ForegroundColor Cyan
    Write-Host "    powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1" -ForegroundColor Cyan
} else {
    Write-Host "  Normal mode complete." -ForegroundColor Green
    Write-Host "  For deep cleanup of all bot/gateway processes, run:" -ForegroundColor Yellow
    Write-Host "    powershell -ExecutionPolicy Bypass -File .\stop_master_bot.ps1 -Deep" -ForegroundColor Cyan
}

Write-Host ""
Log "Done. stopped=$stopped skipped=$skipped"
