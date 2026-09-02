@echo off
cls
echo ========================================================
echo        Subir cambios a Git - CRM Salvadora
echo ========================================================
echo.

set "mensaje="
set /p "mensaje=Introduce el motivo del cambio (Enter para omitir): "

if not defined mensaje set "mensaje=Actualizacion del sistema"
if "%mensaje%"=="" set "mensaje=Actualizacion del sistema"
if "%mensaje%"==" " set "mensaje=Actualizacion del sistema"

echo.
echo [+] Anadiendo archivos a Git...
git add -A

echo [+] Creando commit: "%mensaje%"
git commit -m "%mensaje%"

echo [+] Subiendo a GitHub...
git push origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo    [OK] Cambios subidos correctamente a GitHub!
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo    [ERROR] Hubo un problema al subir a Git.
    echo ========================================================
)

echo.
pause
