@echo off
REM This file must run with "current folder" = backend (run_system.bat uses START /D).
REM Do not use "cd /d" here - avoids cmd parsing errors on some PCs/locales.

if not exist "venv\Scripts\activate.bat" (
  echo [ERROR] venv not found. Current folder should be backend.
  echo Run setup_new_machine.bat from the project root first.
  pause
  exit /b 1
)

call "venv\Scripts\activate.bat"
if not exist "logs" mkdir "logs"

set "ENVIRONMENT=development"
set "UVICORN_RELOAD=false"

echo Starting uvicorn on 0.0.0.0:8000 ...
echo ENVIRONMENT=development, no hot-reload. API docs: /docs
echo.
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
echo.
echo Server exited.
pause
