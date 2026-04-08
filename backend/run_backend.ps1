Write-Host "====================================="
Write-Host " KING OFFICE BACKEND STARTUP CHECK"
Write-Host "====================================="
Write-Host ""

python .\check_system.py

Write-Host ""
Write-Host "====================================="
Write-Host " STARTING UVICORN"
Write-Host "====================================="
Write-Host ""

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload