"""Logging: console + rotating files under logs/, with basic secret redaction."""
from __future__ import annotations

import logging
import re
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.config import Settings

_REDACT_PATTERNS = [
    (re.compile(r"(password|secret|token|authorization)\s*[:=]\s*\S+", re.I), r"\1=***"),
    (re.compile(r"Bearer\s+\S+", re.I), "Bearer ***"),
    (re.compile(r"PGPASSWORD=\S+"), "PGPASSWORD=***"),
]


class _RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
            for rx, repl in _REDACT_PATTERNS:
                msg = rx.sub(repl, msg)
            record.msg = msg
            record.args = ()
        except Exception:
            pass
        return True


def setup_logging(settings: Settings | None = None) -> None:
    """Configure root logger: stdout + rotating file under LOG_DIR."""
    if settings is None:
        from app.core.config import settings as s

        settings = s

    log_dir = settings.resolved_log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)

    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    sh.addFilter(_RedactFilter())
    root.addHandler(sh)

    fh = RotatingFileHandler(
        log_dir / "king_office.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    fh.setFormatter(fmt)
    fh.addFilter(_RedactFilter())
    root.addHandler(fh)

    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").addFilter(_RedactFilter())
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
