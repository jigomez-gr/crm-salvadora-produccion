@echo off
setlocal

echo ======================================================================
echo   BACKUP AUTOMATIZADO POSTGRESQL - DGX-SPARK (SALVADORA)
echo ======================================================================
echo.

REM 1. OBTENER DIA DE LA SEMANA EN ESPANOL Y TIMESTAMP
set "PS_BIN=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_BIN%" set "PS_BIN=powershell.exe"

"%PS_BIN%" -NoProfile -Command "switch ((Get-Date).DayOfWeek) { 'Monday' {'lunes'} 'Tuesday' {'martes'} 'Wednesday' {'miercoles'} 'Thursday' {'jueves'} 'Friday' {'viernes'} 'Saturday' {'sabado'} 'Sunday' {'domingo'} }" > "%TEMP%\dia_salvadora.txt"
set /p DIA=<"%TEMP%\dia_salvadora.txt"
del "%TEMP%\dia_salvadora.txt" >nul 2>&1

"%PS_BIN%" -NoProfile -Command "(Get-Date).ToString('yyyyMMdd_HHmmss')" > "%TEMP%\ts_salvadora.txt"
set /p TIMESTAMP=<"%TEMP%\ts_salvadora.txt"
del "%TEMP%\ts_salvadora.txt" >nul 2>&1

if "%DIA%"=="" set "DIA=sabado"
if "%TIMESTAMP%"=="" set "TIMESTAMP=actual"

echo [FECHA]     Dia: %DIA%
echo [TIMESTAMP] %TIMESTAMP%
echo.

REM 2. VERIFICAR UNIDAD O: Y PREPARAR DIRECTORIOS DE DESTINO
if not exist "O:\" (
    echo [ERROR CRITICO] La unidad O:\ no esta accesible o no esta montada.
    echo Por favor, verifique la conexion del disco O: antes de continuar.
    exit /b 1
)

set "DEST_DIR=O:\backupbds\salvadora\%DIA%"
if not exist "O:\backupbds" mkdir "O:\backupbds"
if not exist "O:\backupbds\salvadora" mkdir "O:\backupbds\salvadora"
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

REM Asegurar tambien O:\backupbds\%DIA%
if not exist "O:\backupbds\%DIA%" mkdir "O:\backupbds\%DIA%"

echo [DESTINO]   %DEST_DIR%
echo.

REM 3. LOCALIZAR BINARIO PG_DUMP
set "PG_DUMP="
if exist "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" (
    set "PG_DUMP=C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
)
if "%PG_DUMP%"=="" if exist "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" (
    set "PG_DUMP=C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
)
if "%PG_DUMP%"=="" if exist "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe" (
    set "PG_DUMP=C:\Program Files\PostgreSQL\15\bin\pg_dump.exe"
)

if "%PG_DUMP%"=="" (
    where pg_dump.exe >nul 2>&1
    if not errorlevel 1 set "PG_DUMP=pg_dump.exe"
)

if "%PG_DUMP%"=="" (
    echo [ERROR CRITICO] No se encontro el binario pg_dump.exe de PostgreSQL.
    exit /b 2
)

echo [PG_DUMP]   "%PG_DUMP%"
echo.

REM 4. CONFIGURAR PARAMETROS DE CONEXION AL DGX-SPARK
set "PGUSER=postgres"
set "PGPASSWORD=W39xlpS9"
set "PGPORT=5433"
set "PGHOST=192.168.1.17"
set "PGHOST_FALLBACK=72.60.89.227"

set "LOG_FILE=%DEST_DIR%\backup_salvadora_%TIMESTAMP%.log"
set "DUMP_FILE=%DEST_DIR%\crm_salvadora_%DIA%_%TIMESTAMP%.dump"
set "SQL_FILE=%DEST_DIR%\crm_salvadora_%DIA%_%TIMESTAMP%.sql"
set "CCMFALLA_FILE=%DEST_DIR%\landing_ccmfalla_%DIA%_%TIMESTAMP%.dump"

