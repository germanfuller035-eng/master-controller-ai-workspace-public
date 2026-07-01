# =====================================================================
# TELEGRAM GATEWAY UNIFIED CONTROL (R2)
# ---------------------------------------------------------------------
# Single entry point that delegates to the already-fixed R1 scripts:
#   - start_telegram_gateway.ps1
#   - stop_telegram_gateway.ps1
#   - status_telegram_gateway.ps1
#
# Commands:
#   status   -> status_telegram_gateway.ps1
#   start    -> start_telegram_gateway.ps1, then status
#   stop     -> stop_telegram_gateway.ps1, then status
#   restart  -> stop, pause 3s, start; verify exactly ONE bot process
#   smoke    -> LOCAL ONLY checks (no Telegram API):
#                 * node --check telegram_master_bot.mjs
#                 * JSON parse lead_import_approvals.json (if present)
#                 * verify bot process count is 0 or 1
#                 * print status
#   help     -> show available commands
#
# SAFETY:
#   - Never uses Telegram API, never sends messages, never reads tokens.
#   - Never runs lead import / queue write / real import / autosend.
#   - Never bulk-kills node; relies on the R1 scripts which target the
#     bot by command line only.
#   - Restart is safe: if stop leaves the process alive, start is NOT run.
# =====================================================================

param(
    [Parameter(Position = 0)]
    [string]$Command = "help"
)

$ErrorActionPreference = 'Stop'

$WORKSPACE   = "D:\AI_WORKSPACE"
$GATEWAY     = "$WORKSPACE\tools\telegram_gateway"
$BOT_SCRIPT  = "$GATEWAY\telegram_master_bot.mjs"
$BOT_MATCH   = "telegram_master_bot.mjs"
$QUEUE_FILE  = "$WORKSPACE\13_sales\approval_queue\lead_import_approvals.json"

$STATUS_SCRIPT = "$GATEWAY\status_telegram_gateway.ps1"
$START_SCRIPT  = "$GATEWAY\start_telegram_gateway.ps1"
$STOP_SCRIPT   = "$GATEWAY\stop_telegram_gateway.ps1"

# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

function Get-BotProcessPids {
    # Returns an array of PIDs for running telegram_master_bot.mjs processes.
    $procs = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$BOT_MATCH*" }
    return @($procs | ForEach-Object { $_.ProcessId })
}

