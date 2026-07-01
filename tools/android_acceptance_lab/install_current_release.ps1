# install_current_release.ps1 — verify + install the confirmed RC3 APK over the current app (keep data).
$ErrorActionPreference = 'Stop'
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$adb = "$sdk\platform-tools\adb.exe"
$aapt = "$sdk\build-tools\34.0.0\aapt2.exe"
$apk = "D:\AI_WORKSPACE\dist\master_controller_android\MasterController-release-v0.8.0-rc3.apk"
$expectSha = "2dd19595a91dd771a92363414020fb71e8020d75d940701c0e9f7d03bd289749"
$log = "$PSScriptRoot\..\..\_generated\android_acceptance_lab\logs\install.log"
function Log($m) { $line = "[{0}] {1}" -f (Get-Date -Format o), $m; Write-Host $line; Add-Content -Path $log -Value $line -Encoding utf8 }
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

if (-not (Test-Path $apk)) { Log "APK_MISSING $apk"; exit 1 }
$sha = (Get-FileHash $apk -Algorithm SHA256).Hash.ToLower()
Log "APK SHA256=$sha"
if ($sha -ne $expectSha) { Log "SHA_MISMATCH expected=$expectSha"; exit 1 }
$badging = & $aapt dump badging $apk 2>$null | Select-String '^package:'
Log "badging: $badging"

Log "Installing (-r, keep data)…"
$out = & $adb install -r $apk 2>&1
Log "install output: $out"
if ($out -match 'Success') {
    $v = & $adb shell dumpsys package ru.dmitry.matercontroller | Select-String 'versionName|versionCode' | Select-Object -First 2
    Log "installed: $($v -join ' ')"
    Log "INSTALL_RESULT=SUCCESS"; exit 0
} else { Log "INSTALL_RESULT=FAILED"; exit 1 }
