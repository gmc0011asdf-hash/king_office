param(
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

$backendRoot = Split-Path $PSScriptRoot
Push-Location $backendRoot
try {
  & $Python (Join-Path $PSScriptRoot "clean_db.py")
  if ($LASTEXITCODE -ne 0) {
    throw "Clean failed (exit code: $LASTEXITCODE)"
  }
} finally {
  Pop-Location
}
