# PowerShell script para prueba de endpoints de envío SMS

param(
    [string]$Phone = "34611223344",
    [string]$Message = "Centro Salvadora: Tu plaza esta confirmada. Para recibir recordatorios por email, responde con tu correo."
)

$payload = @{
    number = $Phone
    message = $Message
} | ConvertTo-Json

Write-Host "=== Probando Endpoint C# (http://localhost:5005/api/sms/send) ===" -ForegroundColor Cyan
try {
    $resCsharp = Invoke-RestMethod -Uri "http://localhost:5005/api/sms/send" -Method Post -Body $payload -ContentType "application/json" -TimeoutSec 10
    $resCsharp | Format-List
} catch {
    Write-Host "Endpoint C# no responde o no está corriendo: $_" -ForegroundColor Yellow
}

Write-Host "`n=== Probando Endpoint NestJS CRM (http://localhost:3000/api/sms/send) ===" -ForegroundColor Cyan
try {
    $resNest = Invoke-RestMethod -Uri "http://localhost:3000/api/sms/send" -Method Post -Body $payload -ContentType "application/json" -TimeoutSec 10
    $resNest | Format-List
} catch {
    Write-Host "Endpoint NestJS no responde o no está corriendo: $_" -ForegroundColor Yellow
}
