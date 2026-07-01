# STATUS TELEGRAM GATEWAY
# Read-only. Reports:
#   - RUNNING / STOPPED
#   - PID
#   - CommandLine
#   - lock present / not present (and lock PID)
#   - heartbeat age (seconds) + warning if stale
# Never fails if state/heartbeat/lock files are missing.

$ErrorActionPreference = 'Stop'

$WORKSPACE      = "D:\AI_WORKSPACE"
$GATEWAY        = "$WORKSPACE\tools\telegram_gateway"
$LOCK_FILE      = "$GATEWAY\.telegram_master_bot.lock"
$STATE_FILE     = "$GATEWAY\state\telegram_gateway_state.json"
$HEARTBEAT_FILE = "$GATEWAY\data\bot_heartbeat.json"
$BOT_MATCH      = "telegram_master_bot.mjs"
$HEARTBEAT_WARN_SEC = 90

Write-Host ""
Write-Host "=== TELEGRAM GATEWAY STATUS ===" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"
Write-Host ""

# --- Process state ---
$procs = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$BOT_MATCH*" }

if ($procs) {
    Write-Host "State:       RUNNING" -ForegroundColor Green
    foreach ($proc in $procs) {
        Write-Host "PID:         $($proc.ProcessId)" -ForegroundColor Green
        $cmd = $proc.CommandLine
        if ($cmd) {
            Write-Host "CommandLine: $cmd" -ForegroundColor Gray
        } else {
            Write-Host "CommandLine: (unavailable)" -ForegroundColor Gray
        }
    }
    $procPids = @($procs | ForEach-Object { $_.ProcessId })
    if ($procPids.Count -gt 1) {
        Write-Host "WARNING: more than one bot process is running ($($procPids -join ', '))." -ForegroundColor Red
    }
} else {
    Write-Host "State:       STOPPED" -ForegroundColor Yellow
    Write-Host "PID:         (none)" -ForegroundColor Gray
    Write-Host "CommandLine: (none)" -ForegroundColor Gray
}

Write-Host ""

# --- Lock file ---
if (Test-Path $LOCK_FILE) {
    $lockPid = "(unknown)"
    try {
        $lockRaw  = Get-Content $LOCK_FILE -Raw -ErrorAction Stop
        $lockJson = $lockRaw | ConvertFrom-Json -ErrorAction Stop
        if ($lockJson.pid) { $lockPid = $lockJson.pid }
    } catch {
        $lockPid = "(unreadable)"
    }
    Write-Host "Lock:        PRESENT (lock PID: $lockPid)" -ForegroundColor Gray

    # Detect stale lock: lock present but no process running.
    if (-not $procs) {
        Write-Host "WARNING: lock file present but no bot process is running (stale lock)." -ForegroundColor Red
    }
} else {
    Write-Host "Lock:        NOT PRESENT" -ForegroundColor Gray
}

Write-Host ""

# --- Heartbeat ---
if (Test-Path $HEARTBEAT_FILE) {
    try {
        $hbRaw  = Get-Content $HEARTBEAT_FILE -Raw -ErrorAction Stop
        $hbJson = $hbRaw | ConvertFrom-Json -ErrorAction Stop
        $hbTime = $hbJson.last_heartbeat_at
        if ($hbTime) {
            try {
                $hbDate  = [DateTime]::Parse($hbTime).ToUniversalTime()
                $nowUtc  = (Get-Date).ToUniversalTime()
                $ageSec  = [Math]::Round(($nowUtc - $hbDate).TotalSeconds)
                Write-Host "Heartbeat:   last_heartbeat_at = $hbTime" -ForegroundColor Gray
                Write-Host "Heartbeat age: ${ageSec}s" -ForegroundColor Gray
                if ($ageSec -gt $HEARTBEAT_WARN_SEC) {
                    Write-Host "WARNING: heartbeat is stale (> ${HEARTBEAT_WARN_SEC}s). Bot may be hung or stopped." -ForegroundColor Red
                }
            } catch {
                Write-Host "Heartbeat:   present but timestamp unparseable ($hbTime)" -ForegroundColor Yellow
            }
        } else {
            Write-Host "Heartbeat:   file present but no last_heartbeat_at field" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Heartbeat:   file present but unreadable" -ForegroundColor Yellow
    }
} else {
    Write-Host "Heartbeat:   NO heartbeat file (data/bot_heartbeat.json)" -ForegroundColor Gray
}

Write-Host ""

# --- State file (optional, informational) ---
if (Test-Path $STATE_FILE) {
    try {
        $stRaw  = Get-Content $STATE_FILE -Raw -ErrorAction Stop
        $stJson = $stRaw | ConvertFrom-Json -ErrorAction Stop
        $stStatus = if ($stJson.status) { $stJson.status } else { "(unknown)" }
        Write-Host "State file:  present (status: $stStatus)" -ForegroundColor Gray
    } catch {
        Write-Host "State file:  present but unreadable" -ForegroundColor Yellow
    }
} else {
    Write-Host "State file:  NOT present" -ForegroundColor Gray
}

Write-Host ""
exit 0
