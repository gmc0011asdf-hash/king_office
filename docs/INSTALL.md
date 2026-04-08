# King Office - One-Click Installation Guide

## Quick Start (Windows)

### 1. Run Setup (First Time Only)

Double-click **`setup_new_machine.bat`** (the script switches to its own folder automatically; if the window closes instantly, run it from the project folder where **`package.json`** exists, or open **cmd** in that folder and run `setup_new_machine.bat` to read any error message)

This will:
- Check **Node.js**, **Python**, and **PostgreSQL** — **skips** installing any component that is already present. PostgreSQL services are detected via fast `sc query` calls (no inline PowerShell in `.bat`, which can break `cmd.exe` parsing).
- **Important:** Keep `setup_new_machine.bat` saved as **UTF-8 with BOM** if you edit it in an editor, so Arabic `echo` lines work reliably in the console.
- Create `venv` and install dependencies
- Create `.env` files (you must edit `backend/.env` with your PostgreSQL password)
- Initialize database and create admin user
- If `ADMIN_INITIAL_PASSWORD` is not set, a random password is generated and printed
- Clear **internet phone directory** (`internet_phones`) and **FTTH portal staging** (`ftth_portal_config`, `ftth_external_data`) so a new machine starts without demo/sync data

**Important:** Edit `backend/.env` before first run:
- `DATABASE_URL` - your PostgreSQL connection string
- `ADMIN_INITIAL_PASSWORD` - set your admin password (min 8 chars), or leave empty to auto-generate

### 2. Start the System

Double-click **`start_system_king_office.bat`**

- Backend: http://localhost:8000
- Frontend: http://localhost:5173
- Browser opens automatically (uses detected IP on network)

### 3. Login

- **Email:** admin@maktabalmalik.com
- **Password:** The one you set in `ADMIN_INITIAL_PASSWORD`, or the auto-generated one (printed during setup)

---

## Security Verification

After starting the backend, verify API protection:

1. **Health (public):** `curl http://localhost:8000/health` → should return `{"status":"ok"}`
2. **Protected (no token):** `curl http://localhost:8000/health/protected` or `curl http://localhost:8000/api/users` → should return **401 Unauthorized**
3. **Protected (with token):** Login via frontend, then use the token in `Authorization: Bearer <token>` → should return 200

**Automated smoke test:**
```bash
python tests/smoke_test.py
```
Runs with backend running. Verifies `/health` returns 200 and `/api/users` returns 401 without token.

**ZIP for client delivery:** See `ZIP_EXCLUSIONS.md` for the list of files/folders to exclude when packaging the project. For a professional delivery message template, see `DELIVERY_MESSAGE.md`.

---

## Fresh Install Test (تصفير قاعدة البيانات)

To verify the bootstrap flow works correctly:

1. **Delete the database** (or drop all tables) – e.g. drop and recreate the PostgreSQL database, or run `python scripts/clean_db.py -y` in backend.
2. **Run** `setup_new_machine.bat`.
3. **Expected behavior:**
   - If `ADMIN_INITIAL_PASSWORD` is **empty** in `backend/.env`: The script generates a random password and prints it clearly:
     ```
     ============================================================
       SECURITY: Admin password auto-generated (first run)
       YOUR ADMIN PASSWORD IS:
       >>> xxxxxxxx <<<
       SAVE THIS - you will need it to login.
     ============================================================
     ```
   - If `ADMIN_INITIAL_PASSWORD` is **weak** (e.g. admin123, password): A SECURITY WARNING is printed.
   - The script does **not** prompt for password input; it uses env or auto-generates.

---

## Prerequisites (Manual Install)

| Tool | Version | Install |
|------|---------|---------|
| Node.js | LTS | https://nodejs.org |
| Python | 3.9+ | https://python.org |
| PostgreSQL | 14+ | https://postgresql.org |

---

## Environment Variables (backend/.env)

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| SECRET_KEY | Yes (prod) | JWT signing key - generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| ADMIN_EMAIL | No | Default: admin@maktabalmalik.com |
| ADMIN_INITIAL_PASSWORD | No | Set on first run, or leave empty to auto-generate |
| ENVIRONMENT | No | development \| production |

---

## Network Access

- Frontend and Backend listen on `0.0.0.0` (all interfaces)
- API URL is auto-detected from the page host
- If connection times out: run **`scripts\open_firewall_port_8000.bat`** as Administrator

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot connect to server" | Run `start_system_king_office.bat` |
| Connection timeout | Run `scripts\open_firewall_port_8000.bat` as Admin |
| PostgreSQL not running | Start service: `net start postgresql-x64-16` |
| Wrong credentials | Use the password you set or the one printed during setup |
| Health check | Open http://localhost:8000/health |
| توحيد أرقام الهاتف القديمة في DB | من مجلد `backend` مع تفعيل venv: `python scripts/normalize_iraq_phones_in_db.py` (كل الجداول) أو **`python scripts/fix_internet_phones_leading_zero.py`** (دليل الهواتف فقط) |
