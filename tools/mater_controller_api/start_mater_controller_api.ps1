# start_mater_controller_api.ps1
# Starts the Master Controller API as a single background process.
# Windows PowerShell 5.1 compatible. Never prints secrets.
# Usage: .\start_mater_controller_api.ps1 [-Lan] [-Port 8787] [-NoSend] [-LocalWriter]
[CmdletBinding()]
param(
    [switch]$Lan,
    [int]$Port = 8787,
    [switch]$NoSend,
    [switch]$LocalWriter
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root '.mater_controller_api.pid'
$lockFile = Join-Path $root '.mater_controller_api.lock'
$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# --- single instance guard with stale-pid recovery ---
if (Test-Path $pidFile) {
    $existing = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($existing) {
        $proc = Get-Process -Id $existing -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -like 'node*') {
            Write-Host "Master Controller API already running (PID $existing). Use stop script first."
            exit 0
        } else {
            Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
            Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
        }
    }
}

$env:MATER_API_PORT = "$Port"
$env:MATER_API_AUTOSTART = 'true'
if ($Lan) { $env:MATER_API_LAN = 'true' } else { $env:MATER_API_LAN = 'false' }
if ($NoSend) { $env:MATER_NO_SEND = 'true' }
if ($LocalWriter) { $env:MATER_CANONICAL_WRITER = 'true' }

$entry = Join-Path $root 'src\server\index.mjs'
$outLog = Join-Path $logDir 'mater_api.out.log'
$errLog = Join-Path $logDir 'mater_api.err.log'

# --- log rotation (keep last ~2MB) ---
foreach ($lf in @($outLog, $errLog)) {
    if ((Test-Path $lf) -and ((Get-Item $lf).Length -gt 2MB)) {
        Move-Item $lf "$lf.1" -Force
    }
}

$proc = Start-Process -FilePath 'node' -ArgumentList $entry -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog
Start-Sleep -Seconds 2
Set-Content -Path $pidFile -Value $proc.Id -Encoding ascii

$mode = if ($Lan) { "LAN (0.0.0.0)" } else { "loopback (127.0.0.1)" }
Write-Host "Master Controller API started. PID $($proc.Id), port $Port, bind $mode."
Write-Host "Health: http://127.0.0.1:$Port/api/v1/health"
