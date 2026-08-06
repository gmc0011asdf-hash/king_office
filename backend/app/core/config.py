from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _default_database_url() -> str:
    db_path = (_backend_root() / "data" / "king_office.sqlite3").resolve()
    return f"sqlite:///{db_path.as_posix()}"


class Settings(BaseSettings):
    PROJECT_NAME: str = "Maktab Al-Malik API"
    DATABASE_URL: str = Field(default_factory=_default_database_url)
    FTTH_CONNECTOR_DATABASE_URL: str | None = None
    SECRET_KEY: str = "king-office-local-only-change-this-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    ENVIRONMENT: str = "local"
    FRONTEND_URL: str = "http://127.0.0.1:5173"

    ALLOWED_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8000,http://127.0.0.1:8000"
    )

    API_HOST: str = "127.0.0.1"
    API_PORT: int = 8000
    UVICORN_RELOAD: bool = False

    LOG_DIR: str = "logs"
    LOG_LEVEL: str = "INFO"

    FRONTEND_DIST: str = Field(
        default_factory=lambda: str(_backend_root().parent / "dist"),
        description="Path to Vite dist folder",
    )
    SERVE_FRONTEND: bool = True

    BACKUP_DIR: str | None = None

    ADMIN_EMAIL: str = "admin@kingoffice.local"
    ADMIN_INITIAL_PASSWORD: str | None = None
    BOOTSTRAP_WIPE_USERS: bool = False

    TELEGRAM_LINK_SECRET: str | None = None
    RESEND_API_KEY: str | None = None
    MAIL_FROM: str = "local@kingoffice.local"
    SENTRY_DSN: str | None = None
    ADMIN_NOTIFY_EMAIL: str | None = None

    model_config = SettingsConfigDict(
        env_file=str(_backend_root() / ".env"),
        extra="ignore",
        case_sensitive=True,
    )

    def resolved_allowed_origins(self) -> list[str]:
        if not self.ALLOWED_ORIGINS:
            return []
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    def resolved_log_dir(self) -> Path:
        path = Path(self.LOG_DIR)
        if not path.is_absolute():
            path = _backend_root() / path
        return path

    def resolved_frontend_dist(self) -> Path:
        path = Path(self.FRONTEND_DIST)
        if not path.is_absolute():
            path = _backend_root().parent / path
        return path.resolve()

    def resolved_database_path(self) -> Path:
        prefix = "sqlite:///"
        if not self.DATABASE_URL.startswith(prefix):
            raise ValueError("King Office local mode requires a sqlite:/// DATABASE_URL")
        raw_path = self.DATABASE_URL[len(prefix):]
        path = Path(raw_path)
        if not path.is_absolute():
            path = _backend_root() / path
        return path.resolve()


settings = Settings()
