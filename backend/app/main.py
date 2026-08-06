from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text

from app.core import database
from app.core.audit_middleware import AuditMiddleware
from app.core.config import settings
from app.core.db_bootstrap import bootstrap_if_needed
from app.core.dependencies import get_current_user
from app.core.exception_handlers import register_exception_handlers
from app.core.logging_config import setup_logging
from app.core.rate_limit import limiter
from app.models import models

setup_logging(settings)

from app.routers.activity_log import router as activity_log_router
from app.routers.audit import router as audit_router
from app.routers.auth import router as auth_router
from app.routers.backup import router as backup_router
from app.routers.broadcast import router as broadcast_router
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


def initialize_local_database() -> None:
    """Create a brand-new local schema and seed only the administrator."""
    bootstrap_if_needed(settings.DATABASE_URL)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from app.core.backup_scheduler import (
        create_daily_backup_job,
        shutdown_backup_scheduler,
        sync_backup_schedule,
    )
    from app.core.broadcast_scheduler import (
        setup_broadcast_scheduler,
        shutdown_broadcast_scheduler,
    )

    initialize_local_database()
    sync_backup_schedule()
    create_daily_backup_job()
    setup_broadcast_scheduler()
    yield
    shutdown_backup_scheduler()
    shutdown_broadcast_scheduler()


app = FastAPI(
    title="Maktab Al-Malik Local API",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

register_exception_handlers(app)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(AuditMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.resolved_allowed_origins(),
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    dist = settings.resolved_frontend_dist()
    index = dist / "index.html"
    if settings.SERVE_FRONTEND and index.is_file():
        return FileResponse(index)
    return {
        "message": "Maktab Al-Malik local API",
        "database": "SQLite",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    try:
        with database.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "database": "connected",
            "database_type": "sqlite",
            "mode": "local",
        }
    except Exception as exc:
        return {
            "status": "error",
            "database": "disconnected",
            "detail": str(exc),
        }


@app.get("/health/protected")
def health_protected(_: models.User = Depends(get_current_user)):
    return {"status": "ok", "message": "Protected route - requires valid token"}


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
