
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

function Log-Line {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Message"
    Add-Content -Path $script:LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

function Backup-File {
    param([string]$Path)
    if (Test-Path $Path) {
        $backup = "$Path.bak_" + (Get-Date -Format "yyyyMMdd_HHmmss")
        Copy-Item $Path $backup -Force
        Log-Line "Backup created: $backup"
        return $backup
    }
    return $null
}

$root = (Resolve-Path $ProjectRoot).Path
$errorsDir = Join-Path $root "_system_errors"
$fixDir = Join-Path $errorsDir "fix_logs"
Ensure-Dir $errorsDir
Ensure-Dir $fixDir
$script:LogFile = Join-Path $fixDir ("fix_env_and_dev_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".txt")

Log-Line "Starting fix at project root: $root"

# Paths
$backendRoot = if (Test-Path (Join-Path $root "backend")) { Join-Path $root "backend" } else { $root }
$packageJson = Join-Path $root "package.json"
$requirements = if (Test-Path (Join-Path $backendRoot "requirements.txt")) { Join-Path $backendRoot "requirements.txt" } elseif (Test-Path (Join-Path $root "requirements.txt")) { Join-Path $root "requirements.txt" } else { $null }
$venvPath = Join-Path $backendRoot "venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$venvPip = Join-Path $venvPath "Scripts\pip.exe"

# 1) Backend virtual environment
if (-not (Test-Path $venvPython)) {
    Log-Line "Creating backend virtual environment..."
    Push-Location $backendRoot
    python -m venv venv
    Pop-Location
} else {
    Log-Line "Backend virtual environment already exists."
}

if (-not (Test-Path $venvPython)) {
    Log-Line "Failed to create backend virtual environment." "ERROR"
    exit 1
}

# 2) Upgrade pip and install backend requirements
Log-Line "Upgrading pip in backend venv..."
& $venvPython -m pip install --upgrade pip setuptools wheel 2>&1 | Tee-Object -FilePath $script:LogFile -Append | Out-Null

if ($requirements) {
    Log-Line "Installing backend requirements from: $requirements"
    & $venvPip install -r $requirements 2>&1 | Tee-Object -FilePath $script:LogFile -Append | Out-Null
} else {
    Log-Line "requirements.txt not found. Skipping requirements install." "WARN"
}

# Ensure uvicorn/FastAPI essentials
Log-Line "Ensuring uvicorn, fastapi and sqlalchemy are installed in backend venv..."
& $venvPip install uvicorn fastapi sqlalchemy pydantic python-multipart passlib[bcrypt] python-jose[email] 2>&1 | Tee-Object -FilePath $script:LogFile -Append | Out-Null

# 3) Frontend package.json fix
if (Test-Path $packageJson) {
    Log-Line "Found package.json at: $packageJson"
    Backup-File $packageJson | Out-Null
    try {
        $pkgText = Get-Content $packageJson -Raw -Encoding UTF8
        $pkg = $pkgText | ConvertFrom-Json

        if (-not $pkg.scripts) {
            $pkg | Add-Member -NotePropertyName scripts -NotePropertyValue (@{})
        }

        $currentDev = $pkg.scripts.dev
        if ($currentDev -eq "tsx server.ts") {
            Log-Line "Current dev script points to legacy server.ts. Converting dev -> vite and preserving legacy script."
            $pkg.scripts | Add-Member -NotePropertyName "dev_legacy" -NotePropertyValue "tsx server.ts" -Force
            $pkg.scripts.dev = "vite"
        } elseif (-not $currentDev) {
            Log-Line "No dev script found. Creating dev -> vite."
            $pkg.scripts | Add-Member -NotePropertyName "dev" -NotePropertyValue "vite" -Force
        } else {
            Log-Line "Existing dev script is: $currentDev"
        }

        # Ensure build/preview exist when possible
        if (-not $pkg.scripts.build) {
            $pkg.scripts | Add-Member -NotePropertyName "build" -NotePropertyValue "vite build" -Force
            Log-Line "Added build script."
        }
        if (-not $pkg.scripts.preview) {
            $pkg.scripts | Add-Member -NotePropertyName "preview" -NotePropertyValue "vite preview" -Force
            Log-Line "Added preview script."
        }

        # Save JSON with reasonable formatting
        $jsonOut = $pkg | ConvertTo-Json -Depth 100
        Set-Content -Path $packageJson -Value $jsonOut -Encoding UTF8
        Log-Line "Updated package.json successfully."
    }
    catch {
        Log-Line "Failed to patch package.json automatically: $($_.Exception.Message)" "ERROR"
    }

    # 4) Install frontend packages
    Log-Line "Running npm install in project root..."
    Push-Location $root
    npm install 2>&1 | Tee-Object -FilePath $script:LogFile -Append | Out-Null

    # Ensure vite exists if project is frontend-vite based
    Log-Line "Ensuring Vite frontend dependencies exist..."
    npm install -D vite @vitejs/plugin-react 2>&1 | Tee-Object -FilePath $script:LogFile -Append | Out-Null
    Pop-Location
} else {
    Log-Line "package.json not found at root. Skipping frontend fix." "WARN"
}

# 5) Create launcher that uses backend venv explicitly
$launcher = @"
param(
    [Parameter(Mandatory = \$true)]
    [string]\$ProjectRoot
)

function Ensure-Dir {
    param([string]\$Path)
    if (-not (Test-Path \$Path)) {
        New-Item -ItemType Directory -Path \$Path -Force | Out-Null
    }
}

\$root = (Resolve-Path \$ProjectRoot).Path
\$errorsDir = Join-Path \$root "_system_errors"
\$runLogs = Join-Path \$errorsDir "run_logs"
Ensure-Dir \$errorsDir
Ensure-Dir \$runLogs

\$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
\$backendLog = Join-Path \$runLogs ("backend_" + \$timestamp + ".txt")
\$frontendLog = Join-Path \$runLogs ("frontend_" + \$timestamp + ".txt")
\$summaryLog = Join-Path \$runLogs ("summary_" + \$timestamp + ".txt")

\$backendRoot = if (Test-Path (Join-Path \$root "backend")) { Join-Path \$root "backend" } else { \$root }
\$venvPython = Join-Path \$backendRoot "venv\Scripts\python.exe"

if (-not (Test-Path \$venvPython)) {
    Write-Host "Backend venv python not found: \$venvPython"
    exit 1
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '\$backendRoot'; & '\$venvPython' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 *>> '\$backendLog'" | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '\$root'; npm run dev *>> '\$frontendLog'" | Out-Null

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
"@

$launcherPath = Join-Path $root "scripts\run_system_fixed.ps1"
Ensure-Dir (Split-Path $launcherPath -Parent)
Set-Content -Path $launcherPath -Value $launcher -Encoding UTF8
Log-Line "Created launcher: $launcherPath"

# 6) Create quick manual notes
$notes = @"
FIX COMPLETED

What this script did:
1. Created backend venv if missing
2. Installed requirements
3. Installed uvicorn/fastapi essentials
4. Patched package.json dev script from 'tsx server.ts' to 'vite' when needed
5. Preserved legacy dev script as 'dev_legacy'
6. Ran npm install
7. Created scripts/run_system_fixed.ps1

Important:
- server.ts was NOT deleted
- package.json backup was created before modification
- logs are stored in _system_errors/fix_logs
"@

$notesPath = Join-Path $errorsDir "FIX_SUMMARY.txt"
Set-Content -Path $notesPath -Value $notes -Encoding UTF8
Log-Line "Wrote summary: $notesPath"

Log-Line "Fix script completed successfully."
Write-Host ""
Write-Host "DONE"
Write-Host "Run next:"
Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\run_system_fixed.ps1 -ProjectRoot `"$root`""
