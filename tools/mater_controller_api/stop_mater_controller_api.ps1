# stop_mater_controller_api.ps1
# Stops only the Master Controller API process recorded in the PID file.
# Windows PowerShell 5.1 compatible. Never prints secrets.
[CmdletBinding()]
param()
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root '.mater_controller_api.pid'
$lockFile = Join-Path $root '.mater_controller_api.lock'

if (-not (Test-Path $pidFile)) {
    Write-Host "No PID file. API not tracked as running."
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
    exit 0
}
$apiPid = (Get-Content $pidFile | Select-Object -First 1)
$proc = Get-Process -Id $apiPid -ErrorAction SilentlyContinue
if ($proc -and $proc.ProcessName -like 'node*') {
    Stop-Process -Id $apiPid -Force
    Write-Host "Stopped Master Controller API (PID $apiPid)."
} else {
    Write-Host "Process $apiPid not running (stale PID)."
}
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
