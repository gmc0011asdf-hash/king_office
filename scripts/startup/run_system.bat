@echo off
chcp 65001 >nul 2>nul
setlocal
title KingOffice-LocalServer
REM تشغيل النظام: PostgreSQL + بناء dist + خادم FastAPI على 8000
REM ترحيل FTTH: عند الترحيل للمشتركين يُربط السجل بمشترك موجود بنفس الهاتف/المعرّف دون تكرار

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

echo.
echo ========================================
echo   King Office - local production mode
echo   FastAPI serves Vite dist on port 8000
echo ========================================
echo.

REM --- PostgreSQL (when pg_isready is on PATH) ---
where pg_isready >nul 2>&1
if errorlevel 1 goto pg_ready_skip

pg_isready -h 127.0.0.1 -p 5432 >nul 2>&1
if errorlevel 1 goto pg_ready_fail
goto pg_ready_done

:pg_ready_fail
echo [ERROR] PostgreSQL is not accepting connections on 127.0.0.1 port 5432.
echo.
echo Start the Windows service postgresql-x64-14 .. 17 ^(services.msc^) or as Admin:
echo   net start postgresql-x64-15
echo Match DATABASE_URL in backend\.env if you use a non-default port.
echo.
echo Service STATE lines ^(empty means service name not found^):
sc query postgresql-x64-17 2>nul | findstr /i "STATE"
sc query postgresql-x64-16 2>nul | findstr /i "STATE"
sc query postgresql-x64-15 2>nul | findstr /i "STATE"
sc query postgresql-x64-14 2>nul | findstr /i "STATE"
echo.
pause
exit /b 1

:pg_ready_skip
echo [WARN] pg_isready not in PATH - skipping DB check. Ensure PostgreSQL is running.

:pg_ready_done

if not exist "%ROOT%\node_modules" (
  echo [ERROR] node_modules not found. Run setup_new_machine.bat first.
  pause
  exit /b 1
)

if not exist "%ROOT%\backend\venv\Scripts\activate.bat" (
  echo [ERROR] Python venv not found. Run setup_new_machine.bat first.
  pause
  exit /b 1
)

if not exist "%ROOT%\dist\index.html" (
  echo [INFO] dist not found - running npm run build...
  call npm run build
  if errorlevel 1 (
    echo [ERROR] Frontend build failed.
    pause
    exit /b 1
  )
)

REM Ensure log directory exists before the API process starts
if not exist "%ROOT%\backend\logs" mkdir "%ROOT%\backend\logs"

echo.
echo Starting API on http://0.0.0.0:8000 - open http://localhost:8000 in browser
echo Close the server window to stop.
echo.

REM /D sets working directory to backend so run_production_server.bat needs no "cd /d"
start "KoAPI" /D "%ROOT%\backend" cmd /k "%ROOT%\backend\run_production_server.bat"

timeout /t 4 /nobreak >nul
start "" "http://localhost:8000"

echo Browser launched. Server runs in the other window.
echo.
pause
