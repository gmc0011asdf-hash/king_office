param(
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$User = "postgres",
  [string]$Password = "1234",
  [string]$DbName = "king_office_new"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating database (if missing): $DbName"
$env:PGPASSWORD = $Password

& psql -h $HostName -p $Port -U $User -d postgres -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname = '$DbName';" | Out-Null
& psql -h $HostName -p $Port -U $User -d postgres -v ON_ERROR_STOP=1 -c "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$DbName') THEN CREATE DATABASE $DbName; END IF; END $$;" | Out-Null

Write-Host "Applying schema: backend/db/king_office_new.sql"
& psql -h $HostName -p $Port -U $User -d $DbName -v ON_ERROR_STOP=1 -f (Join-Path $PSScriptRoot "..\\db\\king_office_new.sql")

Write-Host "Done."

