# create_desktop_shortcuts.ps1 — owner desktop shortcuts that launch the lab scripts (no manual commands).
$ErrorActionPreference = 'Stop'
$lab = $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell
function MakeShortcut($name, $script, [switch]$Visible) {
    $lnk = $ws.CreateShortcut((Join-Path $desktop "$name.lnk"))
    $lnk.TargetPath = "powershell.exe"
    $style = if ($Visible) { "-NoExit" } else { "" }
    $lnk.Arguments = "-ExecutionPolicy Bypass $style -File `"$script`""
    $lnk.WorkingDirectory = $lab
    $lnk.IconLocation = "powershell.exe,0"
    $lnk.Save()
    Write-Host "Created: $name -> $script"
}
MakeShortcut "Master Controller — Запустить эмулятор"   (Join-Path $lab 'start_visible_emulator.ps1') -Visible
MakeShortcut "Master Controller — Полный автотест"      (Join-Path $lab 'run_full_acceptance.ps1') -Visible
MakeShortcut "Master Controller — Видимая демонстрация" (Join-Path $lab 'run_owner_visible_demo.ps1') -Visible
MakeShortcut "Master Controller — Открыть последний отчёт" (Join-Path $lab 'open_latest_report.ps1')
Write-Host "SHORTCUTS_CREATED=4"
exit 0
