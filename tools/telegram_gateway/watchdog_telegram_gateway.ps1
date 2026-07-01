# ============================================================================
# watchdog_telegram_gateway.ps1  —  R3 Telegram Gateway Watchdog (CHECK-ONLY)
# ----------------------------------------------------------------------------
# Purpose:
#   Local-only health watchdog for the Telegram Gateway. Produces a single
#   GREEN / YELLOW / RED status WITHOUT touching Telegram API, WITHOUT tokens,
#   and WITHOUT changing any business logic.
#
# HARD GUARANTEES (R3 check-only):
#   - No Telegram API calls. No message send. No token read.
#   - No lead import. No queue write. No real import. No client contact.
#   - No autosend. No Windows Scheduled Task. No auto-restart.
#   - The -AutoRestart switch is RESERVED but DISABLED in this version.
#   - The watchdog only READS and REPORTS. It never repairs lock/heartbeat.
#
# Commands:
#   help                  Show usage.
#   check                 Run all local checks, print status (default).
#   check -AutoRestart    Same as check, but prints that AutoRestart is
#                         planned yet disabled in R3. Performs NO restart.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\telegram_gateway\watchdog_telegram_gateway.ps1 help
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\telegram_gateway\watchdog_telegram_gateway.ps1 check
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\telegram_gateway\watchdog_telegram_gateway.ps1 check -AutoRestart
# ============================================================================

param(
    [Parameter(Position = 0)]
    [string]$Command = "check",

    [switch]$AutoRestart
)

$ErrorActionPreference = "Stop"

# ---- Paths -----------------------------------------------------------------
$scriptDir   = $PSScriptRoot
$workspace   = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$botFile     = Join-Path $scriptDir "telegram_master_bot.mjs"
$lockFile    = Join-Path $scriptDir ".telegram_master_bot.lock"
$hbFile      = Join-Path $scriptDir "data\bot_heartbeat.json"
$queueFile   = Join-Path $workspace "13_sales\approval_queue\lead_import_approvals.json"
$logDir      = Join-Path $scriptDir "logs"
$logFile     = Join-Path $logDir "watchdog_log.md"

# ---- Help ------------------------------------------------------------------
function Show-Help {
    Write-Host ""
    Write-Host "Telegram Gateway Watchdog (R3 CHECK-ONLY)" -ForegroundColor Cyan
    Write-Host "-----------------------------------------"
    Write-Host "Commands:"
    Write-Host "  help                  Show this help."
    Write-Host "  check                 Run all local health checks (default)."
    Write-Host "  check -AutoRestart    Run checks; AutoRestart is RESERVED but DISABLED in R3."
    Write-Host ""
    Write-Host "Local checks: process count, node syntax, queue JSON, lock file,"
    Write-Host "heartbeat age, D3C freeze marker, dangerous queue markers."
    Write-Host ""
    Write-Host "Guarantees: no Telegram API, no token read, no queue write,"
    Write-Host "no import, no autosend, no scheduler, no auto-restart."
    Write-Host ""
    exit 0
}

if ($Command -ieq "help" -or $Command -ieq "-h" -or $Command -ieq "--help") {
    Show-Help
}

if ($Command -ine "check") {
    Write-Host "Unknown command: '$Command'. Use 'help' or 'check'." -ForegroundColor Yellow
    Show-Help
}

# ---- Status accumulator ----------------------------------------------------
$findings = New-Object System.Collections.Generic.List[string]
$overall  = "GREEN"   # worst-of: GREEN < YELLOW < RED

function Set-Status([string]$level) {
    $rank = @{ "GREEN" = 0; "YELLOW" = 1; "RED" = 2 }
    if ($rank[$level] -gt $rank[$script:overall]) {
        $script:overall = $level
    }
}

# ============================================================================
# CHECK 1 — Process count
# ============================================================================
$procCount = 0
$pid_       = "-"
try {
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
             Where-Object { $_.CommandLine -and $_.CommandLine -match "telegram_master_bot\.mjs" }
    if ($procs) {
        $procCount = @($procs).Count
        $pid_      = (@($procs)[0]).ProcessId
    }
} catch {
    $findings.Add("process_count: query error ($($_.Exception.Message))")
}

