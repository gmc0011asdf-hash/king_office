@echo off
chcp 65001 >nul 2>nul
title KingOffice-TashghilYawmi
REM تشغيل يومي: نفس وضع الانتاج المحلي (API + واجهة مبنية على المنفذ 8000)
echo.
echo [تشغيل يومي] جاري تشغيل King Office...
echo.

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
call "%SCRIPT_DIR%\run_system.bat"
