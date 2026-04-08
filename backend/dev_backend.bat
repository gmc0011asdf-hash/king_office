@echo off
cd /d "%~dp0"
if not exist "venv\Scripts\activate.bat" (
    echo ERROR: venv not found. Run setup_new_machine.bat from project root.
    pause
    exit /b 1
)
call "venv\Scripts\activate.bat"
if not exist "logs" mkdir "logs"
echo Backend: http://localhost:8000 ^(reload ON^)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
echo.
pause