if ($procCount -eq 0) {
    Set-Status "RED"
    $findings.Add("process_count=0 (bot not running) -> RED")
} elseif ($procCount -eq 1) {
    $findings.Add("process_count=1 (ok)")
} else {
    Set-Status "RED"
    $findings.Add("process_count=$procCount (multiple instances) -> RED")
}

# ============================================================================
# CHECK 2 — Node syntax (node --check)
# ============================================================================
$syntaxCheck = "unknown"
if (Test-Path $botFile) {
    try {
        $null = & node --check "$botFile" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $syntaxCheck = "ok"
            $findings.Add("syntax_check=ok")
        } else {
            $syntaxCheck = "fail"
            Set-Status "RED"
            $findings.Add("syntax_check=fail -> RED")
        }
    } catch {
        $syntaxCheck = "fail"
        Set-Status "RED"
        $findings.Add("syntax_check=fail (exception) -> RED")
    }
} else {
    $syntaxCheck = "missing_bot_file"
    Set-Status "RED"
    $findings.Add("syntax_check: bot file missing -> RED")
}

# ============================================================================
# CHECK 3 — Queue JSON parse
# ============================================================================
$queueJson = "unknown"
if (Test-Path $queueFile) {
    try {
        $null = Get-Content $queueFile -Raw | ConvertFrom-Json
        $queueJson = "valid"
        $findings.Add("queue_json=valid")
    } catch {
        $queueJson = "invalid"
        Set-Status "RED"
        $findings.Add("queue_json=invalid (parse fail) -> RED")
    }
} else {
    $queueJson = "absent"
    Set-Status "YELLOW"
    $findings.Add("queue_json=absent -> YELLOW")
}

# ============================================================================
# CHECK 4 — Lock file
# ============================================================================
$lockStatus = "unknown"
$lockPid    = $null
if (Test-Path $lockFile) {
    try {
        $raw = (Get-Content $lockFile -Raw).Trim()
        if ($raw.StartsWith("{")) {
            $lockPid = ($raw | ConvertFrom-Json).pid
        } else {
            $lockPid = [int]$raw
        }
    } catch {
        $lockPid = $null
    }

    if ($procCount -ge 1 -and $lockPid -ne $null -and "$lockPid" -eq "$pid_") {
        $lockStatus = "ok_match"
        $findings.Add("lock_status=ok (PID $lockPid matches process)")
    } else {
        $lockStatus = "stale_or_mismatch"
        Set-Status "YELLOW"
        $findings.Add("lock_status=mismatch (lock PID=$lockPid, proc PID=$pid_) -> YELLOW")
    }
} else {
    if ($procCount -ge 1) {
        $lockStatus = "missing_but_running"
        Set-Status "YELLOW"
        $findings.Add("lock_status=missing but process running -> YELLOW")
    } else {
        $lockStatus = "absent"
        $findings.Add("lock_status=absent (no process)")
    }
}

# ============================================================================
# CHECK 5 — Heartbeat age
# ============================================================================
$heartbeatAge = "n/a"
if (Test-Path $hbFile) {
    try {
        $hb     = Get-Content $hbFile -Raw | ConvertFrom-Json
        $hbAt   = $hb.last_heartbeat_at
        if (-not $hbAt) { $hbAt = $hb.last_update_at }
        if ($hbAt) {
            $ageSec       = [int]((Get-Date).ToUniversalTime() - ([datetime]$hbAt).ToUniversalTime()).TotalSeconds
            $heartbeatAge = "${ageSec}s"
            if ($ageSec -le 120) {
                $findings.Add("heartbeat_age=${ageSec}s (fresh)")
            } elseif ($ageSec -le 600) {
                Set-Status "YELLOW"
                $findings.Add("heartbeat_age=${ageSec}s (stale 120-600s) -> YELLOW")
            } else {
                Set-Status "RED"
                $findings.Add("heartbeat_age=${ageSec}s (>600s) -> RED")
            }
        } else {
            $heartbeatAge = "no_timestamp"
            Set-Status "YELLOW"
            $findings.Add("heartbeat: no timestamp field -> YELLOW")
        }
    } catch {
        $heartbeatAge = "parse_error"
        Set-Status "YELLOW"
        $findings.Add("heartbeat: parse error -> YELLOW")
    }
} else {
    $heartbeatAge = "absent"
    Set-Status "YELLOW"
    $findings.Add("heartbeat=absent -> YELLOW")
}

