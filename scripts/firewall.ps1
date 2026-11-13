# Abre los puertos del mando SOLO para redes privadas (la de casa). Ejecutar como administrador:
#   powershell -ExecutionPolicy Bypass -File scripts\firewall.ps1
$ports = @(8443, 8080)
Remove-NetFirewallRule -DisplayName 'Mando PC' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'Mando PC' -Direction Inbound -Action Allow -Protocol TCP `
  -LocalPort $ports -Profile Private -RemoteAddress LocalSubnet | Out-Null
Write-Host "Regla 'Mando PC' creada: TCP $($ports -join ', ') solo en red privada y subred local."
Write-Host "Comprueba que tu wifi esté como 'Red privada' en Configuración > Red e Internet."
