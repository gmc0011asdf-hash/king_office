param(
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

Write-Host "Bootstrapping PostgreSQL database + schema + admin user..."
& $Python (Join-Path $PSScriptRoot "bootstrap_db.py")
if ($LASTEXITCODE -ne 0) {
  throw "Bootstrap failed (exit code: $LASTEXITCODE)"
}
Write-Host "Done."

