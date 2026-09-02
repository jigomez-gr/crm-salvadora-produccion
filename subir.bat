@echo off
chcp 65001 >nul
echo ========================================================
echo        Subir cambios a Git - CRM Salvadora
echo ========================================================
echo.

set "mensaje="
set /p mensaje="Introduce el motivo del cambio (pulsa Enter para omitir): "

if "%mensaje%"=="" (
    set mensaje=Actualización del sistema
)

echo.
echo [+] Añadiendo archivos a Git...
git add .

echo [+] Creando commit: "%mensaje%"
git commit -m "%mensaje%"

echo [+] Subiendo a GitHub...
git push origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo    [OK] ¡Cambios subidos correctamente a GitHub!
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo    [ERROR] Hubo un problema al subir los cambios a Git.
    echo ========================================================
)

echo.
pause
