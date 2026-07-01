# dump_runtime_controls.ps1 — walk key owner screens, dump UIAutomator semantics, emit RUNTIME_CONTROL_INVENTORY.json
$ErrorActionPreference = 'Continue'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$out = "D:\AI_WORKSPACE\.claude\worktrees\android-exhaustive-control-acceptance-v2\_generated\android_acceptance_lab\exhaustive\RUNTIME_CONTROL_INVENTORY.json"
$pkg = 'ru.dmitry.matercontroller'
$script:all = New-Object System.Collections.ArrayList

function DumpScreen($name) {
  & $adb shell uiautomator dump /sdcard/ui.xml 2>$null | Out-Null
  $xml = & $adb exec-out cat /sdcard/ui.xml
  $nodes = [regex]::Matches($xml, '<node[^>]*?/>|<node[^>]*?>')
  foreach ($n in $nodes) {
    $s = $n.Value
    $click = ([regex]::Match($s,'clickable="(true|false)"')).Groups[1].Value
    $check = ([regex]::Match($s,'checkable="(true|false)"')).Groups[1].Value
    $edit  = ([regex]::Match($s,'(?:class="[^"]*EditText[^"]*")')).Success
    $longc = ([regex]::Match($s,'long-clickable="true"')).Success
    if ($click -eq 'true' -or $check -eq 'true' -or $edit -or $longc) {
      [void]$script:all.Add([PSCustomObject]@{
        screen = $name
        text = ([regex]::Match($s,'text="([^"]*)"')).Groups[1].Value
        desc = ([regex]::Match($s,'content-desc="([^"]*)"')).Groups[1].Value
        resid = ([regex]::Match($s,'resource-id="([^"]*)"')).Groups[1].Value
        class = ([regex]::Match($s,'class="([^"]*)"')).Groups[1].Value
        clickable = $click; checkable = $check; editable = $edit
        bounds = ([regex]::Match($s,'bounds="([^"]*)"')).Groups[1].Value
      })
    }
  }
}
function TapText($t) {
  & $adb shell uiautomator dump /sdcard/ui.xml 2>$null | Out-Null
  $xml = & $adb exec-out cat /sdcard/ui.xml
  $m = [regex]::Match($xml, ('<node[^>]*text="' + [regex]::Escape($t) + '"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'))
  if ($m.Success) { $x=[int](([int]$m.Groups[1].Value+[int]$m.Groups[3].Value)/2); $y=[int](([int]$m.Groups[2].Value+[int]$m.Groups[4].Value)/2); & $adb shell input tap $x $y | Out-Null; Start-Sleep -Milliseconds 1500; return $true }
  return $false
}

& $adb shell am force-stop $pkg | Out-Null; Start-Sleep -Milliseconds 500
& $adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 2>$null | Out-Null
Start-Sleep -Seconds 5

DumpScreen "today"
TapText "Командный центр" | Out-Null; DumpScreen "command_center"; & $adb shell input keyevent 4 | Out-Null; Start-Sleep -Milliseconds 800
TapText "Лиды" | Out-Null; DumpScreen "leads"
TapText "Решения" | Out-Null; DumpScreen "decisions"
TapText "Ответы" | Out-Null; DumpScreen "replies"
TapText "Система" | Out-Null; DumpScreen "system"
TapText "Надёжность" | Out-Null; DumpScreen "reliability"; & $adb shell input keyevent 4 | Out-Null; Start-Sleep -Milliseconds 800
TapText "Расходы и лимиты" | Out-Null; DumpScreen "cost"; & $adb shell input keyevent 4 | Out-Null; Start-Sleep -Milliseconds 800
TapText "Резервные копии" | Out-Null; DumpScreen "backup"; & $adb shell input keyevent 4 | Out-Null; Start-Sleep -Milliseconds 800
TapText "Push-уведомления" | Out-Null; DumpScreen "push"

$result = [PSCustomObject]@{
  scan_version = "runtime_v2"
  screens_walked = ($script:all | Select-Object -ExpandProperty screen -Unique)
  total_runtime_controls = $script:all.Count
  controls = $script:all
}
$result | ConvertTo-Json -Depth 6 | Out-File $out -Encoding utf8
Write-Host "runtime controls captured: $($script:all.Count) across $(($script:all | Select-Object -ExpandProperty screen -Unique).Count) screens"
