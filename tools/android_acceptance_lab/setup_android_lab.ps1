# setup_android_lab.ps1 — verify (do not reinstall) the Android toolchain for the acceptance lab.
# Idempotent. Exits 0 only if every required component is present.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$log = "$PSScriptRoot\..\..\_generated\android_acceptance_lab\logs\setup.log"
function Log($m) { $line = "[{0}] {1}" -f (Get-Date -Format o), $m; Write-Host $line; Add-Content -Path $log -Value $line -Encoding utf8 }

New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
Log "=== setup_android_lab start ==="
$ok = $true
function Need($name, $path) {
    if (Test-Path $path) { Log "OK   $name -> $path" } else { Log "MISS $name -> $path"; $script:ok = $false }
}
Need "adb"           "$sdk\platform-tools\adb.exe"
Need "emulator"      "$sdk\emulator\emulator.exe"
Need "build-tools34" "$sdk\build-tools\34.0.0\aapt2.exe"
Need "platform34"    "$sdk\platforms\android-34"
Need "sysimage"      "$sdk\system-images\android-34\google_apis\x86_64"
# JDK (java prints version to stderr; capture both streams)
$jv = (cmd /c "java -version 2>&1" | Select-Object -First 1)
if ($jv -match 'version') { Log "OK   JDK -> $jv" } else { Log "MISS JDK"; $ok = $false }

if ($ok) { Log "SETUP_RESULT=READY"; exit 0 } else { Log "SETUP_RESULT=MISSING_COMPONENTS"; exit 1 }
