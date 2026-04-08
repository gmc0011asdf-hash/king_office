import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError, SQLAlchemyError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core import database
from app.core.config import settings
from app.core.db_bootstrap import bootstrap_if_needed
from app.core.audit_middleware import AuditMiddleware
from app.core.dependencies import get_current_user, require_admin, require_phone_directory_access
from app.core.rate_limit import limiter
from app.core.exception_handlers import register_exception_handlers
from app.core.logging_config import setup_logging
from app.models import models


def create_tables_safely() -> None:
    """
    مزامنة نماذج SQLAlchemy مع PostgreSQL — غير قاتل: أخطاء DDL (مثل DuplicateTable)
    لا توقف تشغيل التطبيق (Render / Supabase).
    """
    print("Attempting DB sync (SQLAlchemy create_all, checkfirst=True)...", flush=True)
    try:
        database.Base.metadata.create_all(bind=database.engine, checkfirst=True)
        print("DB sync finished successfully.", flush=True)
    except ProgrammingError as e:
        print(
            f"DB sync skipped (ProgrammingError, e.g. duplicate table — non-fatal): {e}",
            flush=True,
        )
    except SQLAlchemyError as e:
        print(f"DB sync skipped (SQLAlchemyError — non-fatal): {e}", flush=True)
    except Exception as e:
        print(f"DB sync skipped (unexpected error — non-fatal): {type(e).__name__}: {e}", flush=True)


def bootstrap_schema_nonfatal() -> None:
    """تطبيق schema_idempotent.sql عبر psycopg2 — لا يوقف السيرفر عند تعارض DDL."""
    print("Attempting database bootstrap (schema SQL + admin seed)...", flush=True)
    try:
        bootstrap_if_needed(settings.DATABASE_URL)
        print("Database bootstrap finished successfully.", flush=True)
    except Exception as e:
        print(f"Database bootstrap skipped (non-fatal): {type(e).__name__}: {e}", flush=True)


# Logging first (files under backend/logs/)
setup_logging(settings)

from app.modules.internet.phone_directory_fix import normalize_stored_internet_phones
from app.routers.activity_log import router as activity_log_router
from app.routers.audit import router as audit_router
from app.routers.auth import router as auth_router
from app.routers.broadcast import router as broadcast_router
from app.routers.backup import router as backup_router
from app.routers.cards import router as cards_router
from app.routers.expenses import router as expenses_router
from app.routers.ftth_portal import router as ftth_portal_router
from app.modules.internet.routers.alerts_router import router as alerts_router
from app.routers.internet_meta import router as internet_meta_router
from app.routers.internet_phones import router as internet_phones_router
from app.routers.internet_reports import router as internet_reports_router
from app.routers.materials import router as materials_router
from app.routers.notifications import router as notifications_router
from app.routers.partners import router as partners_router
from app.routers.settings import router as settings_router
from app.routers.sim_cards import router as sim_cards_router
from app.routers.subscribers import router as subscribers_router
from app.routers.suppliers import router as suppliers_router
from app.routers.users import router as users_router
from app.routers.wallet import router as wallet_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from app.core.broadcast_scheduler import (
        setup_broadcast_scheduler,
        shutdown_broadcast_scheduler,
    )
    from app.core.backup_scheduler import (
        create_daily_backup_job,
        shutdown_backup_scheduler,
        sync_backup_schedule,
    )

    sync_backup_schedule()
    create_daily_backup_job()
    setup_broadcast_scheduler()
    yield
    shutdown_backup_scheduler()
    shutdown_broadcast_scheduler()


_docs_url = "/docs" if settings.ENVIRONMENT != "production" else None
_redoc_url = "/redoc" if settings.ENVIRONMENT != "production" else None

app = FastAPI(
    title="Maktab Al-Malik API",
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
)

register_exception_handlers(app)

# تشغيل إعداد قاعدة البيانات في خيط منفصل حتى لا يتأخر ربط المنفذ (port bind).
# psycopg2.connect بدون connect_timeout كان يُعلّق العملية ويُسبّب timeout على Render.
# الإعداد كاملاً idempotent: CREATE IF NOT EXISTS + تحديث مستخدم admin إن لم يكن موجوداً.
# الطلبات الأولى آمنة لأن الـ schema موجود مسبقاً على Supabase.
def _run_bootstrap() -> None:
    bootstrap_schema_nonfatal()
    create_tables_safely()


if settings.ENVIRONMENT != "production":
    threading.Thread(target=_run_bootstrap, daemon=True, name="db-bootstrap").start()
else:
    print("Production environment: skipping auto db-bootstrap thread to preserve gunicorn workers and health checks.", flush=True)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middleware: آخر مُضاف يستقبل الطلب أولاً — CORS أبعد طبقة نحو العميل.
app.add_middleware(AuditMiddleware)
app.add_middleware(SlowAPIMiddleware)

# CORS — Source of origins from settings (modular & dynamic)
origins = settings.resolved_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=(
        r"^https://[a-z0-9-]+\.onrender\.com$"
        r"|^https?://(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    dist = settings.resolved_frontend_dist()
    serve_on = settings.SERVE_FRONTEND and dist.is_dir()
    index = dist / "index.html"
    if serve_on and index.is_file():
        return FileResponse(index)
    return {
        "message": "Maktab Al-Malik API — use /docs (non-production) or build the frontend.",
        "serve_frontend": settings.SERVE_FRONTEND,
        "frontend_dist_exists": dist.is_dir(),
        "index_html_present": index.is_file() if dist.is_dir() else False,
        "hint": (
            "This JSON is normal when the API runs without a built SPA in FRONTEND_DIST, "
            "or when opening the API URL directly. Use the SPA URL (or set SERVE_FRONTEND + dist) for the UI."
        ),
    }


@app.get("/health")
def health_check():
    """Health check for load balancers and monitoring."""
    from app.core.database import engine

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": "disconnected", "detail": str(e)}


@app.get("/health/protected")
def health_protected(_: models.User = Depends(get_current_user)):
    return {"status": "ok", "message": "Protected route - requires valid token"}




# --- API routers ---
app.include_router(audit_router)
app.include_router(auth_router)
app.include_router(broadcast_router)
app.include_router(users_router)
app.include_router(subscribers_router)
app.include_router(internet_meta_router)
app.include_router(internet_reports_router)
app.include_router(internet_phones_router)
app.include_router(ftth_portal_router)
app.include_router(alerts_router)




app.include_router(wallet_router)
app.include_router(expenses_router)
app.include_router(cards_router)
app.include_router(materials_router)
app.include_router(partners_router)
app.include_router(suppliers_router)
app.include_router(settings_router)
app.include_router(sim_cards_router)
app.include_router(notifications_router)
app.include_router(activity_log_router)
app.include_router(backup_router)

# --- SPA: serve Vite dist (must be registered last) ---
_dist = settings.resolved_frontend_dist()
if settings.SERVE_FRONTEND and _dist.is_dir():


    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (_dist / full_path).resolve()
        try:
            candidate.relative_to(_dist.resolve())
        except ValueError:
            raise HTTPException(status_code=404, detail="Not found") from None
        if candidate.is_file():
            return FileResponse(candidate)
        index = _dist / "index.html"
        if index.is_file():
            return FileResponse(index)
        raise HTTPException(status_code=404, detail="Not found")


if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.asgi import SentryAsgiMiddleware

    sentry_sdk.init(dsn=settings.SENTRY_DSN.strip(), traces_sample_rate=0.0, send_default_pii=False)
    app = SentryAsgiMiddleware(app)
