param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,

    [switch]$DeleteObviousRootJunk
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
        $name = Split-Path $Path -Leaf
        $dest = Join-Path $script:BackupDir ($name + ".bak_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
        Copy-Item $Path $dest -Force
        Log-Line "Backup created: $dest"
    }
}

function Replace-InFile {
    param(
        [string]$Path,
        [hashtable]$Map
    )

    if (-not (Test-Path $Path)) {
        Log-Line "Missing file, skipped: $Path" "WARN"
        return
    }

    $content = Get-Content $Path -Raw -Encoding UTF8
    $original = $content

    foreach ($key in $Map.Keys) {
        $content = $content.Replace($key, $Map[$key])
    }

    if ($content -ne $original) {
        Backup-File $Path
        Set-Content -Path $Path -Value $content -Encoding UTF8
        Log-Line "Patched imports: $Path"
    } else {
        Log-Line "No changes needed: $Path"
    }
}

function Move-IfExists {
    param(
        [string]$Source,
        [string]$Destination
    )
    if (Test-Path $Source) {
        Ensure-Dir (Split-Path $Destination -Parent)
        Move-Item -Path $Source -Destination $Destination -Force
        Log-Line "Moved: $Source -> $Destination"
    }
}

function Remove-IfExists {
    param([string]$Path)
    if (Test-Path $Path) {
        Remove-Item -Path $Path -Force -Recurse
        Log-Line "Deleted: $Path" "WARN"
    }
}

$root = (Resolve-Path $ProjectRoot).Path
$errorsDir = Join-Path $root "_system_errors"
$fixDir = Join-Path $errorsDir "fix_logs"
$script:BackupDir = Join-Path $errorsDir "file_backups"
Ensure-Dir $errorsDir
Ensure-Dir $fixDir
Ensure-Dir $script:BackupDir
$script:LogFile = Join-Path $fixDir ("repair_imports_and_clean_root_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".txt")

Log-Line "Starting import repair and root cleanup."
Log-Line "Project root: $root"

$srcRoot = if (Test-Path (Join-Path $root "src")) { Join-Path $root "src" } elseif (Test-Path (Join-Path $root "frontend\src")) { Join-Path $root "frontend\src" } else { $null }

if (-not $srcRoot) {
    Log-Line "Could not find src root." "ERROR"
    exit 1
}

# 1) Repair moved page imports
$pageFiles = Get-ChildItem -Path (Join-Path $srcRoot "modules") -Recurse -File -Include *.tsx,*.ts -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\modules\\.+\\page\\" }

$pageMap = @{
    '../context/'   = '../../../context/'
    "../context/"   = "../../../context/"
    '../api/'       = '../../../api/'
    "../api/"       = "../../../api/"
    '../components/'= '../../../components/'
    "../components/"= "../../../components/"
    '../utils/'     = '../../../utils/'
    "../utils/"     = "../../../utils/"
    '../hooks/'     = '../../../hooks/'
    "../hooks/"     = "../../../hooks/"
}

foreach ($file in $pageFiles) {
    Replace-InFile -Path $file.FullName -Map $pageMap
}

# 2) Repair moved module api imports that used old local client path
$apiFiles = Get-ChildItem -Path (Join-Path $srcRoot "modules") -Recurse -File -Include *.ts,*.tsx -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\modules\\.+\\api\\" }

$apiMap = @{
    "from './client'"   = "from '../../../api/client'"
    'from "./client"'   = 'from "../../../api/client"'
    "from '../client'"  = "from '../../../api/client'"
    'from "../client"'  = 'from "../../../api/client"'
}

foreach ($file in $apiFiles) {
    Replace-InFile -Path $file.FullName -Map $apiMap
}

# 3) Repair shared Layout after moving to shared/components
$layoutPath = Join-Path $srcRoot "shared\components\Layout.tsx"
$layoutMap = @{
    '../utils/'      = '../../utils/'
    "../utils/"      = "../../utils/"
    '../context/'    = '../../context/'
    "../context/"    = "../../context/"
    '../api/'        = '../../api/'
    "../api/"        = "../../api/"
}
Replace-InFile -Path $layoutPath -Map $layoutMap

# 4) Move known root scripts into scripts/
Ensure-Dir (Join-Path $root "scripts")
$scriptCandidates = @(
    "restructure_king_office_safe_move.ps1",
    "run_system_with_error_logs.ps1",
    "fix_env_and_frontend_dev.ps1",
    "fix_env_and_frontend_dev_FIXED.ps1"
)
foreach ($name in $scriptCandidates) {
    Move-IfExists -Source (Join-Path $root $name) -Destination (Join-Path $root ("scripts\" + $name))
}

# 5) Clean obvious root junk safely
$reviewDir = Join-Path $root "_cleanup_review\root_review"
Ensure-Dir $reviewDir

$moveToReview = @(
    "restructure_20260315_221148.txt",
    "backend_20260315_221221.txt",
    "frontend_20260315_221221.txt",
    "summary_20260315_221221.txt",
    "NEXT_STEPS.txt",
    "backend_20260315_223044.txt",
    "frontend_20260315_223044.txt",
    "summary_20260315_223044.txt",
    "fix_env_and_dev_20260315_222837.txt"
)

foreach ($name in $moveToReview) {
    Move-IfExists -Source (Join-Path $root $name) -Destination (Join-Path $reviewDir $name)
}

# General root cleanup patterns
$rootFiles = Get-ChildItem -Path $root -File -ErrorAction SilentlyContinue

foreach ($file in $rootFiles) {
    $n = $file.Name

    if ($n -match '^backend_runtime\.log$|^frontend_runtime\.log$|^system_report\.txt$|^AppContext\.txt$|^intrnet\.txt$') {
        Move-IfExists -Source $file.FullName -Destination (Join-Path $reviewDir $n)
        continue
    }

    if ($n -match '\.bak_\d{8}_\d{6}$') {
        Move-IfExists -Source $file.FullName -Destination (Join-Path $reviewDir $n)
        continue
    }

    if ($DeleteObviousRootJunk) {
        if ($n -match '^backend_\d{8}_\d{6}\.txt$|^frontend_\d{8}_\d{6}\.txt$|^summary_\d{8}_\d{6}\.txt$') {
            Remove-IfExists -Path $file.FullName
            continue
        }
    }
}

# 6) Write final summary
$summaryPath = Join-Path $errorsDir "REPAIR_IMPORTS_AND_CLEAN_ROOT_SUMMARY.txt"
$summary = @"
DONE

What this script repaired:
- moved page imports under src/modules/*/page
- moved module api imports under src/modules/*/api
- shared Layout imports after moving to src/shared/components

What this script cleaned:
- moved root helper scripts into scripts/
- moved known root logs/text artifacts into _cleanup_review/root_review
- optionally deletes obvious generated txt logs if -DeleteObviousRootJunk is used

Important:
- No models.py or schemas.py were split
- No server.ts or core runtime files were deleted
- Backups of changed source files are in _system_errors/file_backups
- Detailed log is in _system_errors/fix_logs
"@
Set-Content -Path $summaryPath -Value $summary -Encoding UTF8
Log-Line "Wrote summary: $summaryPath"

Log-Line "Finished import repair and root cleanup."
