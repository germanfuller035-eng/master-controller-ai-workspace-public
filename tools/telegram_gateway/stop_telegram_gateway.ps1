# STOP TELEGRAM GATEWAY
# Stops ONLY the telegram_master_bot.mjs node process.
# - Targets the bot by its command line (telegram_master_bot.mjs), never bulk-kills node.
# - If not running -> prints "not running", exit 0.
# - Removes the bot lock file (.telegram_master_bot.lock).
# - After stop, verifies the process actually disappeared.

$ErrorActionPreference = 'Stop'

$WORKSPACE  = "D:\AI_WORKSPACE"
$GATEWAY    = "$WORKSPACE\tools\telegram_gateway"
$LOCK_FILE  = "$GATEWAY\.telegram_master_bot.lock"
$LOG_DIR    = "$GATEWAY\logs"
$BOT_MATCH  = "telegram_master_bot.mjs"

Write-Host ""
Write-Host "=== TELEGRAM GATEWAY STOP ===" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"
Write-Host ""

$procs = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$BOT_MATCH*" }

if (-not $procs) {
    Write-Host "Telegram Gateway: not running (no telegram_master_bot.mjs process found)." -ForegroundColor Gray

    # Clean up a stale lock if one is lying around.
    if (Test-Path $LOCK_FILE) {
        Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue
        Write-Host "Stale lock file removed." -ForegroundColor Yellow
    }

    Write-Host ""
    exit 0
}

# Capture PIDs before stopping (for report / verification).
$targetPids = @($procs | ForEach-Object { $_.ProcessId })

foreach ($proc in $procs) {
    Write-Host "Stopping bot PID: $($proc.ProcessId)" -ForegroundColor Yellow
    try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
        Write-Host "  Stop signal sent to PID: $($proc.ProcessId)" -ForegroundColor Green
    } catch {
        Write-Host "  Failed to stop PID $($proc.ProcessId): $_" -ForegroundColor Red
    }

    $stopTime = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
    $logFile  = "$LOG_DIR\telegram_gateway_log.md"
    if (Test-Path $logFile) {
        Add-Content -Path $logFile -Value "| $stopTime | SYSTEM | stop | Stopped | PID: $($proc.ProcessId) via stop script |" -Encoding UTF8
    }
}

# Give the OS a moment to reap the process.
Start-Sleep -Seconds 2

# Remove lock file.
if (Test-Path $LOCK_FILE) {
    Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue
    Write-Host "Lock file removed." -ForegroundColor Green
}

# --- Verify the process actually disappeared ---
$still = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$BOT_MATCH*" }

Write-Host ""
if ($still) {
    $stillPids = ($still | ForEach-Object { $_.ProcessId }) -join ', '
    Write-Host "WARNING: Bot process still present after stop. PID(s): $stillPids" -ForegroundColor Red
    Write-Host "Telegram Gateway stop: INCOMPLETE." -ForegroundColor Red
    Write-Host ""
    exit 1
} else {
    Write-Host "Verified: no telegram_master_bot.mjs process remains." -ForegroundColor Green
    Write-Host "Stopped PID(s): $($targetPids -join ', ')" -ForegroundColor Green
    Write-Host "Telegram Gateway: STOPPED." -ForegroundColor Green
    Write-Host ""
    exit 0
}
