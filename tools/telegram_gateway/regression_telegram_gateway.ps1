<#
.SYNOPSIS
    R4B Regression PowerShell Wrapper (CHECK-ONLY, SAFE)

.DESCRIPTION
    Unified operator interface for R4. This is a THIN wrapper that delegates
    to the already-GREEN smoke pack:

        tools/tests/r4_smoke_pack.mjs

    The wrapper itself performs NO logic of its own beyond argument routing.
    It does NOT touch bot runtime, does NOT call Telegram API, does NOT read
    tokens, does NOT write any queue, does NOT import leads, does NOT contact
    clients, does NOT autosend, and does NOT start/stop/restart the bot.

.COMMANDS
    run      -> node .\tools\tests\r4_smoke_pack.mjs
    syntax   -> node .\tools\tests\r4_smoke_pack.mjs --syntax-only
    help     -> show usage

.NOTES
    Exit code is passed through unchanged from the underlying Node process.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\telegram_gateway\regression_telegram_gateway.ps1 help
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\telegram_gateway\regression_telegram_gateway.ps1 run
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\telegram_gateway\regression_telegram_gateway.ps1 syntax
#>

param(
    [Parameter(Position = 0)]
    [string]$Command = 'help'
)

$ErrorActionPreference = 'Stop'

# Resolve workspace root relative to this script: tools/telegram_gateway/ -> root
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Workspace   = Resolve-Path (Join-Path $ScriptDir '..\..')
$SmokePack   = Join-Path $Workspace 'tools\tests\r4_smoke_pack.mjs'

function Show-Help {
    Write-Host ''
    Write-Host 'R4B Regression Wrapper (CHECK-ONLY, SAFE)'
    Write-Host '-----------------------------------------'
    Write-Host 'Delegates to: tools/tests/r4_smoke_pack.mjs'
    Write-Host ''
    Write-Host 'Commands:'
    Write-Host '  run      Full safe smoke   -> node .\tools\tests\r4_smoke_pack.mjs'
    Write-Host '  syntax   Syntax-only smoke  -> node .\tools\tests\r4_smoke_pack.mjs --syntax-only'
    Write-Host '  help     Show this help'
    Write-Host ''
    Write-Host 'Guarantees: no Telegram API, no token read, no queue write,'
    Write-Host 'no real import, no client contact, no autosend, no bot start/stop/restart.'
    Write-Host ''
}

function Invoke-SmokePack {
    param([string[]]$ExtraArgs)

    if (-not (Test-Path $SmokePack)) {
        Write-Host "ERROR: smoke pack not found: $SmokePack"
        exit 2
    }

    $nodeArgs = @($SmokePack) + $ExtraArgs
    # Run from workspace root so the smoke pack resolves its relative paths.
    Push-Location $Workspace
    try {
        & node @nodeArgs
        $code = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    exit $code
}

switch ($Command.ToLowerInvariant()) {
    'run'    { Invoke-SmokePack -ExtraArgs @() }
    'syntax' { Invoke-SmokePack -ExtraArgs @('--syntax-only') }
    'help'   { Show-Help; exit 0 }
    '-h'     { Show-Help; exit 0 }
    '--help' { Show-Help; exit 0 }
    default {
        Write-Host "Unknown command: '$Command'"
        Show-Help
        exit 2
    }
}
