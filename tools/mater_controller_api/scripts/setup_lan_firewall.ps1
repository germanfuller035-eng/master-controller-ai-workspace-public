# setup_lan_firewall.ps1
# Creates a PRIVATE-profile, LocalSubnet-only inbound rule for the API port.
# Run as Administrator. Rollback command included.
[CmdletBinding()]
param([int]$Port = 8787, [switch]$Remove)
$name = "MaterControllerAPI-LAN"
if ($Remove) {
    Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Host "Removed firewall rule '$name'."
    return
}
if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) {
    Write-Host "Firewall rule '$name' already exists."
    return
}
New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet | Out-Null
Write-Host "Created firewall rule '$name' (TCP $Port, Private profile, LocalSubnet)."
Write-Host "Rollback: .\setup_lan_firewall.ps1 -Remove"
