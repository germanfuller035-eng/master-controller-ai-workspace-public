# update_shortcuts_exhaustive.ps1 — repoint owner shortcuts: the visible demo now runs the FULL
# exhaustive control-by-control run; the old short walk is renamed "Краткий smoke-тест".
$ErrorActionPreference = 'Continue'
$lab = $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell
function MakeShortcut($name, $script) {
    $lnk = $ws.CreateShortcut((Join-Path $desktop "$name.lnk"))
    $lnk.TargetPath = "powershell.exe"
    $lnk.Arguments = "-ExecutionPolicy Bypass -NoExit -File `"$script`""
    $lnk.WorkingDirectory = $lab
    $lnk.IconLocation = "powershell.exe,0"
    $lnk.Save()
    Write-Host "shortcut: $name -> $(Split-Path $script -Leaf)"
}
# Full exhaustive visible run
MakeShortcut "Master Controller — Видимая демонстрация" (Join-Path $lab 'run_exhaustive_owner_visible.ps1')
# Rename old smoke (remove the misleading old visible-demo if it pointed at the short walk)
$oldSmoke = Join-Path $desktop "Master Controller — Краткий smoke-тест.lnk"
MakeShortcut "Master Controller — Краткий smoke-тест" (Join-Path $lab 'run_owner_visible_demo.ps1')
Write-Host "SHORTCUTS_UPDATED"
exit 0
