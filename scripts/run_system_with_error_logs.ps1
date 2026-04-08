
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

$ErrorActionPreference = "Continue"

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

$root = (Resolve-Path $ProjectRoot).Path
$errorsDir = Join-Path $root "_system_errors"
$runLogs = Join-Path $errorsDir "run_logs"
Ensure-Dir $errorsDir
Ensure-Dir $runLogs

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backendLog = Join-Path $runLogs ("backend_" + $timestamp + ".txt")
$frontendLog = Join-Path $runLogs ("frontend_" + $timestamp + ".txt")
$summaryLog = Join-Path $runLogs ("summary_" + $timestamp + ".txt")

$frontendRoot = if (Test-Path (Join-Path $root "frontend")) { Join-Path $root "frontend" } else { $root }
$backendRoot = if (Test-Path (Join-Path $root "backend")) { Join-Path $root "backend" } else { $root }

$backendCmd = "python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
$frontendCmd = "npm run dev"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendRoot'; $backendCmd *>> '$backendLog'" | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendRoot'; $frontendCmd *>> '$frontendLog'" | Out-Null

@"
SYSTEM STARTED

Backend log:
$backendLog

Frontend log:
$frontendLog

If the UI shows an error:
- open both log files
- copy the last 30 lines
- send them here

Expected:
- Backend: http://127.0.0.1:8000
- Frontend: see Vite output in frontend log
"@ | Set-Content -Path $summaryLog -Encoding UTF8

Write-Host "Started backend and frontend."
Write-Host "Backend log: $backendLog"
Write-Host "Frontend log: $frontendLog"
Write-Host "Summary log:  $summaryLog"
