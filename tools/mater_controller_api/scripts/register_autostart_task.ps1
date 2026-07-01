# register_autostart_task.ps1
# Registers a Windows Task Scheduler entry that starts the Master Controller API
# at user logon (hidden), using the canonical start script. Rollback included.
[CmdletBinding()]
param([switch]$Remove, [switch]$Lan)
$taskName = "MaterControllerAPI"
$apiRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$startScript = Join-Path $apiRoot "start_mater_controller_api.ps1"

if ($Remove) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task '$taskName'."
    return
}

$arg = if ($Lan) { "-Lan" } else { "" }
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`" $arg"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Registered scheduled task '$taskName' (starts API hidden at logon)."
Write-Host "Rollback: .\register_autostart_task.ps1 -Remove"
