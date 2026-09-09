@echo off
setlocal

title Reiniciar CRM para Pruebas - DGX SPARC
cls
echo =====================================================================
echo       CRM SALVADORA - REINICIAR ENTORNO PARA PRUEBAS (DGX SPARC)
echo =====================================================================
echo.
echo Este script ejecuta las siguientes acciones en la base de datos (DGX SPARC):
echo   1. Elimina por completo todos los contactos.
echo   2. Elimina por completo todas las conversaciones y mensajes de chat.
echo   3. Elimina todas las citas y recordatorios de la agenda.
echo   4. Elimina todas las llamadas telefonicas y registros SMS.
echo   5. Elimina todos los registros de auditoria.
echo   6. Resetea a cero los datos del embudo de conversion.
echo.
echo NOTA: Todos los contactos y datos seran eliminados por completo
echo para dejar el entorno de pruebas limpio a cero.
echo =====================================================================
echo.

:: URL por defecto (produccion en Dokploy / DGX SPARC)
set "API_URL=https://crm-salvadoraconesa.jigretera.com/api/settings/reset-test-data"
if not "%~1"=="" (
    if not "%~1"=="-y" (
        set "API_URL=%~1"
    )
)

:: Contrasena de administrador
set "ADMIN_PASS=Admin1234!"
if not "%~2"=="" (
    set "ADMIN_PASS=%~2"
)

echo Destino: %API_URL%
echo.

:: Comprobar si se pasa parametro -y para salto de confirmacion
if "%~1"=="-y" goto :EXECUTE
if "%~2"=="-y" goto :EXECUTE

set "CONFIRM=S"
set /p "CONFIRM=Desea proceder con el reinicio? (Pulsa ENTER o escribe S para confirmar, N para cancelar) [S]: "

if /i "%CONFIRM%"=="N" goto :CANCEL
if /i "%CONFIRM%"=="NO" goto :CANCEL

:EXECUTE
echo.
echo [1/2] Conectando con el servidor en DGX SPARC...
echo.

set "TMP_RESP=%TEMP%\crm_reset_resp_%RANDOM%.json"

curl.exe -s -w "\nHTTP_STATUS:%%{http_code}" -X POST "%API_URL%" ^
  -H "Content-Type: application/json" ^
  -H "x-admin-password: %ADMIN_PASS%" > "%TMP_RESP%"

set "STATUS=000"
for /f "tokens=2 delims=:" %%A in ('findstr "HTTP_STATUS" "%TMP_RESP%"') do (
    set "STATUS=%%A"
)

echo [2/2] Respuesta del servidor:
type "%TMP_RESP%" | findstr /v "HTTP_STATUS"
echo.

if "%STATUS%"=="200" goto :SUCCESS
if "%STATUS%"=="201" goto :SUCCESS

echo =====================================================================
echo [ERROR] No se pudo completar el reinicio (Codigo HTTP: %STATUS%).
echo Revise si el servidor esta en linea y la contrasena es correcta.
echo =====================================================================
goto :END

:SUCCESS
echo =====================================================================
echo [EXITO] Entorno de pruebas REINICIADO correctamente en DGX SPARC:
echo   - Contactos eliminados al 100%%.
echo   - Conversaciones y mensajes borrados al 100%%.
echo   - Citas y recordatorios borrados al 100%%.
echo   - Registro de llamadas y SMS borrados al 100%%.
echo   - Registro de auditorias vaciado.
echo   - Embudo de ventas reseteado al estado inicial.
echo =====================================================================
goto :END

:CANCEL
echo.
echo [INFO] Operacion cancelada. No se modifico ningun dato.
goto :END

:END
if exist "%TMP_RESP%" del "%TMP_RESP%"
echo.
echo Si tienes la ventana web del CRM abierta, pulsa F5 (recargar) para ver los cambios.
echo.
pause
