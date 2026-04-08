@echo off
setlocal EnableDelayedExpansion
title King Office Setup

cd /d "%~dp0"
set "PROJECT_ROOT=%~dp0"
if not exist "%PROJECT_ROOT%package.json" (
    echo.
    echo [ERROR] package.json not found. Run setup_new_machine.bat from King Office project root.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   King Office - Full System Setup
echo   New machine - installs requirements
echo ========================================
echo.
echo This window stays open when done - type exit then Enter to close.
echo.

set "NEED_RERUN=0"

:: ========== Step 0a: Node.js ==========
echo [0a] Checking Node.js...
set "NODE_READY=0"
where node >nul 2>&1
if !errorlevel! equ 0 set "NODE_READY=1"
if "!NODE_READY!"=="0" if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    set "NODE_READY=1"
)
if "!NODE_READY!"=="0" if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
    set "NODE_READY=1"
)
if "!NODE_READY!"=="1" (
    echo [0a] OK - Node.js already installed.
    node -v 2>nul
) else (
    echo [0a] Node.js not found - trying winget...
    where winget >nul 2>&1
    if !errorlevel! equ 0 (
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        set "NEED_RERUN=1"
    ) else (
        echo ERROR: Node.js missing and winget unavailable. Install from https://nodejs.org
        pause
        exit /b 1
    )
)
echo.

:: ========== Step 0b: Python ==========
echo [0b] Checking Python...
set "PYTHON_CMD="
where python >nul 2>&1
if !errorlevel! equ 0 set "PYTHON_CMD=python"
if "!PYTHON_CMD!"=="" (
    where py >nul 2>&1
    if !errorlevel! equ 0 set "PYTHON_CMD=py -3"
)
if "!PYTHON_CMD!"=="" if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PYTHON_CMD=%LocalAppData%\Programs\Python\Python312\python.exe"
if "!PYTHON_CMD!"=="" if exist "%LocalAppData%\Programs\Python\Python314\python.exe" set "PYTHON_CMD=%LocalAppData%\Programs\Python\Python314\python.exe"
if "!PYTHON_CMD!"=="" if exist "%LocalAppData%\Programs\Python\Python313\python.exe" set "PYTHON_CMD=%LocalAppData%\Programs\Python\Python313\python.exe"
if "!PYTHON_CMD!"=="" if exist "%LocalAppData%\Programs\Python\Python311\python.exe" set "PYTHON_CMD=%LocalAppData%\Programs\Python\Python311\python.exe"
if "!PYTHON_CMD!"=="" if exist "%ProgramFiles%\Python314\python.exe" set "PYTHON_CMD=%ProgramFiles%\Python314\python.exe"
if "!PYTHON_CMD!"=="" if exist "%ProgramFiles%\Python312\python.exe" set "PYTHON_CMD=%ProgramFiles%\Python312\python.exe"
if "!PYTHON_CMD!"=="" if exist "%ProgramFiles%\Python311\python.exe" set "PYTHON_CMD=%ProgramFiles%\Python311\python.exe"
if defined PYTHON_CMD (
    echo [0b] OK - Python already installed.
) else (
    echo [0b] Python not found - trying winget...
    where winget >nul 2>&1
    if !errorlevel! equ 0 (
        winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
        set "NEED_RERUN=1"
        set "PYTHON_CMD=python"
    ) else (
        echo ERROR: Python missing and winget unavailable. Install from https://python.org
        pause
        exit /b 1
    )
)
if "!PYTHON_CMD!"=="" set "PYTHON_CMD=python"
echo.

:: ========== Step 0c: PostgreSQL ==========
echo [0c] Checking PostgreSQL...
set "PG_FOUND=0"
where psql >nul 2>&1
if !errorlevel! equ 0 set "PG_FOUND=1"
if "!PG_FOUND!"=="0" if exist "%ProgramFiles%\PostgreSQL\" (
    for /d %%D in ("%ProgramFiles%\PostgreSQL\*") do (
        if exist "%%D\bin\psql.exe" set "PG_FOUND=1"
    )
)
if "!PG_FOUND!"=="0" (
    for %%v in (17 16 15 14 13) do (
        if "!PG_FOUND!"=="0" (
            sc query postgresql-x64-%%v >nul 2>&1
            if !errorlevel! equ 0 set "PG_FOUND=1"
        )
    )
)
if "!PG_FOUND!"=="1" (
    echo [0c] OK - PostgreSQL found ^(psql, install folder, or Windows service^).
) else (
    echo [0c] PostgreSQL not detected - trying winget...
    where winget >nul 2>&1
    if !errorlevel! equ 0 (
        winget install PostgreSQL.PostgreSQL.16 --accept-package-agreements --accept-source-agreements
        set "NEED_RERUN=1"
    ) else (
        echo WARN: PostgreSQL not found and winget unavailable. Install from https://postgresql.org
        echo You can continue; DB setup will fail until PostgreSQL is installed.
    )
)
echo.

