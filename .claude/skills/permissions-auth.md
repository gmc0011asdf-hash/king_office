# Skill: Permissions and Auth

## When to use
- JWT token rejected (401) after SECRET_KEY change
- User sees wrong sections (forbidden or missing)
- FTTH sync returns 400 due to credential decryption failure
- Adding a new section to the permission system
- Admin needs to reset a user's password
- Debugging why a `require_admin` guard fails

---

## Files to Inspect First

```
backend/app/core/security.py                      # JWT encode/decode, password hashing
backend/app/core/config.py                        # SECRET_KEY, ACCESS_TOKEN_EXPIRE_MINUTES
backend/app/core/dependencies.py                  # get_current_user, require_admin, require_phone_directory_access
backend/app/modules/auth/routers/login_router.py  # /api/auth/login endpoint
backend/app/modules/auth/routers/users_router.py  # /api/auth/users CRUD
src/shared/permissions/permissions.ts             # canAccessSection, canAction, canAccessLines
src/utils/authStorage.ts                          # token storage (localStorage)
```

---

## JWT Flow

```
POST /api/auth/login
  → username (email) + password (form-urlencoded, OAuth2PasswordRequestForm)
  → verify bcrypt hash
  → generate JWT: {"sub": email, "exp": now + ACCESS_TOKEN_EXPIRE_MINUTES}
  → return {"access_token": "...", "token_type": "bearer"}

Subsequent requests:
  Authorization: Bearer <token>
  → get_current_user() decodes JWT with SECRET_KEY
  → fetches User from DB by email
  → returns User object
```

---

## SECRET_KEY Effects

`SECRET_KEY` is used for:
1. **JWT signing** — changing it invalidates ALL existing tokens (all users logged out)
2. **FTTH credential encryption** — changing it breaks `decrypt_str(cfg.username_enc)` for stored portal credentials

**If SECRET_KEY changed:**
- All users must re-login
- FTTH portal credentials must be re-entered via `POST /api/ftth/portal/setup`

---

## Permission System

### Backend roles

| Role | Access |
|---|---|
| `admin` | All endpoints |
| `user` | Section-based (from `users.permissions` JSON field) |

### `users.permissions` structure (JSON stored in DB)

```json
{
  "sections": ["internet", "office", "cards"],
  "actions": {"internet": ["view", "edit", "add", "delete"]},
  "lines": ["ftth", "wireless"]
}
```

### Frontend permission functions

```typescript
// src/shared/permissions/permissions.ts
canAccessSection(user, 'internet')           // → boolean
canAction(user, 'internet', 'edit')          // → boolean
canAccessLines(user, ['ftth', 'wireless'])   // → boolean
```

Available sections: `dashboard`, `internet`, `office`, `cards`, `expenses`, `partners`, `reports`, `settings`

---

## Adding a New Section

1. Add section name to `src/shared/permissions/permissions.ts` type/array
2. Add route in `src/App.tsx` with `canAccessSection` guard
3. Add to the permissions editor in `src/modules/settings/` (user management UI)
4. No backend change needed — permissions are stored as free-form JSON

---

## Common Auth Commands

```bash
# Login and get token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@maktabalmalik.com&password=admin123" \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Verify token (get current user)
curl -s http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Check health (no auth required)
curl http://localhost:8000/health
```

---

## User Seeding

Admin user is seeded by `backend/app/core/db_bootstrap.py` on first startup using:
- `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` from `backend/.env`

To reset admin password:
```bash
cd backend && python scripts/upsert_admin_user.py
```

---

## FTTH Credential Re-entry

Required when `InvalidToken` appears in sync logs:
```bash
curl -X POST http://localhost:8000/api/ftth/portal/setup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "login_url": "https://admin.ftth.iq/auth/login",
    "username": "PORTAL_USER",
    "password": "PORTAL_PASS",
    "parse_mode": "ftth_iq_admin"
  }'
```

Portal credentials source: `docs/samples/admin.ftth.iq.har` (HAR file from browser).

---

## Forbidden

- Do not hardcode secrets in source files
- Do not weaken `require_admin` guards
- Do not expose JWT decode errors with internal detail to API consumers
- Do not store tokens beyond session unless explicitly using localStorage (current behavior)
- Do not change `ACCESS_TOKEN_EXPIRE_MINUTES` to a very large value in production
