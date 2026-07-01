# =============================================================
# find_telegram_pollers.ps1
# Find node.exe processes that may be competing Telegram pollers
#
# Usage:
#   .\find_telegram_pollers.ps1          # human-readable output
#   .\find_telegram_pollers.ps1 -Json    # machine-readable JSON ONLY
#
# JSON output format:
#   {
#     "timestamp":        "ISO8601",
#     "suspicious_count": 0,
#     "all_node_count":   0,
#     "suspicious":       [],
#     "all_node":         []
#   }
#
# Security: tokens are always masked before output.
# =============================================================

param(
    [switch]$Json
)

$ErrorActionPreference = 'SilentlyContinue'

# ---- UTF-8 (only matters for human mode) ----
if (-not $Json) {
    try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}
    try { chcp 65001 | Out-Null } catch {}
}

# ---- Token masking helper ----
function Mask-TokenString([string]$s) {
    if ([string]::IsNullOrEmpty($s)) { return $s }
    # Mask Telegram bot token pattern: 7-12 digits : 30+ alphanum chars
    $masked = [System.Text.RegularExpressions.Regex]::Replace(
        $s,
        '\d{7,12}:[A-Za-z0-9_-]{30,}',
        '[TOKEN_HIDDEN]'
    )
    # Also mask anything that looks like TELEGRAM_BOT_TOKEN=...
    $masked = [System.Text.RegularExpressions.Regex]::Replace(
        $masked,
        'TELEGRAM_BOT_TOKEN\s*=\s*\S+',
        'TELEGRAM_BOT_TOKEN=[TOKEN_HIDDEN]'
    )
    return $masked
}

# ---- Gather ALL node.exe processes ----
$ts = (Get-Date).ToString("o")   # ISO 8601

$allNodeProcs = @(Get-CimInstance Win32_Process `
    -Filter "Name = 'node.exe'" `
    -ErrorAction SilentlyContinue)

$allNodeCount = $allNodeProcs.Count

# ---- Classify suspicious: only actual Telegram polling processes ----
# Keyword must match AND script must NOT be in the safe-exclusion list.
$suspiciousKeywords = @(
    'telegram_master_bot',
    'telegram_gateway',
    'getUpdates',
    'polling'
)

# Known-safe diagnostic / test / healthcheck scripts — never suspicious
$safePatterns = @(
    '_test\.mjs',
    '_smoke_test\.mjs',
    'healthcheck',
    '_diagnostics',
    '_diag_env',
    'pollers_parser_test',
    'watch_master_bot',
    'telegram_gateway_smoke_test',
    'telegram_reliability_smoke_test',
    'telegram_live_silent_failure_test',
    'telegram_newleads_shape_test',
    'telegram_api_diagnostics',
    'find_telegram_pollers'
)

$suspiciousProcs = @($allNodeProcs | Where-Object {
    $cl = $_.CommandLine
    if ([string]::IsNullOrEmpty($cl)) { return $false }
    # Check exclusion list first
    foreach ($sp in $safePatterns) {
        if ($cl -imatch $sp) { return $false }
    }
    # Then check suspicious keywords
    foreach ($kw in $suspiciousKeywords) {
        if ($cl -imatch [regex]::Escape($kw)) { return $true }
    }
    return $false
})

$suspiciousCount = $suspiciousProcs.Count

# ---- Build result objects ----
function ConvertProc-ToObj($proc) {
    $cl = if ($proc.CommandLine) { $proc.CommandLine } else { '' }
    $clMasked = Mask-TokenString $cl
    return [PSCustomObject]@{
        pid           = [int]$proc.ProcessId
        command_line  = $clMasked
        creation_date = if ($proc.CreationDate) { $proc.CreationDate.ToString("o") } else { $null }
        working_set   = [long]$proc.WorkingSetSize
    }
}

$suspiciousObjs = @($suspiciousProcs | ForEach-Object { ConvertProc-ToObj $_ })
$allNodeObjs    = @($allNodeProcs    | ForEach-Object { ConvertProc-ToObj $_ })

# ====================================================================
# JSON MODE — output ONLY valid JSON, nothing else
# ====================================================================
if ($Json) {
    $result = [PSCustomObject]@{
        timestamp        = $ts
        suspicious_count = $suspiciousCount
        all_node_count   = $allNodeCount
        suspicious       = $suspiciousObjs
        all_node         = $allNodeObjs
    }
    # Use ConvertTo-Json and output cleanly
    $jsonStr = $result | ConvertTo-Json -Depth 5 -Compress:$false
    Write-Output $jsonStr
    exit 0
}

# ====================================================================
# HUMAN-READABLE MODE (default, no -Json)
# ====================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  FIND TELEGRAM POLLERS" -ForegroundColor Cyan
Write-Host "  Timestamp: $ts" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "[ BLOCK 1: Suspicious Telegram/Bot/Polling node.exe processes ]" -ForegroundColor Yellow
Write-Host "  Count: $suspiciousCount"

if ($suspiciousCount -eq 0) {
    Write-Host "  (none found)" -ForegroundColor Green
} else {
    Write-Host ""
    foreach ($p in $suspiciousObjs) {
        Write-Host "  PID          : $($p.pid)"              -ForegroundColor Red
        Write-Host "  command_line : $($p.command_line)"     -ForegroundColor Red
        Write-Host "  creation     : $($p.creation_date)"   -ForegroundColor Red
        Write-Host "  working_set  : $($p.working_set) bytes" -ForegroundColor Red
        Write-Host "  ---"
    }
}

Write-Host ""
Write-Host "[ BLOCK 2: All node.exe processes ]" -ForegroundColor Yellow
Write-Host "  Count: $allNodeCount"

if ($allNodeCount -eq 0) {
    Write-Host "  (none found)" -ForegroundColor Green
} else {
    Write-Host ""
    foreach ($p in $allNodeObjs) {
        Write-Host "  PID          : $($p.pid)"
        Write-Host "  command_line : $($p.command_line)"
        Write-Host "  creation     : $($p.creation_date)"
        Write-Host "  working_set  : $($p.working_set) bytes"
        Write-Host "  ---"
    }
}

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  SUMMARY: suspicious=$suspiciousCount  all_node=$allNodeCount" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""