if "!NEED_RERUN!"=="1" (
    echo.
    echo ========================================
    echo   New software was installed via winget.
    echo   CLOSE this window and run setup_new_machine.bat AGAIN to refresh PATH.
    echo ========================================
    pause
    exit /b 0
)

:: ========== Step 1: npm install ==========
echo [1/6] Installing npm dependencies...
if not exist "%PROJECT_ROOT%package.json" (
    echo ERROR: package.json not found.
    pause
    exit /b 1
)
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed ^(install Node.js and reopen this window after winget^)
    pause
    exit /b 1
)
echo OK npm install done
echo.

:: ========== Step 2: Python venv ==========
echo [2/6] Setting up Python venv...
cd /d "%PROJECT_ROOT%backend"
if not exist "venv" (
    if /i "!PYTHON_CMD:~-4!"==".exe" (
        "!PYTHON_CMD!" -m venv venv
    ) else (
        %PYTHON_CMD% -m venv venv
    )
    if !errorlevel! neq 0 (
        echo ERROR: venv creation failed
        cd /d "%PROJECT_ROOT%"
        pause
        exit /b 1
    )
    echo OK venv created
) else (
    echo OK venv exists
)
call "%PROJECT_ROOT%backend\venv\Scripts\activate.bat"
pip install -r "%PROJECT_ROOT%backend\requirements.txt" -q
if errorlevel 1 (
    echo ERROR: pip install failed
    cd /d "%PROJECT_ROOT%"
    pause
    exit /b 1
)
echo OK pip install done
cd /d "%PROJECT_ROOT%"
echo.

:: ========== Step 3: Create .env files ==========
echo [3/6] Creating .env files...
if not exist "%PROJECT_ROOT%.env" (
    if exist "%PROJECT_ROOT%.env.example" (
        copy "%PROJECT_ROOT%.env.example" "%PROJECT_ROOT%.env" >nul
    ) else (
        echo VITE_API_URL=https://your-production-url.onrender.com> "%PROJECT_ROOT%.env"
    )
    echo OK .env created
) else (
    echo OK .env exists
)

if not exist "%PROJECT_ROOT%backend\.env" (
    if exist "%PROJECT_ROOT%backend\.env.example" (
        copy "%PROJECT_ROOT%backend\.env.example" "%PROJECT_ROOT%backend\.env" >nul
    ) else (
        echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/king_office_new> "%PROJECT_ROOT%backend\.env"
        echo SECRET_KEY=>> "%PROJECT_ROOT%backend\.env"
        echo ACCESS_TOKEN_EXPIRE_MINUTES=10080>> "%PROJECT_ROOT%backend\.env"
        echo ADMIN_EMAIL=admin@maktabalmalik.com>> "%PROJECT_ROOT%backend\.env"
        echo ADMIN_INITIAL_PASSWORD=>> "%PROJECT_ROOT%backend\.env"
    )
    echo OK backend\.env created
) else (
    echo OK backend\.env exists
)
echo.

:: ========== Step 4: Start PostgreSQL if not running ==========
echo [4/6] Ensuring PostgreSQL is running...
for %%v in (17 16 15 14) do net start postgresql-x64-%%v 2>nul
timeout /t 1 /nobreak >nul
echo.

