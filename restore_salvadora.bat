@echo off
setlocal EnableDelayedExpansion

echo ======================================================================
echo   RESTORE AUTOMATIZADO POSTGRESQL - DGX-SPARK (SALVADORA)
echo ======================================================================
echo.

REM 1. LOCALIZAR POWERSHELL PARA DIA Y TIMESTAMP
set "PS_BIN=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_BIN%" set "PS_BIN=powershell.exe"

"%PS_BIN%" -NoProfile -Command "switch ((Get-Date).DayOfWeek) { 'Monday' {'lunes'} 'Tuesday' {'martes'} 'Wednesday' {'miercoles'} 'Thursday' {'jueves'} 'Friday' {'viernes'} 'Saturday' {'sabado'} 'Sunday' {'domingo'} }" > "%TEMP%\restore_dia.txt"
set /p DIA=<"%TEMP%\restore_dia.txt"
del "%TEMP%\restore_dia.txt" >nul 2>&1

"%PS_BIN%" -NoProfile -Command "(Get-Date).ToString('yyyyMMdd_HHmmss')" > "%TEMP%\restore_ts.txt"
set /p TIMESTAMP=<"%TEMP%\restore_ts.txt"
del "%TEMP%\restore_ts.txt" >nul 2>&1

if "%DIA%"=="" set "DIA=sabado"
if "%TIMESTAMP%"=="" set "TIMESTAMP=actual"

REM 2. DETERMINAR DIRECTORIO DE BACKUP ORIGEN
set "INPUT_DIR=%~1"
set "FORCE_YES=0"

if "%~1"=="/y" set "INPUT_DIR=" & set "FORCE_YES=1"
if "%~1"=="-y" set "INPUT_DIR=" & set "FORCE_YES=1"
if "%~2"=="/y" set "FORCE_YES=1"
if "%~2"=="-y" set "FORCE_YES=1"
if "%~1"=="/silent" set "INPUT_DIR=" & set "FORCE_YES=1"
if "%~2"=="/silent" set "FORCE_YES=1"

if "%INPUT_DIR%"=="" (
    set "DEFAULT_DIR=O:\backupbds\salvadora\%DIA%"
    echo No ha indicado un directorio de backup por parametro.
    echo Directorio sugerido para hoy [!DIA!]: !DEFAULT_DIR!
    set /p "INPUT_DIR=Introduzca directorio a restaurar [Pulsar ENTER para usar el sugerido]: "
    if "!INPUT_DIR!"=="" set "INPUT_DIR=!DEFAULT_DIR!"
)

REM Quitar comillas si las tuviera
for /f "delims=" %%I in ("!INPUT_DIR!") do set "BACKUP_DIR=%%~fI"

echo.
echo [ORIGEN]   "!BACKUP_DIR!"

if not exist "!BACKUP_DIR!" (
    echo [ERROR CRITICO] El directorio "!BACKUP_DIR!" no existe.
    exit /b 1
)

REM 3. LOCALIZAR BINARIOS POSTGRESQL PG_RESTORE Y PSQL
set "PG_RESTORE="
set "PG_PSQL="

if exist "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" (
    set "PG_RESTORE=C:\Program Files\PostgreSQL\16\bin\pg_restore.exe"
    set "PG_PSQL=C:\Program Files\PostgreSQL\16\bin\psql.exe"
)
if "%PG_RESTORE%"=="" if exist "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" (
    set "PG_RESTORE=C:\Program Files\PostgreSQL\17\bin\pg_restore.exe"
    set "PG_PSQL=C:\Program Files\PostgreSQL\17\bin\psql.exe"
)
if "%PG_RESTORE%"=="" if exist "C:\Program Files\PostgreSQL\15\bin\pg_restore.exe" (
    set "PG_RESTORE=C:\Program Files\PostgreSQL\15\bin\pg_restore.exe"
    set "PG_PSQL=C:\Program Files\PostgreSQL\15\bin\psql.exe"
)

