@echo off
:: Run as Administrator to allow incoming connections on port 8000 for King Office API
:: Right-click -> Run as administrator

netsh advfirewall firewall add rule name="King Office API" dir=in action=allow protocol=TCP localport=8000
if %errorlevel% equ 0 (
    echo Port 8000 opened successfully.
) else (
    echo Failed. Make sure you run this as Administrator.
)
pause