:: ========== Step 5: DB init, optional full wipe, admin bootstrap ==========
echo [5/6] Database: schema init, bootstrap, optional full clean, bootstrap again...
echo       DB: init - bootstrap - [optional] clean ALL + users - bootstrap again
echo.
cd /d "%PROJECT_ROOT%backend"
call "%PROJECT_ROOT%backend\venv\Scripts\activate.bat"
if not exist "%PROJECT_ROOT%backend\logs" mkdir "%PROJECT_ROOT%backend\logs"
echo   Running: python scripts\init_db.py
python "scripts\init_db.py"
if errorlevel 1 (
    echo ERROR: init_db.py failed - check PostgreSQL and DATABASE_URL in backend\.env
    cd /d "%PROJECT_ROOT%"
    pause
    exit /b 1
)
echo   Running: python scripts\bootstrap_db.py
python "scripts\bootstrap_db.py"
if errorlevel 1 (
    echo ERROR: bootstrap_db.py failed ^(first run^)
    cd /d "%PROJECT_ROOT%"
    pause
    exit /b 1
)
echo.
echo ========================================
echo   Full database wipe confirmation
echo ========================================
echo   Y ^(or Enter^) = delete ALL app data and ALL users, then create one new admin.
echo       Command: python scripts\clean_db.py -y --full
echo   N = keep current data and users ^(skip full wipe^).
echo ========================================
set "DID_FULL_WIPE=0"
set "CONFIRM_FULL="
set /p "CONFIRM_FULL=Choose [Y] or [N] - default Y (Enter): "
if "!CONFIRM_FULL!"=="" set "CONFIRM_FULL=Y"
if /i "!CONFIRM_FULL!"=="N" (
    echo.
    echo [OK] Skipped full wipe - existing database unchanged.
    goto :after_full_wipe
)
if /i not "!CONFIRM_FULL!"=="Y" (
    echo.
    echo [WARN] Unknown input - treating as Y ^(full wipe^).
)
set "DID_FULL_WIPE=1"
echo.
echo [5b] ----------------------------------------
echo   Full wipe: python scripts\clean_db.py -y --full
echo ----------------------------------------
python "scripts\clean_db.py" -y --full
if errorlevel 1 (
    echo ERROR: clean_db.py --full failed
    cd /d "%PROJECT_ROOT%"
    pause
    exit /b 1
)
echo   [OK] clean_db.py --full finished
echo.
echo [5c] Creating one new admin ^(must change password on first login^)...
echo   Running: python scripts\bootstrap_db.py
python "scripts\bootstrap_db.py"
if errorlevel 1 (
    echo ERROR: bootstrap_db.py failed ^(after wipe^)
    cd /d "%PROJECT_ROOT%"
    pause
    exit /b 1
)

:after_full_wipe
alembic stamp head
if errorlevel 1 (
    echo WARN: alembic stamp failed - you may need to run migrations manually
)
echo [5d] Clearing internet phones dir and FTTH portal staging ^(if any^)...
python "scripts\clear_internet_phones.py"
python "scripts\clear_ftth_portal_staging.py"
cd /d "%PROJECT_ROOT%"
if "!DID_FULL_WIPE!"=="0" (
    echo OK: Full wipe was NOT run - review DB data manually if needed.
) else (
    echo OK: DB after full wipe + one admin + requires_password_change on first login
)
echo.

:: ========== Step 6: Done ==========
echo [6/6] Setup complete
echo.
echo ========================================
echo   Setup finished successfully!
echo ========================================
echo.
echo 1. Edit "backend\.env" - set DATABASE_URL and SECRET_KEY ^(required for production^)
echo 2. If ADMIN_INITIAL_PASSWORD was empty, see "backend\logs\FIRST_LOGIN_ADMIN_PASSWORD.txt"
echo 3. Documentation: docs\README.md and docs\INSTALL.md
echo 4. Production ^(API + built UI on :8000^): double-click run_system.bat
echo 5. Dev ^(separate Vite + reload^): double-click start_system_king_office.bat
echo 6. Login: admin@maktabalmalik.com — use password from logs or .env; change on first login
echo.
echo To run production: double-click run_system.bat
echo Daily shortcut: double-click daily_run.bat ^(same as run_system.bat^)
echo To run dev: double-click start_system_king_office.bat or npm run start
echo.
echo Then open: http://localhost:8000 ^(production^) or http://localhost:5173 ^(dev^)
echo.
echo FTTH: بعد مزامنة البوابة، الترحيل يربط السجل بمشترك موجود بنفس الهاتف او معرف FTTH
echo       لتفادي التكرار عند اعادة الترحيل.
echo.
echo ----------------------------------------
echo   Script finished.
echo   Press any key here, or type exit then Enter to close.
echo ----------------------------------------
pause
