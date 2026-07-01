$ErrorActionPreference = 'SilentlyContinue'
$bots = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'telegram_master_bot|telegram_gateway' }
foreach ($b in $bots) {
  $cl = ($b.CommandLine -replace '.*node(\.exe)?\s+','') -replace '\".*','' 
  Write-Host ("PID=" + $b.ProcessId + "  STARTED=" + $b.CreationDate + "  CMD=" + ($cl.Substring(0,[Math]::Min(140,$cl.Length))))
}
Write-Host ("COUNT=" + ($bots | Measure-Object).Count)