if "%PG_RESTORE%"=="" (
    where pg_restore.exe >nul 2>&1
    if not errorlevel 1 set "PG_RESTORE=pg_restore.exe"
)
if "%PG_PSQL%"=="" (
    where psql.exe >nul 2>&1
    if not errorlevel 1 set "PG_PSQL=psql.exe"
)

if "%PG_RESTORE%"=="" (
    echo [ERROR CRITICO] No se encontro el binario pg_restore.exe de PostgreSQL.
    exit /b 2
)

echo [BINARIO]  "%PG_RESTORE%"

REM 4. COMPROBAR QUE EL DIRECTORIO TIENE UN BACKUP VALIDO
set "DUMP_FILE="
if exist "!BACKUP_DIR!\crm_salvadora_latest.dump" (
    set "DUMP_FILE=!BACKUP_DIR!\crm_salvadora_latest.dump"
) else (
    for /f "delims=" %%F in ('dir /b /o-d "!BACKUP_DIR!\crm_salvadora*.dump" 2^>nul') do (
        if not defined DUMP_FILE set "DUMP_FILE=!BACKUP_DIR!\%%F"
    )
)

if "%DUMP_FILE%"=="" (
    echo [ERROR CRITICO] No se encontro ningun archivo de backup .dump de crm_salvadora en "!BACKUP_DIR!".
    exit /b 3
)

echo [ARCHIVO]  "%DUMP_FILE%"
echo [VERIF]    Comprobando integridad del backup mediante pg_restore --list...

"%PG_RESTORE%" -l "%DUMP_FILE%" > "%TEMP%\verify_toc.txt" 2>&1
if errorlevel 1 (
    echo [ERROR CRITICO] El archivo "%DUMP_FILE%" no es un archivo de backup valido o esta corrupto.
    del "%TEMP%\verify_toc.txt" >nul 2>&1
    exit /b 4
)
del "%TEMP%\verify_toc.txt" >nul 2>&1
echo [OK]       El backup es completamente valido e integro.
echo.

REM 5. CREAR SUBDIRECTORIO RESTORE LIMPIANDO CONTENIDO PREVIO
set "RESTORE_DIR=!BACKUP_DIR!\restore"
echo [RESTORE]  Subdirectorio destino para el log: "!RESTORE_DIR!"

if exist "!RESTORE_DIR!" (
    echo [LIMPIEZA] El directorio restore ya existe. Borrando su contenido previo...
    rd /s /q "!RESTORE_DIR!" >nul 2>&1
)
mkdir "!RESTORE_DIR!"

if not exist "!RESTORE_DIR!" (
    echo [ERROR CRITICO] No se pudo crear el directorio "!RESTORE_DIR!".
    exit /b 5
)
echo [OK]       Directorio restore preparado y limpio.
echo.

REM 6. PARAMETROS DE CONEXION AL DGX-SPARK
set "PGUSER=postgres"
set "PGPASSWORD=W39xlpS9"
set "PGPORT=5433"
set "PGHOST=192.168.1.17"
set "PGHOST_FALLBACK=72.60.89.227"

set "LOG_FILE=!RESTORE_DIR!\restore_salvadora_%TIMESTAMP%.log"

echo ====================================================================== > "%LOG_FILE%"
echo   INFORME DE RESTAURACION - POSTGRESQL DGX-SPARK >> "%LOG_FILE%"
echo   Fecha: %DATE% - %TIME% >> "%LOG_FILE%"
echo   Directorio origen: !BACKUP_DIR! >> "%LOG_FILE%"
echo   Archivo restaurado: %DUMP_FILE% >> "%LOG_FILE%"
echo   Servidor destino: %PGHOST%:%PGPORT% >> "%LOG_FILE%"
echo   Directorio restore: !RESTORE_DIR! >> "%LOG_FILE%"
echo ====================================================================== >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

REM Confirmacion en modo interactivo
if "%FORCE_YES%"=="0" (
    echo ----------------------------------------------------------------------
    echo   ATENCION: Se va a restaurar completamente la base de datos crm_salvadora
    echo   en el servidor DGX-Spark: %PGHOST% puerto %PGPORT%.
    echo   Todos los datos actuales seran reemplazados por los del backup.
    echo ----------------------------------------------------------------------
    set /p "CONFIRM=Desea proceder con la restauracion? S/N: "
    if /i not "!CONFIRM!"=="S" (
        echo [CANCELADO] Restauracion cancelada por el usuario.
        echo Restauracion cancelada por el usuario. >> "%LOG_FILE%"
        exit /b 0
    )
)

