# Run database cleanup from project root
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendScript = Join-Path $scriptDir "..\backend\scripts\clean_db.py"
$backendDir = Join-Path $scriptDir "..\backend"

Push-Location $backendDir
try {
    python $backendScript
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
