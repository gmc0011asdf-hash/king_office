param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

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

$backendRoot = if (Test-Path (Join-Path $root "backend")) { Join-Path $root "backend" } else { $root }
$venvPython = Join-Path $backendRoot "venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "Backend venv python not found: $venvPython"
    exit 1
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendRoot'; & '$venvPython' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 *>> '$backendLog'" | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; npm run dev *>> '$frontendLog'" | Out-Null

@"
SYSTEM STARTED

Backend log:
$backendLog

Frontend log:
$frontendLog

Open these logs if an error appears.
"@ | Set-Content -Path $summaryLog -Encoding UTF8

Write-Host "Started backend and frontend."
Write-Host "Backend log: $backendLog"
Write-Host "Frontend log: $frontendLog"
Write-Host "Summary log:  $summaryLog"
