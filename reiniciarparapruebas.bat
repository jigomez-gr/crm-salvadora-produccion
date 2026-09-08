@echo off
setlocal enabledelayedexpansion

title Reiniciar CRM para Pruebas - DGX SPARC
cls
echo =====================================================================
echo       CRM SALVADORA - REINICIAR ENTORNO PARA PRUEBAS (DGX SPARC)
echo =====================================================================
echo.
echo Este script ejecuta las siguientes acciones en la base de datos:
echo   1. Inicializa todos los contactos a LEADS y sin ser alumnos de yoga.
echo   2. Elimina por completo todas las conversaciones y mensajes.
echo   3. Elimina todas las citas y recordatorios.
echo   4. Elimina todas las llamadas telefonicas y registros SMS.
echo   5. Elimina los registros de auditoria.
echo   6. Elimina y resetea las metricas del embudo de ventas.
echo.
echo [!] Los contactos NO se borran, se mantienen con sus telefonos y nombres.
echo.

:: URL por defecto (produccion en Dokploy / DGX SPARC)
set "API_URL=https://crm-salvadoraconesa.jigretera.com/api/settings/reset-test-data"
if not "%~1"=="" (
    set "API_URL=%~1"
)

:: Contrasena de administrador
set "ADMIN_PASS=Admin1234!"
if not "%~2"=="" (
    set "ADMIN_PASS=%~2"
)

echo Destino: %API_URL%
echo.
set /p CONFIRM="Desea continuar con el reinicio de pruebas? (S/N): "
if /i not "%CONFIRM%"=="S" (
    echo.
    echo Operacion cancelada por el usuario.
    pause
    exit /b 0
)

echo.
echo Conectando con el servidor y ejecutando reinicio...
echo.

set "TMP_RESP=%TEMP%\crm_reset_resp_%RANDOM%.json"

curl.exe -s -w "\nHTTP_STATUS:%%{http_code}" -X POST "%API_URL%" ^
  -H "Content-Type: application/json" ^
  -H "x-admin-password: %ADMIN_PASS%" > "%TMP_RESP%"

for /f "tokens=2 delims=:" %%A in ('findstr "HTTP_STATUS" "%TMP_RESP%"') do (
    set "STATUS=%%A"
)

echo Respuesta del servidor:
type "%TMP_RESP%" | findstr /v "HTTP_STATUS"
echo.

if "%STATUS%"=="200" (
    echo =====================================================================
    echo [OK] El entorno de pruebas se ha reiniciado con EXITO en DGX SPARC.
    echo =====================================================================
) else if "%STATUS%"=="201" (
    echo =====================================================================
    echo [OK] El entorno de pruebas se ha reiniciado con EXITO en DGX SPARC.
    echo =====================================================================
) else (
    echo =====================================================================
    echo [ERROR] Fallo en la ejecucion (Codigo HTTP: %STATUS%).
    echo Verifique que el servicio este levantado y accesible.
    echo =====================================================================
)

if exist "%TMP_RESP%" del "%TMP_RESP%"

echo.
pause
