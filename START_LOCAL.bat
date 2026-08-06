@echo off
setlocal
cd /d "%~dp0"
title King Office - Local

where python >nul 2>nul || (
  echo Python is not installed or not available in PATH.
  pause
  exit /b 1
)

where npm >nul 2>nul || (
  echo Node.js and npm are not installed or not available in PATH.
  pause
  exit /b 1
)

if not exist "backend\venv\Scripts\python.exe" (
  echo Creating Python virtual environment...
  python -m venv backend\venv || goto :error
)

echo Installing backend dependencies...
"backend\venv\Scripts\python.exe" -m pip install -r backend\requirements.txt || goto :error

if not exist "node_modules" (
  echo Installing frontend dependencies...
  call npm install || goto :error
)

echo Starting King Office locally...
start "King Office Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
start "King Office Frontend" cmd /k "cd /d %~dp0 && npm run dev -- --host 127.0.0.1"

timeout /t 4 /nobreak >nul
start http://127.0.0.1:5173
exit /b 0

:error
echo.
echo Setup or startup failed. Review the message above.
pause
exit /b 1