echo ====================================================================== > "%LOG_FILE%"
echo   INFORME DE COPIA DE SEGURIDAD - POSTGRESQL DGX-SPARK >> "%LOG_FILE%"
echo   Fecha: %DATE% - %TIME% >> "%LOG_FILE%"
echo   Dia de la semana: %DIA% >> "%LOG_FILE%"
echo   Servidor principal: %PGHOST%:%PGPORT% >> "%LOG_FILE%"
echo   Servidor secundario: %PGHOST_FALLBACK%:%PGPORT% >> "%LOG_FILE%"
echo   Directorio destino: %DEST_DIR% >> "%LOG_FILE%"
echo ====================================================================== >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo [1/3] Realizando backup completo en formato custom binary - CRM Salvadora...
echo Realizando backup custom binary - crm_salvadora... >> "%LOG_FILE%"
"%PG_DUMP%" -h %PGHOST% -p %PGPORT% -U %PGUSER% -d crm_salvadora -F c -b -v -f "%DUMP_FILE%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo [AVISO] Fallo conexion a %PGHOST%, intentando IP publica %PGHOST_FALLBACK%...
    echo Fallo conexion a %PGHOST%, reintentando en %PGHOST_FALLBACK%... >> "%LOG_FILE%"
    "%PG_DUMP%" -h %PGHOST_FALLBACK% -p %PGPORT% -U %PGUSER% -d crm_salvadora -F c -b -v -f "%DUMP_FILE%" >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        echo [ERROR] No se pudo realizar el backup custom binary.
        echo [ERROR] Fallo dump binario de crm_salvadora >> "%LOG_FILE%"
    ) else (
        echo [OK] Backup custom binary completado via %PGHOST_FALLBACK%.
        set "PGHOST=%PGHOST_FALLBACK%"
    )
) else (
    echo [OK] Backup custom binary completado via %PGHOST%.
)

echo [2/3] Exportando script SQL completo con DDL y datos...
echo Exportando script SQL completo - crm_salvadora... >> "%LOG_FILE%"
"%PG_DUMP%" -h %PGHOST% -p %PGPORT% -U %PGUSER% -d crm_salvadora -F p -b -f "%SQL_FILE%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo [ERROR] Fallo la exportacion en texto SQL.
    echo [ERROR] Fallo dump SQL de crm_salvadora >> "%LOG_FILE%"
) else (
    echo [OK] Script SQL exportado correctamente.
)

echo [3/3] Realizando backup del esquema ccmfalla - Landing y Reservas...
echo Realizando backup del esquema ccmfalla en dbclinica... >> "%LOG_FILE%"
"%PG_DUMP%" -h %PGHOST% -p %PGPORT% -U %PGUSER% -d dbclinica -n ccmfalla -F c -b -f "%CCMFALLA_FILE%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo [AVISO] No se pudo exportar ccmfalla. Ver log para detalles.
) else (
    echo [OK] Esquema ccmfalla exportado correctamente.
)

REM 5. ACTUALIZAR COPIAS LATEST EN EL DIA
copy /y "%DUMP_FILE%" "%DEST_DIR%\crm_salvadora_latest.dump" >nul 2>&1
copy /y "%SQL_FILE%" "%DEST_DIR%\crm_salvadora_latest.sql" >nul 2>&1
copy /y "%LOG_FILE%" "%DEST_DIR%\backup_latest.log" >nul 2>&1

echo ====================================================================== >> "%LOG_FILE%"
echo   ESTADISTICAS FINALES >> "%LOG_FILE%"
echo   Hora fin: %DATE% - %TIME% >> "%LOG_FILE%"
echo ====================================================================== >> "%LOG_FILE%"

echo.
echo ======================================================================
echo   RESUMEN DEL BACKUP - COMPLETADO EXITOSAMENTE
echo ======================================================================
echo   Dia de la semana:      %DIA%
echo   Carpeta destino:       %DEST_DIR%
echo   Archivo binario:       crm_salvadora_%DIA%_%TIMESTAMP%.dump
echo   Archivo SQL:           crm_salvadora_%DIA%_%TIMESTAMP%.sql
echo   Archivo Landing:       landing_ccmfalla_%DIA%_%TIMESTAMP%.dump
echo   Archivo Log:           backup_salvadora_%TIMESTAMP%.log
echo ======================================================================
echo.

if "%~1"=="/silent" goto :end
if "%~1"=="-s" goto :end

echo Puede pulsar cualquier tecla para cerrar esta ventana...
pause >nul

:end
