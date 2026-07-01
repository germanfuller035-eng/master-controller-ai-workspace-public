# START TELEGRAM GATEWAY
# - Checks for an existing telegram_master_bot.mjs process BEFORE starting.
# - If already running -> does NOT start a second process (single instance).
# - If a lock file exists but no process is alive -> removes the stale lock.
# - Launches exactly ONE bot process and prints its PID.

$ErrorActionPreference = 'Stop'

$WORKSPACE  = "D:\AI_WORKSPACE"
$GATEWAY    = "$WORKSPACE\tools\telegram_gateway"
$BOT_SCRIPT = "$GATEWAY\telegram_master_bot.mjs"
$LOG_DIR    = "$GATEWAY\logs"
$LOCK_FILE  = "$GATEWAY\.telegram_master_bot.lock"
$PID_FILE   = "$GATEWAY\.telegram_master_bot.pid"
$STDOUT_LOG = "$LOG_DIR\telegram_master_bot.stdout.log"
$STDERR_LOG = "$LOG_DIR\telegram_master_bot.stderr.log"
$BOT_MATCH  = "telegram_master_bot.mjs"
$ENV_FILE   = "$WORKSPACE\.env"

Write-Host ""
Write-Host "=== TELEGRAM GATEWAY START ===" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"
Write-Host ""

# --- CANONICAL WRITER GUARD (Release 2 cutover) ---
# The VPS is the canonical writer since 2026-06-16. Starting the local bot would
# reintroduce a second direct-file writer. Refuse unless the marker says LOCAL.
$MARKER = "$GATEWAY\.canonical_writer_location"
if (Test-Path $MARKER) {
    $loc = (Get-Content $MARKER -ErrorAction SilentlyContinue | Where-Object { $_ -and -not $_.StartsWith('#') } | Select-Object -First 1)
    if ($loc -and $loc.Trim().ToUpper() -ne 'LOCAL') {
        Write-Host "LOCAL_PRODUCTION_START_ATTEMPT -> refused" -ForegroundColor Red
        Write-Host "reason=VPS_CANONICAL_WRITER_ACTIVE (marker=$($loc.Trim()))" -ForegroundColor Red
        Write-Host "The local Telegram bot is a direct-file writer; the VPS owns canonical state." -ForegroundColor Yellow
        Write-Host "To run locally on purpose, set $MARKER to LOCAL (after disabling the VPS writer)." -ForegroundColor Yellow
        exit 2
    }
}

# --- Ensure log directory exists ---
if (-not (Test-Path $LOG_DIR)) {
    New-Item -ItemType Directory -Force -Path $LOG_DIR | Out-Null
}

# --- PREFLIGHT: entrypoint integrity (stray-leading-bytes guard + syntax) ---
# Root-cause protection: refuse to start if telegram_master_bot.mjs is corrupt
# (e.g. stray leading non-JS bytes) or has a syntax error. See SOP "after any bug".
$GUARD_TEST = "$WORKSPACE\tools\tests\telegram_entrypoint_stray_bytes_guard_test.mjs"

Write-Host "Preflight: checking entrypoint integrity..." -ForegroundColor Gray
& node --check "$BOT_SCRIPT"
if ($LASTEXITCODE -ne 0) {
    Write-Host "PREFLIGHT FAILED: node --check reported a syntax error in $BOT_SCRIPT." -ForegroundColor Red
    Write-Host "Aborting start. Fix the entrypoint before launching the gateway." -ForegroundColor Red
    exit 1
}

if (Test-Path $GUARD_TEST) {
    & node "$GUARD_TEST"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "PREFLIGHT FAILED: stray-leading-bytes guard rejected the entrypoint." -ForegroundColor Red
        Write-Host "Aborting start. Fix the entrypoint before launching the gateway." -ForegroundColor Red
        exit 1
    }
    Write-Host "Preflight OK: entrypoint syntax + leading-bytes guard passed." -ForegroundColor Green
} else {
    Write-Host "WARNING: guard test not found at $GUARD_TEST (skipping byte guard)." -ForegroundColor Yellow
}


# --- PREFLIGHT: sales contract tests (refuse to start if RED) ---------------
# Root-cause protection for the ONE canonical /sales_next production flow.
# If any of these contract tests fail, the gateway MUST NOT start, because a
# failure means the approval gate, recipient gate, template copy, SMTP-adapter
# wiring, or the no-P1-env-flag invariant has regressed. See SOP "after any bug".
$CONTRACT_TESTS = @(
    "$WORKSPACE\tools\tests\sales_next_contract_test.mjs",
    "$WORKSPACE\tools\tests\audit_send_canonical_path_regression_test.mjs",
    "$WORKSPACE\tools\tests\audit_send_approve_recipient_gate_test.mjs",
    "$WORKSPACE\tools\tests\telegram_p1_top1_client_send_test.mjs"
)