function Invoke-Child {
    param([string]$ScriptPath)

    if (-not (Test-Path $ScriptPath)) {
        Write-Host "ERROR: required script not found: $ScriptPath" -ForegroundColor Red
        return 1
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath
    return $LASTEXITCODE
}

function Show-Help {
    Write-Host ""
    Write-Host "=== TELEGRAM GATEWAY CONTROL (R2) ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Gray
    Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\telegram_gateway\telegram_gateway.ps1 <command>"
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Gray
    Write-Host "  status   Show gateway status (read-only)."
    Write-Host "  start    Start the gateway, then show status."
    Write-Host "  stop     Stop the gateway, then show status."
    Write-Host "  restart  Stop, wait 3s, start; verify exactly one bot process."
    Write-Host "  smoke    Local-only checks (no Telegram API):"
    Write-Host "             - node --check telegram_master_bot.mjs"
    Write-Host "             - JSON parse of lead_import_approvals.json (if present)"
    Write-Host "             - bot process count is 0 or 1"
    Write-Host "             - print status"
    Write-Host "  help     Show this help."
    Write-Host ""
}

# ---------------------------------------------------------------------
# Command implementations
# ---------------------------------------------------------------------

function Cmd-Status {
    return (Invoke-Child $STATUS_SCRIPT)
}

function Cmd-Start {
    Write-Host ""
    Write-Host ">>> START" -ForegroundColor Cyan
    $null = Invoke-Child $START_SCRIPT
    Write-Host ""
    Write-Host ">>> STATUS (after start)" -ForegroundColor Cyan
    return (Invoke-Child $STATUS_SCRIPT)
}

function Cmd-Stop {
    Write-Host ""
    Write-Host ">>> STOP" -ForegroundColor Cyan
    $null = Invoke-Child $STOP_SCRIPT
    Write-Host ""
    Write-Host ">>> STATUS (after stop)" -ForegroundColor Cyan
    return (Invoke-Child $STATUS_SCRIPT)
}

function Cmd-Restart {
    Write-Host ""
    Write-Host ">>> RESTART" -ForegroundColor Cyan

    $pidsBefore = Get-BotProcessPids
    Write-Host "PID(s) before restart: $((@($pidsBefore) -join ', '))" -ForegroundColor Gray

    # --- Stop ---
    Write-Host ""
    Write-Host ">>> RESTART: STOP phase" -ForegroundColor Cyan
    $null = Invoke-Child $STOP_SCRIPT

    # --- Safety check: did the process actually disappear? ---
    $pidsAfterStop = Get-BotProcessPids
    if ($pidsAfterStop.Count -gt 0) {
        Write-Host ""
        Write-Host "ABORT: bot process still present after stop (PID(s): $((@($pidsAfterStop) -join ', ')))." -ForegroundColor Red
        Write-Host "Not starting a second process. Restart aborted for safety." -ForegroundColor Red
        Write-Host ""
        Write-Host ">>> STATUS (restart aborted)" -ForegroundColor Cyan
        $null = Invoke-Child $STATUS_SCRIPT
        return 1
    }

    # --- Pause 3 seconds ---
    Write-Host ""
    Write-Host "Pausing 3 seconds before start..." -ForegroundColor Gray
    Start-Sleep -Seconds 3

    # --- Start ---
    Write-Host ""
    Write-Host ">>> RESTART: START phase" -ForegroundColor Cyan
    $null = Invoke-Child $START_SCRIPT

    # Give the process a moment to settle (start script already waits ~4s).
    Start-Sleep -Seconds 1

    # --- Verify exactly one bot process ---
    $pidsAfter = Get-BotProcessPids
    Write-Host ""
    Write-Host "PID(s) after restart: $((@($pidsAfter) -join ', '))" -ForegroundColor Gray

    Write-Host ""
    Write-Host ">>> STATUS (after restart)" -ForegroundColor Cyan
    $null = Invoke-Child $STATUS_SCRIPT

    Write-Host ""
    if ($pidsAfter.Count -eq 1) {
        Write-Host "RESTART OK: exactly one telegram_master_bot.mjs process is running (PID: $($pidsAfter[0]))." -ForegroundColor Green
        return 0
    } elseif ($pidsAfter.Count -eq 0) {
        Write-Host "RESTART WARNING: no bot process found after start. It may still be starting." -ForegroundColor Yellow
        return 1
    } else {
        Write-Host "RESTART WARNING: more than one bot process detected (PID(s): $((@($pidsAfter) -join ', ')))." -ForegroundColor Red
        return 1
    }
}

function Cmd-Smoke {
    Write-Host ""
    Write-Host ">>> SMOKE (local checks only, no Telegram API)" -ForegroundColor Cyan
    Write-Host ""

    $failures = 0

    # --- Check 1: node --check on the bot script ---
    Write-Host "[1/4] node --check $BOT_MATCH" -ForegroundColor Gray
    if (-not (Test-Path $BOT_SCRIPT)) {
        Write-Host "  FAIL: bot script not found: $BOT_SCRIPT" -ForegroundColor Red
        $failures++
    } else {
        & node --check $BOT_SCRIPT 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  PASS: syntax OK." -ForegroundColor Green
        } else {
            Write-Host "  FAIL: node --check reported errors (exit $LASTEXITCODE)." -ForegroundColor Red
            $failures++
        }
    }

    # --- Check 2: JSON parse of approvals queue (if present) ---
    Write-Host ""
    Write-Host "[2/4] JSON parse: lead_import_approvals.json (read-only)" -ForegroundColor Gray
    if (Test-Path $QUEUE_FILE) {
        try {
            $raw = Get-Content $QUEUE_FILE -Raw -ErrorAction Stop
            $null = $raw | ConvertFrom-Json -ErrorAction Stop
            Write-Host "  PASS: queue JSON parsed successfully." -ForegroundColor Green
        } catch {
            Write-Host "  FAIL: queue JSON is invalid: $_" -ForegroundColor Red
            $failures++
        }
    } else {
        Write-Host "  SKIP: queue file does not exist (nothing to parse)." -ForegroundColor Yellow
    }

    # --- Check 3: bot process count is 0 or 1 ---
    Write-Host ""
    Write-Host "[3/4] Bot process count (expect 0 or 1)" -ForegroundColor Gray
    $pids = Get-BotProcessPids
    Write-Host "  Running PID(s): $((@($pids) -join ', '))" -ForegroundColor Gray
    if ($pids.Count -le 1) {
        Write-Host "  PASS: process count is $($pids.Count)." -ForegroundColor Green
    } else {
        Write-Host "  FAIL: more than one bot process running ($($pids.Count))." -ForegroundColor Red
        $failures++
    }

    # --- Check 4: print status ---
    Write-Host ""
    Write-Host "[4/4] Status output" -ForegroundColor Gray
    $null = Invoke-Child $STATUS_SCRIPT

    Write-Host ""
    if ($failures -eq 0) {
        Write-Host "SMOKE RESULT: PASS (no failures)." -ForegroundColor Green
        return 0
    } else {
        Write-Host "SMOKE RESULT: FAIL ($failures check(s) failed)." -ForegroundColor Red
        return 1
    }
}

# ---------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------

$cmd = $Command.ToLowerInvariant()

switch ($cmd) {
    "status"  { exit (Cmd-Status) }
    "start"   { exit (Cmd-Start) }
    "stop"    { exit (Cmd-Stop) }
    "restart" { exit (Cmd-Restart) }
    "smoke"   { exit (Cmd-Smoke) }
    "help"    { Show-Help; exit 0 }
    default {
        Write-Host ""
        Write-Host "Unknown command: '$Command'" -ForegroundColor Red
        Show-Help
        exit 1
    }
}
