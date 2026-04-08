# Skill: Release Safety

## When to use
- Before committing any change
- Before pushing to production (Render deployment)
- Before merging to main branch
- When asked to "commit and push" or "deploy"

---

## Pre-Commit Checklist

### 1. TypeScript (frontend)
```bash
npm run lint
# Expected: no errors
# Common issues: missing type on new API field, unused import
```

### 2. Backend import check
```bash
cd backend && python -c "from app.main import app; print('OK')"
# Expected: prints OK with no traceback
```

### 3. Backend tests
```bash
cd backend && python -m pytest tests/ -v
# All tests must pass
# Key tests: test_ftth_dates.py (commitment period logic)
```

### 4. Automation sandbox tests (if sandbox was touched)
```bash
cd automation_sandbox && python -m pytest tests/ -v
```

### 5. Health check (if backend is running)
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","database":"connected"}
```

### 6. Schema verification (if any DB change was made)
```sql
-- Verify columns exist
SELECT column_name FROM information_schema.columns WHERE table_name='changed_table';
```

---

## File Exclusions (Never Commit)

- `backend/.env` — contains real credentials
- `.tmp_token` — ephemeral JWT token
- `backend/logs/*.log` — runtime logs
- `dist/` — built frontend (generated)
- `backend/venv/` — Python virtual env
- `node_modules/` — npm packages
- `__pycache__/`, `*.pyc` — Python cache
- `docs/samples/admin.ftth.iq.har` — contains portal credentials
- Any file matching `*.env.local`, `*.env.production` with real secrets

Check `.gitignore` before adding new files.

---

## Sensitive Files Requiring Extra Care

| File | Risk |
|---|---|
| `backend/.env` | DATABASE_URL, SECRET_KEY, SMTP credentials |
| `docs/samples/admin.ftth.iq.har` | admin.ftth.iq portal username/password |
| `backend/app/core/ftth_crypto.py` | Fernet key derivation — do not change derivation logic |
| `backend/app/core/security.py` | JWT signing — do not weaken |

---

## Git Workflow

```bash
# Check what's staged
git status
git diff --cached

# Verify no secrets in diff
git diff --cached | grep -iE "password|secret|token|key" | head -20
# Review each match manually

# Commit
git commit -m "type: short summary"
# Do NOT use --no-verify

# Do NOT force push to main
```

---

## Production Deployment (Render)

- Backend: `backend/run_production_server.bat` or Render deploys from `backend/`
- Frontend: `npm run build` → `dist/` → served by backend (SERVE_FRONTEND=true) or static hosting
- CORS origins in `main.py` must include the production domain
- `SECRET_KEY` must NOT change between deploys (breaks existing JWTs and FTTH credentials)
- `DATABASE_URL` points to Supabase pooler (`aws-1-ap-northeast-1.pooler.supabase.com:5432`)

---

## After Deployment

```bash
# Verify backend is up
curl https://my-web-app-cyyv.onrender.com/health

# If FTTH sync breaks → re-enter credentials
# If users get 401 → secret key rotated, users must re-login
```

---

## Forbidden

- Do not commit `backend/.env` or `docs/samples/*.har`
- Do not rotate `SECRET_KEY` without planning for: (1) all users re-login, (2) FTTH credential re-entry
- Do not run `git push --force` to `main`
- Do not skip `npm run lint` before a frontend commit
- Do not claim "tests pass" without running them and seeing actual output