Write-Host "Preflight: running sales contract tests..." -ForegroundColor Gray
foreach ($test in $CONTRACT_TESTS) {
    if (-not (Test-Path $test)) {
        Write-Host "PREFLIGHT FAILED: required contract test missing: $test" -ForegroundColor Red
        Write-Host "Aborting start. Restore the contract test before launching the gateway." -ForegroundColor Red
        exit 1
    }
    & node "$test"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "PREFLIGHT FAILED: contract test RED: $test" -ForegroundColor Red
        Write-Host "Aborting start. Fix the regression before launching the gateway." -ForegroundColor Red
        exit 1
    }
}
Write-Host "Preflight OK: all sales contract tests GREEN." -ForegroundColor Green



# --- Check if already running (single-instance guard) ---
$existing = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$BOT_MATCH*" }

if ($existing) {
    Write-Host "Telegram Gateway is ALREADY RUNNING. Not starting a second process." -ForegroundColor Yellow
    Write-Host ""
    foreach ($proc in $existing) {
        Write-Host "  PID: $($proc.ProcessId)" -ForegroundColor Yellow
        $cmd = $proc.CommandLine
        if ($cmd) {
            $cmdShort = if ($cmd.Length -gt 100) { $cmd.Substring(0, 100) + "..." } else { $cmd }
            Write-Host "  CMD: $cmdShort" -ForegroundColor Gray
        }
    }
    Write-Host ""
    Write-Host "Use status_telegram_gateway.ps1 to check status." -ForegroundColor Gray
    Write-Host "Use stop_telegram_gateway.ps1 to stop it first." -ForegroundColor Gray
    exit 0
}

# --- No process running: clear stale/corrupt lock if present ---
if (Test-Path $LOCK_FILE) {
    $staleName = ".telegram_master_bot.lock.stale.$((Get-Date).ToString('yyyyMMdd_HHmmss'))"
    $stalePath = Join-Path $GATEWAY $staleName
    Write-Host "Lock file present but no bot process found. Moving stale lock to $staleName..." -ForegroundColor Yellow
    Move-Item -Path $LOCK_FILE -Destination $stalePath -Force -ErrorAction SilentlyContinue
}

# --- Start exactly one bot process in background ---
Write-Host "Starting Telegram Gateway..." -ForegroundColor Green

$startTime = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'

# --- Load workspace .env into this process before spawning node ---
$loadedEnvNames = @()

if (Test-Path $ENV_FILE) {
    Get-Content $ENV_FILE | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        if ($line -notmatch "=") { return }

        $parts = $line.Split("=", 2)
        $key = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")

        if ($key) {
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
            Set-Item -Path "Env:$key" -Value $value
            $loadedEnvNames += $key
        }
    }

    Write-Host "Env loader: loaded $($loadedEnvNames.Count) variable(s): $($loadedEnvNames -join ', ')" -ForegroundColor Gray
} else {
    Write-Host "Env loader: .env not found at $ENV_FILE (0 variables loaded)." -ForegroundColor Yellow
}

Write-Host "Start method: Start-Process -FilePath node.exe -ArgumentList `"$BOT_SCRIPT`" -WorkingDirectory $GATEWAY" -ForegroundColor Gray
Write-Host "Stdout log: $STDOUT_LOG" -ForegroundColor Gray
Write-Host "Stderr log: $STDERR_LOG" -ForegroundColor Gray
try {
    $startInfo = @{
        FilePath               = "node.exe"
        ArgumentList           = @("`"$BOT_SCRIPT`"")
        WorkingDirectory       = $GATEWAY
        WindowStyle            = "Hidden"
        RedirectStandardOutput = $STDOUT_LOG
        RedirectStandardError  = $STDERR_LOG
        PassThru               = $true
    }
    $startedProc = Start-Process @startInfo
} catch {
    Write-Host "START FAILED: Start-Process threw an error (details hidden from secrets; no token printed)." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# --- Wait up to 15 seconds for the process to appear ---
$newProc = @()
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 1
    $newProc = @(Get-CimInstance Win32_Process -Filter "name='node.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$BOT_MATCH*" })
    if ($newProc.Count -gt 0) { break }
    Write-Host "Waiting for bot process to appear... ${i}/15" -ForegroundColor Gray
}

Write-Host ""
if ($newProc.Count -gt 0) {
    $pids = @($newProc | ForEach-Object { $_.ProcessId })
    if ($pids.Count -gt 1) {
        Write-Host "WARNING: Multiple bot processes detected after start: $($pids -join ', ')" -ForegroundColor Red
        exit 1
    }
    try { $pids[0] | Set-Content -Path $PID_FILE -Encoding UTF8 } catch {}
    Write-Host "Telegram Gateway STARTED." -ForegroundColor Green
    Write-Host "  PID:  $($pids -join ', ')" -ForegroundColor Green
    Write-Host "  Time: $startTime" -ForegroundColor Green

    $logLine = "| $startTime | SYSTEM | start | Started | PID: $($pids -join ', ') |"
    $logFile = "$LOG_DIR\telegram_gateway_log.md"
    if (Test-Path $logFile) {
        Add-Content -Path $logFile -Value $logLine -Encoding UTF8
    }
    exit 0
} else {
    Write-Host "Process not visible after 15 seconds." -ForegroundColor Red
    Write-Host "Run: status_telegram_gateway.ps1 in a few seconds." -ForegroundColor Gray
    exit 1
}