# ============================================================================
# CHECK 6 — D3C freeze marker
# ============================================================================
$d3cMarker = "unknown"
if (Test-Path $botFile) {
    $botText = Get-Content $botFile -Raw
    if ($botText -match "D3C SAFETY FREEZE") {
        $d3cMarker = "present"
        $findings.Add("d3c_freeze_marker=present")
    } else {
        $d3cMarker = "missing"
        Set-Status "RED"
        $findings.Add("d3c_freeze_marker=MISSING -> RED")
    }
} else {
    $d3cMarker = "missing_bot_file"
    Set-Status "RED"
    $findings.Add("d3c_freeze_marker: bot file missing -> RED")
}

# ============================================================================
# CHECK 7 — Dangerous queue markers
# ============================================================================
$dangerousMarker = "none"
$dangerTokens    = @("telegram_manual_prepare", "import-20260606T182751Z")
if (Test-Path $queueFile) {
    try {
        $qText = Get-Content $queueFile -Raw
        $hits  = @()
        foreach ($tok in $dangerTokens) {
            if ($qText -match [regex]::Escape($tok)) { $hits += $tok }
        }
        if ($hits.Count -gt 0) {
            $dangerousMarker = ($hits -join ", ")
            Set-Status "RED"
            $findings.Add("dangerous_queue_marker=[$dangerousMarker] -> RED")
        } else {
            $findings.Add("dangerous_queue_marker=none")
        }
    } catch {
        $findings.Add("dangerous_queue_marker: queue read error")
    }
} else {
    $findings.Add("dangerous_queue_marker=n/a (no queue file)")
}

# ============================================================================
# Recommended action
# ============================================================================
switch ($overall) {
    "GREEN"  { $recommended = "No action. Gateway healthy (check-only)." }
    "YELLOW" { $recommended = "Investigate warnings (lock/heartbeat/queue). No auto-restart in R3." }
    "RED"    { $recommended = "Manual intervention required. Use start/stop/status scripts. No auto-restart in R3." }
    default  { $recommended = "Review findings." }
}

# ============================================================================
# AutoRestart switch (RESERVED, DISABLED)
# ============================================================================
if ($AutoRestart) {
    Write-Host "AutoRestart is planned but disabled in R3 check-only" -ForegroundColor Yellow
}

# ============================================================================
# Output
# ============================================================================
$statusColor = switch ($overall) { "GREEN" { "Green" } "YELLOW" { "Yellow" } "RED" { "Red" } }

Write-Host ""
Write-Host "===== TELEGRAM GATEWAY WATCHDOG (R3 CHECK-ONLY) =====" -ForegroundColor Cyan
Write-Host ("overall_status         : {0}" -f $overall) -ForegroundColor $statusColor
Write-Host ("process_count          : {0}" -f $procCount)
Write-Host ("pid                    : {0}" -f $pid_)
Write-Host ("syntax_check           : {0}" -f $syntaxCheck)
Write-Host ("queue_json             : {0}" -f $queueJson)
Write-Host ("lock_status            : {0}" -f $lockStatus)
Write-Host ("heartbeat_age          : {0}" -f $heartbeatAge)
Write-Host ("d3c_freeze_marker      : {0}" -f $d3cMarker)
Write-Host ("dangerous_queue_marker : {0}" -f $dangerousMarker)
Write-Host ("recommended_action     : {0}" -f $recommended)
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# Log append (one entry per run)
# ============================================================================
try {
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    }
    if (-not (Test-Path $logFile)) {
        Set-Content -Path $logFile -Value "# Watchdog Log (R3 check-only)`n`nOne entry per run. Local checks only. No Telegram API.`n" -Encoding UTF8
    }
    $ts    = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
    $short = ($findings -join "; ")
    $entry = "- **$ts** | status=**$overall** | proc=$procCount pid=$pid_ syntax=$syntaxCheck queue=$queueJson lock=$lockStatus hb=$heartbeatAge d3c=$d3cMarker danger=$dangerousMarker | $short"
    Add-Content -Path $logFile -Value $entry -Encoding UTF8
} catch {
    Write-Host "WARN: could not write watchdog log: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ============================================================================
# Exit code: 0 GREEN, 1 YELLOW, 2 RED (informational; check-only never repairs)
# ============================================================================
switch ($overall) {
    "GREEN"  { exit 0 }
    "YELLOW" { exit 1 }
    "RED"    { exit 2 }
    default  { exit 0 }
}
