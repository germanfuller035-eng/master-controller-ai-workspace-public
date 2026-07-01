# check_mater_controller_api.ps1
# Health + heartbeat check for the Master Controller API.
# Windows PowerShell 5.1 compatible. Never prints secrets.
[CmdletBinding()]
param([int]$Port = 8787)
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspace = Resolve-Path (Join-Path $root '..\..')
$runtimeDir = if ($env:MATER_RUNTIME_DIR) { $env:MATER_RUNTIME_DIR } else { Join-Path $workspace '.runtime\mater_controller_api' }
$dataDir = if ($env:MATER_API_DATA_DIR) { $env:MATER_API_DATA_DIR } else { Join-Path $runtimeDir 'data' }
$pidFile = Join-Path $root '.mater_controller_api.pid'
$hbFile = Join-Path $dataDir 'api_heartbeat.json'

Write-Host "=== Master Controller API check ==="
if (Test-Path $pidFile) {
    $apiPid = (Get-Content $pidFile | Select-Object -First 1)
    $proc = Get-Process -Id $apiPid -ErrorAction SilentlyContinue
    Write-Host ("PID file: {0}  process_alive: {1}" -f $apiPid, [bool]$proc)
} else {
    Write-Host "PID file: (none)"
}

try {
    $resp = Invoke-RestMethod "http://127.0.0.1:$Port/api/v1/health" -TimeoutSec 5
    Write-Host ("Health: {0}  service: {1}  apiVersion: {2}" -f $resp.data.status, $resp.data.service, $resp.data.apiVersion)
} catch {
    Write-Host "Health: UNREACHABLE on port $Port"
}

if (Test-Path $hbFile) {
    $hb = Get-Content $hbFile -Raw | ConvertFrom-Json
    Write-Host ("Heartbeat: status={0} bind={1} port={2} lastBeat={3}" -f $hb.status, $hb.bind, $hb.port, $hb.lastBeat)
} else {
    Write-Host "Heartbeat: (none)"
}
