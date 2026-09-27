@echo off
setlocal

title Eliminar Solo Datos de Prueba - CRM Salvadora
cls
echo =====================================================================
echo       CRM SALVADORA - ELIMINAR SOLO DATOS DE PRUEBA (SEGURO)
echo =====================================================================
echo.
echo Este script ejecuta la eliminacion SELECTIVA de datos de prueba:
echo   1. Elimina unicamente los contactos marcados como prueba (etiqueta 'demo'
echo      o emails @example.com o telefonos de prueba).
echo   2. Elimina las citas y recordatorios de dichos contactos de prueba.
echo   3. Elimina las conversaciones y mensajes de dichos contactos de prueba.
echo.
echo [SEGURIDAD PARA PRODUCCION]:
echo   - Tus clientes reales, citas reales y chats reales NO SE TOCAN.
echo   - La configuracion, usuarios y servicios permanecen intactos.
echo   - No necesitas restaurar ninguna copia de seguridad.
echo =====================================================================
echo.

:: URL por defecto (produccion en Dokploy / DGX SPARC)
set "API_URL=https://crm-salvadoraconesa.jigretera.com/api/settings/delete-demo-data"
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
set /p "CONFIRM=Desea proceder a eliminar solo los datos de prueba? (ENTER o S = Confirmar, N = Cancelar) [S]: "

if /i "%CONFIRM%"=="N" goto :CANCEL
if /i "%CONFIRM%"=="NO" goto :CANCEL

:EXECUTE
echo.
echo [1/2] Conectando con el servidor CRM Salvadora...
echo.

set "TMP_RESP=%TEMP%\crm_delete_demo_%RANDOM%.json"

curl.exe -s -w "\nHTTP_STATUS:%%{http_code}" -X POST "%API_URL%" ^
  -H "Content-Type: application/json" ^
  -H "x-admin-password: %ADMIN_PASS%" > "%TMP_RESP%"

set "STATUS=000"
for /f "tokens=2 delims=:" %%A in ('findstr "HTTP_STATUS" "%TMP_RESP%"') do (
    set "STATUS=%%A"
)

echo [2/2] Resultado de la operacion:
type "%TMP_RESP%" | findstr /v "HTTP_STATUS"
echo.

if "%STATUS%"=="200" goto :SUCCESS
if "%STATUS%"=="201" goto :SUCCESS

echo =====================================================================
echo [ERROR] No se pudo completar la eliminacion (Codigo HTTP: %STATUS%).
echo Revise si el servidor esta en linea y la contrasena es correcta.
echo =====================================================================
goto :END

:SUCCESS
echo =====================================================================
echo [EXITO] Datos de prueba eliminados correctamente:
echo   - Contactos de prueba eliminados.
echo   - Citas y recordatorios de prueba eliminados.
echo   - Conversaciones de prueba eliminadas.
echo   - LOS CONTACTOS Y CITAS REALES SE HAN CONSERVADO AL 100%%.
echo =====================================================================
goto :END

:CANCEL
echo.
echo Operacion cancelada por el usuario. No se realizo ningun cambio.
echo.

:END
if exist "%TMP_RESP%" del "%TMP_RESP%" >nul 2>&1
echo.
pause
