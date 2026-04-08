@echo off
cd /d "%~dp0"
if not exist "package.json" (
    echo ERROR: Run this from King Office project root.
    pause
    exit /b 1
)
echo Frontend: http://localhost:5173
call npm run dev
echo.
pause
