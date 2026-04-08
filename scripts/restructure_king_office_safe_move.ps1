
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,

    [switch]$DeleteKnownGeneratedLogs
)

$ErrorActionPreference = "Continue"

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] [$Level] $Message"
    Add-Content -Path $script:LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
        Write-Log "Created directory: $Path"
    }
}

function Write-TextFile {
    param(
        [string]$Path,
        [string]$Content
    )
    $parent = Split-Path $Path -Parent
    if ($parent) { Ensure-Dir $parent }
    Set-Content -Path $Path -Value $Content -Encoding UTF8
    Write-Log "Wrote file: $Path"
}

function Move-WithBridgeTs {
    param(
        [string]$Source,
        [string]$Destination,
        [string]$BridgeContent
    )
    if (-not (Test-Path $Source)) {
        Write-Log "Skip missing TS/TSX source: $Source" "WARN"
        return
    }
    Ensure-Dir (Split-Path $Destination -Parent)
    Move-Item -Path $Source -Destination $Destination -Force
    Write-Log "Moved: $Source -> $Destination"
    Write-TextFile -Path $Source -Content $BridgeContent
}

function Move-WithBridgePy {
    param(
        [string]$Source,
        [string]$Destination,
        [string]$BridgeContent
    )
    if (-not (Test-Path $Source)) {
        Write-Log "Skip missing Python source: $Source" "WARN"
        return
    }
    Ensure-Dir (Split-Path $Destination -Parent)
    Move-Item -Path $Source -Destination $Destination -Force
    Write-Log "Moved: $Source -> $Destination"
    Write-TextFile -Path $Source -Content $BridgeContent
}

function Move-IfExists {
    param(
        [string]$Source,
        [string]$Destination
    )
    if (-not (Test-Path $Source)) {
        Write-Log "Skip missing source: $Source" "WARN"
        return
    }
    Ensure-Dir (Split-Path $Destination -Parent)
    Move-Item -Path $Source -Destination $Destination -Force
    Write-Log "Moved: $Source -> $Destination"
}

$root = (Resolve-Path $ProjectRoot).Path

$errorsDir = Join-Path $root "_system_errors"
$logsDir = Join-Path $errorsDir "logs"
Ensure-Dir $errorsDir
Ensure-Dir $logsDir

$script:LogFile = Join-Path $logsDir ("restructure_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".txt")
Write-Log "Starting project restructure at root: $root"

$frontendSrcCandidates = @(
    (Join-Path $root "frontend\src"),
    (Join-Path $root "src")
)
$frontendSrc = $frontendSrcCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $frontendSrc) {
    Write-Log "Frontend src directory not found." "ERROR"
    exit 1
}

$backendAppCandidates = @(
    (Join-Path $root "backend\app"),
    (Join-Path $root "app")
)
$backendApp = $backendAppCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $backendApp) {
    Write-Log "Backend app directory not found." "ERROR"
    exit 1
}

Write-Log "Detected frontend src: $frontendSrc"
Write-Log "Detected backend app: $backendApp"

Ensure-Dir (Join-Path $frontendSrc "modules")
Ensure-Dir (Join-Path $frontendSrc "shared")
Ensure-Dir (Join-Path $frontendSrc "shared\api")
Ensure-Dir (Join-Path $frontendSrc "shared\components")
Ensure-Dir (Join-Path $frontendSrc "shared\utils")
Ensure-Dir (Join-Path $frontendSrc "shared\permissions")

Ensure-Dir (Join-Path $backendApp "modules")
Ensure-Dir (Join-Path $backendApp "shared")
Ensure-Dir (Join-Path $backendApp "shared\docs")

