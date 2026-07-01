# Emergency live fix apply script — does steps 1-5: stop, backup, env check, install hardened bot
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$bd = 'D:\AI_WORKSPACE\tools\telegram_gateway'
$ts = '2026-05-27'

Write-Host '=== STEP 1: Stop existing bot ==='
try {
    Stop-Process -Id 2852 -Force -ErrorAction Stop
    Write-Host 'PID 2852 stopped'
} catch {
    Write-Host "stop note: $($_.Exception.Message)"
}
Start-Sleep -Seconds 2

$remaining = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -imatch 'telegram_master_bot' })
if ($remaining.Count -gt 0) {
    foreach ($p in $remaining) {
        Write-Host "Killing leftover PID $($p.ProcessId)"
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host 'No leftover bot processes'
}

Write-Host '=== STEP 2: Remove lock if present ==='
$lock = Join-Path $bd '.telegram_master_bot.lock'
if (Test-Path $lock) { Remove-Item $lock -Force; Write-Host 'lock removed' } else { Write-Host 'no lock' }

Write-Host '=== STEP 3: Backup originals ==='
foreach ($f in @('telegram_master_bot.mjs','sales_commands_phase1.mjs','start_master_bot.ps1')) {
    $src = Join-Path $bd $f
    $dst = $src + ".bak_emergency_live_fix_$ts"
    if ((Test-Path $src) -and -not (Test-Path $dst)) {
        Copy-Item $src $dst -Force
        Write-Host "backup: $f"
    } elseif (Test-Path $dst) {
        Write-Host "backup already exists: $f"
    }
}

Write-Host '=== STEP 4: env presence check ==='
$envFile = Join-Path $bd '.env'
if (-not (Test-Path $envFile)) {
    Write-Host '.env NOT FOUND in gateway dir; checking workspace root...'
    $envFile = 'D:\AI_WORKSPACE\.env'
}
if (Test-Path $envFile) {
    $envRaw = Get-Content $envFile -Raw
    $tokOk = $envRaw -match 'TELEGRAM_BOT_TOKEN\s*=\s*(\S+)'
    $tokVal = if ($tokOk) { $Matches[1] } else { '' }
    $chatVal = ''
    if ($envRaw -match 'TELEGRAM_CHAT_ID\s*=\s*(\S+)') { $chatVal = $Matches[1] }
    elseif ($envRaw -match 'CHAT_ID\s*=\s*(\S+)')      { $chatVal = $Matches[1] }
    elseif ($envRaw -match 'TELEGRAM_ADMIN_CHAT_ID\s*=\s*(\S+)') { $chatVal = $Matches[1] }
    $tokPresent = if ($tokVal -and $tokVal.Length -gt 20) { 'yes' } else { 'no' }
    $chatPresent = if ($chatVal) { 'yes' } else { 'no' }
    Write-Host "BOT_TOKEN present: $tokPresent"
    Write-Host "CHAT_ID present: $chatPresent"
    if ($chatVal) {
        $last4 = $chatVal.Substring([Math]::Max(0, $chatVal.Length - 4))
        Write-Host "CHAT_ID last4: $last4"
    }
} else {
    Write-Host '.env NOT FOUND anywhere'
}

Write-Host '=== STEP 5: Replace telegram_master_bot.mjs with hardened version ==='
$src = Join-Path $bd 'telegram_master_bot_hardened.mjs'
$dst = Join-Path $bd 'telegram_master_bot.mjs'
if (Test-Path $src) {
    Copy-Item $src $dst -Force
    Write-Host 'hardened bot installed as telegram_master_bot.mjs'
} else {
    Write-Host 'ERROR: hardened source not found at ' $src
}

Write-Host '=== DONE ==='