echo.
echo [1/2] Restaurando base de datos crm_salvadora en DGX-Spark...
echo Iniciando pg_restore de crm_salvadora... >> "%LOG_FILE%"

"%PG_RESTORE%" -h %PGHOST% -p %PGPORT% -U %PGUSER% -d crm_salvadora --clean --if-exists --no-owner --no-privileges -v "%DUMP_FILE%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo [AVISO] Fallo conexion a %PGHOST%, reintentando en IP publica %PGHOST_FALLBACK%...
    echo Fallo conexion a %PGHOST%, reintentando en %PGHOST_FALLBACK%... >> "%LOG_FILE%"
    "%PG_RESTORE%" -h %PGHOST_FALLBACK% -p %PGPORT% -U %PGUSER% -d crm_salvadora --clean --if-exists --no-owner --no-privileges -v "%DUMP_FILE%" >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        echo [ERROR] La restauracion devolvio advertencias o errores. Revise el log para mas detalles.
        echo [ERROR] Fallo pg_restore en crm_salvadora >> "%LOG_FILE%"
    ) else (
        echo [OK] Restauracion de crm_salvadora completada via %PGHOST_FALLBACK%.
        set "PGHOST=%PGHOST_FALLBACK%"
    )
) else (
    echo [OK] Restauracion de crm_salvadora completada via %PGHOST%.
)

REM 7. RESTAURAR ESQUEMA CCMFALLA SI EXISTE EN EL DIRECTORIO
set "CCMFALLA_DUMP="
if exist "!BACKUP_DIR!\landing_ccmfalla_latest.dump" (
    set "CCMFALLA_DUMP=!BACKUP_DIR!\landing_ccmfalla_latest.dump"
) else (
    for /f "delims=" %%F in ('dir /b /o-d "!BACKUP_DIR!\landing_ccmfalla*.dump" 2^>nul') do (
        if not defined CCMFALLA_DUMP set "CCMFALLA_DUMP=!BACKUP_DIR!\%%F"
    )
)

if defined CCMFALLA_DUMP (
    echo [2/2] Restaurando esquema ccmfalla - Landing y Reservas en dbclinica...
    echo Restaurando esquema ccmfalla desde !CCMFALLA_DUMP!... >> "%LOG_FILE%"
    "%PG_RESTORE%" -h %PGHOST% -p %PGPORT% -U %PGUSER% -d dbclinica --clean --if-exists --no-owner --no-privileges -v "!CCMFALLA_DUMP!" >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        echo [AVISO] Esquema ccmfalla restaurado con advertencias. Ver log para detalles.
    ) else (
        echo [OK] Esquema ccmfalla restaurado correctamente.
    )
) else (
    echo [INFO] No se encontro backup de ccmfalla en el directorio. Omitiendo.
)

REM 8. GUARDAR COPIA LATEST DEL LOG DENTRO DE RESTORE
copy /y "%LOG_FILE%" "!RESTORE_DIR!\restore_latest.log" >nul 2>&1

echo ====================================================================== >> "%LOG_FILE%"
echo   FIN DE LA RESTAURACION >> "%LOG_FILE%"
echo   Hora fin: %DATE% - %TIME% >> "%LOG_FILE%"
echo ====================================================================== >> "%LOG_FILE%"

echo.
echo ======================================================================
echo   RESTAURACION COMPLETADA EXITOSAMENTE
echo ======================================================================
echo   Directorio backup:     !BACKUP_DIR!
echo   Directorio restore:    !RESTORE_DIR!
echo   Archivo restaurado:    %DUMP_FILE%
echo   Archivo de log:        %LOG_FILE%
echo ======================================================================
echo.

if "%FORCE_YES%"=="1" goto :end

echo Puede pulsar cualquier tecla para cerrar esta ventana...
pause >nul

:end