$modules = @("dashboard","internet","office","cards","partners_suppliers","expenses","settings")
foreach ($m in $modules) {
    Ensure-Dir (Join-Path $frontendSrc ("modules\" + $m + "\page"))
    Ensure-Dir (Join-Path $frontendSrc ("modules\" + $m + "\components"))
    Ensure-Dir (Join-Path $frontendSrc ("modules\" + $m + "\api"))
    Ensure-Dir (Join-Path $frontendSrc ("modules\" + $m + "\docs"))

    Ensure-Dir (Join-Path $backendApp ("modules\" + $m + "\routers"))
    Ensure-Dir (Join-Path $backendApp ("modules\" + $m + "\schemas"))
    Ensure-Dir (Join-Path $backendApp ("modules\" + $m + "\models"))
    Ensure-Dir (Join-Path $backendApp ("modules\" + $m + "\docs"))
}

$pageRoot = Join-Path $frontendSrc "pages"

Move-WithBridgeTs -Source (Join-Path $pageRoot "Dashboard.tsx") -Destination (Join-Path $frontendSrc "modules\dashboard\page\DashboardPage.tsx") -BridgeContent "export { default } from '../modules/dashboard/page/DashboardPage';`r`n"
Move-WithBridgeTs -Source (Join-Path $pageRoot "Internet.tsx") -Destination (Join-Path $frontendSrc "modules\internet\page\InternetPage.tsx") -BridgeContent "export { default } from '../modules/internet/page/InternetPage';`r`n"
Move-WithBridgeTs -Source (Join-Path $pageRoot "Office.tsx") -Destination (Join-Path $frontendSrc "modules\office\page\OfficePage.tsx") -BridgeContent "export { default } from '../modules/office/page/OfficePage';`r`n"
Move-WithBridgeTs -Source (Join-Path $pageRoot "Cards.tsx") -Destination (Join-Path $frontendSrc "modules\cards\page\CardsPage.tsx") -BridgeContent "export { default } from '../modules/cards/page/CardsPage';`r`n"
Move-WithBridgeTs -Source (Join-Path $pageRoot "Partners.tsx") -Destination (Join-Path $frontendSrc "modules\partners_suppliers\page\PartnersSuppliersPage.tsx") -BridgeContent "export { default } from '../modules/partners_suppliers/page/PartnersSuppliersPage';`r`n"
Move-WithBridgeTs -Source (Join-Path $pageRoot "Expenses.tsx") -Destination (Join-Path $frontendSrc "modules\expenses\page\ExpensesPage.tsx") -BridgeContent "export { default } from '../modules/expenses/page/ExpensesPage';`r`n"
Move-WithBridgeTs -Source (Join-Path $pageRoot "Settings.tsx") -Destination (Join-Path $frontendSrc "modules\settings\page\SettingsPage.tsx") -BridgeContent "export { default } from '../modules/settings/page/SettingsPage';`r`n"

$apiRoot = Join-Path $frontendSrc "api"

Move-WithBridgeTs -Source (Join-Path $apiRoot "subscribers.ts") -Destination (Join-Path $frontendSrc "modules\internet\api\subscribers.api.ts") -BridgeContent "export * from '../modules/internet/api/subscribers.api';`r`n"
Move-WithBridgeTs -Source (Join-Path $apiRoot "internet.ts") -Destination (Join-Path $frontendSrc "modules\internet\api\meta.api.ts") -BridgeContent "export * from '../modules/internet/api/meta.api';`r`n"
Move-WithBridgeTs -Source (Join-Path $apiRoot "internetReports.ts") -Destination (Join-Path $frontendSrc "modules\internet\api\reports.api.ts") -BridgeContent "export * from '../modules/internet/api/reports.api';`r`n"
Move-WithBridgeTs -Source (Join-Path $apiRoot "materials.ts") -Destination (Join-Path $frontendSrc "modules\office\api\materials.api.ts") -BridgeContent "export * from '../modules/office/api/materials.api';`r`n"
Move-WithBridgeTs -Source (Join-Path $apiRoot "cards.ts") -Destination (Join-Path $frontendSrc "modules\cards\api\cards.api.ts") -BridgeContent "export * from '../modules/cards/api/cards.api';`r`n"
Move-WithBridgeTs -Source (Join-Path $apiRoot "partners.ts") -Destination (Join-Path $frontendSrc "modules\partners_suppliers\api\partners.api.ts") -BridgeContent "export * from '../modules/partners_suppliers/api/partners.api';`r`n"
Move-WithBridgeTs -Source (Join-Path $apiRoot "suppliers.ts") -Destination (Join-Path $frontendSrc "modules\partners_suppliers\api\suppliers.api.ts") -BridgeContent "export * from '../modules/partners_suppliers/api/suppliers.api';`r`n"
Move-WithBridgeTs -Source (Join-Path $apiRoot "expenses.ts") -Destination (Join-Path $frontendSrc "modules\expenses\api\expenses.api.ts") -BridgeContent "export * from '../modules/expenses/api/expenses.api';`r`n"
Move-WithBridgeTs -Source (Join-Path $apiRoot "settings.ts") -Destination (Join-Path $frontendSrc "modules\settings\api\settings.api.ts") -BridgeContent "export * from '../modules/settings/api/settings.api';`r`n"
Move-WithBridgeTs -Source (Join-Path $apiRoot "auth.ts") -Destination (Join-Path $frontendSrc "shared\api\auth.api.ts") -BridgeContent "export * from '../shared/api/auth.api';`r`n"
Move-WithBridgeTs -Source (Join-Path $apiRoot "users.ts") -Destination (Join-Path $frontendSrc "shared\api\users.api.ts") -BridgeContent "export * from '../shared/api/users.api';`r`n"
Move-WithBridgeTs -Source (Join-Path $apiRoot "client.ts") -Destination (Join-Path $frontendSrc "shared\api\client.ts") -BridgeContent "export * from '../shared/api/client';`r`n"

$componentsRoot = Join-Path $frontendSrc "components"
Move-WithBridgeTs -Source (Join-Path $componentsRoot "Layout.tsx") -Destination (Join-Path $frontendSrc "shared\components\Layout.tsx") -BridgeContent "export { default } from '../shared/components/Layout';`r`n"

$utilsRoot = Join-Path $frontendSrc "utils"
Move-WithBridgeTs -Source (Join-Path $utilsRoot "permissions.ts") -Destination (Join-Path $frontendSrc "shared\permissions\permissions.ts") -BridgeContent "export * from '../shared/permissions/permissions';`r`n"

$routerRoot = Join-Path $backendApp "routers"

Move-WithBridgePy -Source (Join-Path $routerRoot "subscribers.py") -Destination (Join-Path $backendApp "modules\internet\routers\subscribers_router.py") -BridgeContent "from app.modules.internet.routers.subscribers_router import router  # noqa: F401`r`n"
Move-WithBridgePy -Source (Join-Path $routerRoot "internet_meta.py") -Destination (Join-Path $backendApp "modules\internet\routers\meta_router.py") -BridgeContent "from app.modules.internet.routers.meta_router import router  # noqa: F401`r`n"
Move-WithBridgePy -Source (Join-Path $routerRoot "internet_reports.py") -Destination (Join-Path $backendApp "modules\internet\routers\reports_router.py") -BridgeContent "from app.modules.internet.routers.reports_router import router  # noqa: F401`r`n"
Move-WithBridgePy -Source (Join-Path $routerRoot "wallet.py") -Destination (Join-Path $backendApp "modules\internet\routers\wallet_router.py") -BridgeContent "from app.modules.internet.routers.wallet_router import router  # noqa: F401`r`n"
Move-WithBridgePy -Source (Join-Path $routerRoot "materials.py") -Destination (Join-Path $backendApp "modules\office\routers\materials_router.py") -BridgeContent "from app.modules.office.routers.materials_router import router  # noqa: F401`r`n"
Move-WithBridgePy -Source (Join-Path $routerRoot "cards.py") -Destination (Join-Path $backendApp "modules\cards\routers\cards_router.py") -BridgeContent "from app.modules.cards.routers.cards_router import router  # noqa: F401`r`n"
Move-WithBridgePy -Source (Join-Path $routerRoot "partners.py") -Destination (Join-Path $backendApp "modules\partners_suppliers\routers\partners_router.py") -BridgeContent "from app.modules.partners_suppliers.routers.partners_router import router  # noqa: F401`r`n"
Move-WithBridgePy -Source (Join-Path $routerRoot "suppliers.py") -Destination (Join-Path $backendApp "modules\partners_suppliers\routers\suppliers_router.py") -BridgeContent "from app.modules.partners_suppliers.routers.suppliers_router import router  # noqa: F401`r`n"
Move-WithBridgePy -Source (Join-Path $routerRoot "expenses.py") -Destination (Join-Path $backendApp "modules\expenses\routers\expenses_router.py") -BridgeContent "from app.modules.expenses.routers.expenses_router import router  # noqa: F401`r`n"
Move-WithBridgePy -Source (Join-Path $routerRoot "settings.py") -Destination (Join-Path $backendApp "modules\settings\routers\settings_router.py") -BridgeContent "from app.modules.settings.routers.settings_router import router  # noqa: F401`r`n"
Move-WithBridgePy -Source (Join-Path $routerRoot "auth.py") -Destination (Join-Path $backendApp "shared\auth_router.py") -BridgeContent "from app.shared.auth_router import router  # noqa: F401`r`n"
Move-WithBridgePy -Source (Join-Path $routerRoot "users.py") -Destination (Join-Path $backendApp "shared\users_router.py") -BridgeContent "from app.shared.users_router import router  # noqa: F401`r`n"

$moduleDocs = @{
    "dashboard" = @{
        Tables = @"
MODULE: DASHBOARD

Common source tables:
- subscribers
- wallet_transactions
- expenses
- office_materials
- office_sales
- partners
- partner_transactions
- card_purchases
- card_sales
- system_settings
"@
        Readme = "Dashboard module. Holds summary pages and widgets.`r`n"
    }
    "internet" = @{
        Tables = @"
MODULE: INTERNET

TABLES:
- subscribers
- subscriber_history
- internet_zones
- internet_fats
- subscription_categories
- internet_materials
- internet_material_sales
- wallet_transactions
"@
        Readme = "Internet module. Subscribers, wallet, materials, zones, FAT, reports.`r`n"
    }
    "office" = @{
        Tables = @"
MODULE: OFFICE

TABLES:
- office_materials
- office_customers
- office_customer_history
- office_sales
"@
        Readme = "Office module. Materials, customers, sales.`r`n"
    }
    "cards" = @{
        Tables = @"
MODULE: CARDS

TABLES:
- card_wallet_transactions
- card_purchases
- card_sales
- cashback_history
"@
        Readme = "Cards module. Wallets, purchases, sales.`r`n"
    }
    "partners_suppliers" = @{
        Tables = @"
MODULE: PARTNERS_SUPPLIERS

TABLES:
- partners
- partner_transactions

POTENTIAL / REVIEW:
- suppliers
- supplier_transactions
"@
        Readme = "Partners and suppliers module.`r`n"
    }
    "expenses" = @{
        Tables = @"
MODULE: EXPENSES

TABLES:
- expenses
"@
        Readme = "Expenses module.`r`n"
    }
    "settings" = @{
        Tables = @"
MODULE: SETTINGS

TABLES:
- system_settings
- users
"@
        Readme = "Settings module.`r`n"
    }
}

foreach ($name in $moduleDocs.Keys) {
    Write-TextFile -Path (Join-Path $frontendSrc ("modules\" + $name + "\tables.txt")) -Content $moduleDocs[$name].Tables
    Write-TextFile -Path (Join-Path $frontendSrc ("modules\" + $name + "\docs\README.txt")) -Content $moduleDocs[$name].Readme
    Write-TextFile -Path (Join-Path $backendApp ("modules\" + $name + "\tables.txt")) -Content $moduleDocs[$name].Tables
    Write-TextFile -Path (Join-Path $backendApp ("modules\" + $name + "\docs\README.txt")) -Content $moduleDocs[$name].Readme
}

Write-TextFile -Path (Join-Path $backendApp "modules\internet\schemas\README.txt") -Content "Keep existing shared schemas.py for now. Split later after tests.`r`n"
Write-TextFile -Path (Join-Path $backendApp "modules\internet\models\README.txt") -Content "Keep existing shared models.py for now. Split later after tests.`r`n"

$cleanupReview = Join-Path $root "_cleanup_review"
Ensure-Dir $cleanupReview
Ensure-Dir (Join-Path $cleanupReview "logs")
Ensure-Dir (Join-Path $cleanupReview "notes")
Ensure-Dir (Join-Path $cleanupReview "sql")

$knownRootFiles = @(
    "backend_runtime.log",
    "frontend_runtime.log",
    "system_report.txt",
    "AppContext.txt",
    "intrnet.txt"
)

foreach ($file in $knownRootFiles) {
    $src = Join-Path $root $file
    if (Test-Path $src) {
        Move-IfExists -Source $src -Destination (Join-Path $cleanupReview ("notes\" + $file))
    }
}

if ($DeleteKnownGeneratedLogs) {
    $deleteTargets = @(
        (Join-Path $root "backend_runtime.log"),
        (Join-Path $root "frontend_runtime.log")
    )
    foreach ($target in $deleteTargets) {
        if (Test-Path $target) {
            Remove-Item -Path $target -Force
            Write-Log "Deleted generated log: $target" "WARN"
        }
    }
}

Write-TextFile -Path (Join-Path $errorsDir "NEXT_STEPS.txt") -Content @"
NEXT STEPS

1. Start the system and test each route/page.
2. If an error appears, run the launcher script with logging.
3. Review bridge files before deleting any old path.
4. Do NOT split models.py or schemas.py yet.
5. After a stable run, continue module-by-module cleanup.
"@

Write-Log "Restructure completed."
Write-Log "Review log file: $script:LogFile"
Write-Log "Error/support folder: $errorsDir"
