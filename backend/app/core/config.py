from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    PROJECT_NAME: str = "Maktab Al-Malik API"
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/king_office_new"
    # قاعدة اختيارية لمزامنة FTTH الموحّدة (جدول ftth_customers). إن تُرك فارغاً يُعطّل الحفظ هناك.
    FTTH_CONNECTOR_DATABASE_URL: str | None = None
    SECRET_KEY: str = "your-default-secret-key-must-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"

    # CORS Origins - Comma separated string in ENV (overridden by ALLOWED_ORIGINS in .env)
    ALLOWED_ORIGINS: str = (
        "https://kingoffice.store,https://www.kingoffice.store,"
        "https://my-web-app-cyyv.onrender.com,https://king-office.onrender.com,"
        "http://localhost:5173,http://127.0.0.1:5173"
    )

    # Server
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    # Uvicorn --reload (development only; keep false for stable local production)
    UVICORN_RELOAD: bool = False

    # Logging (relative paths are resolved from backend working directory)
    LOG_DIR: str = "logs"
    LOG_LEVEL: str = "INFO"

    # Frontend static (Vite outDir); relative to backend parent (project root)
    FRONTEND_DIST: str = Field(
        default_factory=lambda: str(_backend_root().parent / "dist"),
        description="Path to Vite dist folder",
    )
    SERVE_FRONTEND: bool = True

    # مجلد تخزين ملفات النسخ الاحتياطي (.sql). الافتراضي: backend/data/backups
    BACKUP_DIR: str | None = None
    # مجلد bin لأدوات PostgreSQL إن لم تكن في PATH
    PG_TOOLS_BIN: str | None = None

    ADMIN_EMAIL: str = "admin@maktabalmalik.com"
    # Leave empty in production: a strong password is generated on first bootstrap (see logs/)
    ADMIN_INITIAL_PASSWORD: str | None = None
    BOOTSTRAP_WIPE_USERS: bool = False

    # ربط Telegram من n8n: أرسل نفس القيمة في الهيدر X-Telegram-Link-Secret
    # إذا تُرك فارغاً في development يُسمح بالوصول بدون هيدر (لا يُنصح للإنتاج).
    TELEGRAM_LINK_SECRET: str | None = None

    # Email — Resend API
    # Get your key from https://resend.com/api-keys
    # MAIL_FROM must use a domain verified in Resend (e.g. noreply@kingoffice.store)
    RESEND_API_KEY: str | None = None
    MAIL_FROM: str = "noreply@kingoffice.store"

    # Sentry (اختياري — ضع DSN من لوحة Sentry)
    SENTRY_DSN: str | None = None

    # بريد استلام تنبيهات المدير (إن تُرك فارغاً يُستخدم ADMIN_EMAIL)
    ADMIN_NOTIFY_EMAIL: str | None = None

    model_config = SettingsConfigDict(
        env_file=str(_backend_root() / ".env"),
        extra="ignore",
        case_sensitive=True,
    )

    @model_validator(mode="after")
    def production_and_reload_rules(self):
        if self.ENVIRONMENT == "production":
            if not self.SECRET_KEY or "your-default-secret-key" in self.SECRET_KEY.lower():
                raise ValueError(
                    "SECRET_KEY must be set in .env for production. "
                    'Generate with: python -c "import secrets; print(secrets.token_hex(32))"'
                )
            if not (self.TELEGRAM_LINK_SECRET or "").strip():
                raise ValueError(
                    "TELEGRAM_LINK_SECRET must be set in .env for production (n8n sends X-Telegram-Link-Secret)."
                )
            # Never use dev reload in production mode
            object.__setattr__(self, "UVICORN_RELOAD", False)
        return self

    def resolved_allowed_origins(self) -> list[str]:
        """Convert comma-separated string to list of origins."""
        if not self.ALLOWED_ORIGINS:
            return []
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    def resolved_log_dir(self) -> Path:
        p = Path(self.LOG_DIR)
        if not p.is_absolute():
            p = _backend_root() / p
        return p

    def resolved_frontend_dist(self) -> Path:
        p = Path(self.FRONTEND_DIST)
        if not p.is_absolute():
            p = _backend_root().parent / p
        return p.resolve()


settings = Settings()
