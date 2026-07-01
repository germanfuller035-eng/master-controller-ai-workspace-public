# =============================================================
# watch_master_bot.ps1 - Watchdog for Telegram Master Controller
#
# Логика (запуск раз в минуту):
#   1. Проверить heartbeat (data/bot_heartbeat.json).
#   2. Если процесса нет — запустить start_master_bot.ps1.
#   3. Если heartbeat старше 90 секунд — stop + start.
#   4. Если lock stale (PID не живой) — удалить lock + start.
#   5. Если процессов > 1 — stop + start.
#   6. Если ок — записать heartbeat OK в watchdog.log.
#
# БЕЗОПАСНОСТЬ:
#   - Не отправляет ничего клиентам.
#   - Не логирует токены.
#   - Не удаляет ничего, кроме stale lock.
# =============================================================

$ErrorActionPreference = "Continue"

# ---- UTF-8 console (safe try/catch for PS 5.1) ----
try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::InputEncoding  = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding           = [System.Text.UTF8Encoding]::new($false)
} catch {
    try { $OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
}
try { chcp 65001 | Out-Null } catch {}

$BOT_DIR        = "D:\AI_WORKSPACE\tools\telegram_gateway"
$LOCK_FILE      = "$BOT_DIR\.telegram_master_bot.lock"
$HEARTBEAT_FILE = "$BOT_DIR\data\bot_heartbeat.json"
$LOG_DIR        = "$BOT_DIR\logs"
$WATCHDOG_LOG   = "$LOG_DIR\watchdog.log"
$START_SCRIPT   = "$BOT_DIR\start_master_bot.ps1"
$STOP_SCRIPT    = "$BOT_DIR\stop_master_bot.ps1"
$BOT_SCRIPT     = "$BOT_DIR\telegram_master_bot.mjs"

# Heartbeat считается свежим, если ему меньше 90 секунд
$HEARTBEAT_MAX_AGE_SEC = 90

# Подготовить лог-папку
New-Item -ItemType Directory -Force -Path $LOG_DIR | Out-Null

function Write-Watchdog($level, $msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$level] $msg"
    try {
        Add-Content -Path $WATCHDOG_LOG -Value $line -Encoding UTF8
    } catch {}
    Write-Host $line
}

function Get-BotProcs {
    $procs = Get-WmiObject Win32_Process -Filter "Name='node.exe'" 2>$null | Where-Object {
        $_.CommandLine -like "*telegram_master_bot.mjs*"
    }
    if ($procs) { return @($procs) }
    return @()
}

function Get-HeartbeatAgeSec {
    if (-not (Test-Path $HEARTBEAT_FILE)) { return $null }
    try {
        $hb = Get-Content $HEARTBEAT_FILE -Raw | ConvertFrom-Json
        $ts = [DateTime]::Parse($hb.last_heartbeat_at)
        $age = (Get-Date).ToUniversalTime() - $ts.ToUniversalTime()
        return [int]$age.TotalSeconds
    } catch {
        return $null
    }
}

function Get-LockPid {
    if (-not (Test-Path $LOCK_FILE)) { return $null }
    try {
        $obj = Get-Content $LOCK_FILE -Raw | ConvertFrom-Json
        return $obj.pid
    } catch {
        return $null
    }
}

function Start-Bot {
    Write-Watchdog "ACTION" "Starting bot via start_master_bot.ps1 ..."
    try {
        Start-Process -FilePath "powershell.exe" `
            -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",$START_SCRIPT `
            -WorkingDirectory $BOT_DIR `
            -WindowStyle Hidden | Out-Null
        Write-Watchdog "ACTION" "Start command dispatched."
    } catch {
        Write-Watchdog "ERROR"  "Failed to start bot: $($_.Exception.Message)"
    }
}

function Stop-Bot {
    Write-Watchdog "ACTION" "Stopping bot via stop_master_bot.ps1 ..."
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $STOP_SCRIPT | Out-Null
        Start-Sleep -Seconds 2
        Write-Watchdog "ACTION" "Stop command completed."
    } catch {
        Write-Watchdog "ERROR"  "Failed to stop bot: $($_.Exception.Message)"
    }
}

# --- main ---
Write-Watchdog "INFO" "Watchdog cycle started."

$procs     = Get-BotProcs
$procCount = $procs.Count
$lockPid   = Get-LockPid
$hbAge     = Get-HeartbeatAgeSec

Write-Watchdog "INFO" "Procs=$procCount, LockPid=$lockPid, HeartbeatAgeSec=$hbAge"

# Случай 1: больше одного процесса
if ($procCount -gt 1) {
    Write-Watchdog "WARN" "Multiple bot processes ($procCount) — stop + start."
    Stop-Bot
    Start-Sleep -Seconds 2
    Start-Bot
    return
}

# Случай 2: процессов нет
if ($procCount -eq 0) {
    # Stale lock?
    if (Test-Path $LOCK_FILE) {
        Write-Watchdog "WARN" "Stale lock found (no bot proc). Removing lock."
        try { Remove-Item -Path $LOCK_FILE -Force -ErrorAction SilentlyContinue } catch {}
    }
    Write-Watchdog "WARN" "No bot process — starting."
    Start-Bot
    return
}

# Случай 3: один процесс, но lock указывает на чужой PID
if ($procCount -eq 1 -and $lockPid) {
    $pid1    = $procs[0].ProcessId
    $alivePid = (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)
    if (-not $alivePid) {
        Write-Watchdog "WARN" "Stale lock (PID $lockPid not alive). Stop+start to restore consistency."
        Stop-Bot
        Start-Sleep -Seconds 2
        Start-Bot
        return
    }
}

# Случай 4: heartbeat устарел
if ($hbAge -ne $null -and $hbAge -gt $HEARTBEAT_MAX_AGE_SEC) {
    Write-Watchdog "WARN" "Heartbeat too old ($hbAge sec > $HEARTBEAT_MAX_AGE_SEC). Restart."
    Stop-Bot
    Start-Sleep -Seconds 2
    Start-Bot
    return
}

# Случай 5: heartbeat файла нет вообще, но процесс есть → даём шанс, ждём следующий цикл
if ($hbAge -eq $null) {
    Write-Watchdog "WARN" "Heartbeat file missing but process exists. Will wait one more cycle."
    return
}

Write-Watchdog "OK" "Bot healthy. Heartbeat=$hbAge sec."
