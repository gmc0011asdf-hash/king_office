@echo off
setlocal
title KingOffice-Dev

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

echo.
echo ========================================
echo   King Office - DEV ^(backend 8000 + Vite 5173^)
echo ========================================
echo.

if not exist "%ROOT%\node_modules" (
    echo ERROR: Run setup_new_machine.bat first.
    pause
    exit /b 1
)

if not exist "%ROOT%\backend\venv\Scripts\activate.bat" (
    echo ERROR: Run setup_new_machine.bat first.
    pause
    exit /b 1
)

if not exist "%ROOT%\backend\logs" mkdir "%ROOT%\backend\logs"

echo Open http://localhost:5173 after Vite starts.
echo Close each window with Ctrl+C or close the window.
echo.

start "KingOffice-Backend" "%ROOT%\backend\dev_backend.bat"
timeout /t 2 /nobreak >nul
start "KingOffice-Frontend" "%ROOT%\dev_frontend.bat"
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

echo Done.
pause
