"""جدولة النسخ الاحتياطي (يومي / أسبوعي / شهري). يتطلب الحزمة apscheduler؛ بدونها يعمل النظام لكن بدون جدولة تلقائية."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from app.core import database
from app.models import models

_logger = logging.getLogger(__name__)

_scheduler: Any = None

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    _APSCHEDULER_AVAILABLE = True
except ImportError:
    BackgroundScheduler = None  # type: ignore[misc, assignment]
    CronTrigger = None  # type: ignore[misc, assignment]
    _APSCHEDULER_AVAILABLE = False
    _logger.warning(
        "apscheduler not installed — manual backup OK, scheduled backup disabled. "
        "Install: pip install apscheduler  "
        "(النسخ اليدوي يعمل؛ للجدولة التلقائية ثبّت الحزمة أعلاه.)"
    )

def parse_hhmm(s: str) -> tuple[int, int]:
    parts = (s or "02:00").strip().split(":")
    try:
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
    except ValueError as e:
        raise ValueError("صيغة الوقت يجب أن تكون HH:MM") from e
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError("وقت غير صالح")
    return h, m


def _run_scheduled_job() -> None:
    db = database.SessionLocal()
    try:
        from app.core import backup_service

        _, info = backup_service.create_backup_sql(db)
        row = db.query(models.SystemSettings).order_by(models.SystemSettings.id.asc()).first()
        if row:
            row.backup_last_scheduled_at = datetime.utcnow()
        log = models.ActivityLog(
            user_id=None,
            user_name="النسخ التلقائي",
            section="settings",
            action="backup_scheduled",
            details=f"نسخ مجدول: {info.filename} ({info.size_bytes} بايت)",
        )
        db.add(log)
        db.commit()
        _logger.info("Scheduled PostgreSQL backup OK: %s", info.filename)
    except Exception:
        db.rollback()
        _logger.exception("Scheduled backup failed")
    finally:
        db.close()


def sync_backup_schedule() -> None:
    """إعادة ضبط مهمة الكرون حسب صف إعدادات النظام."""
    global _scheduler

    if not _APSCHEDULER_AVAILABLE:
        _logger.debug("sync_backup_schedule: skipped (apscheduler not installed)")
        return

    if _scheduler is None:
        _scheduler = BackgroundScheduler()
        _scheduler.start()
        _logger.info("BackgroundScheduler started (backup jobs)")

    try:
        _scheduler.remove_job("postgresql_backup")
    except Exception:
        pass

    db = database.SessionLocal()
    try:
        row = db.query(models.SystemSettings).order_by(models.SystemSettings.id.asc()).first()
        sched = (getattr(row, "backup_schedule", None) or "none").strip().lower()
        if not row or sched in ("", "none"):
            _logger.info("Backup schedule: disabled")
            return

        h, m = parse_hhmm(getattr(row, "backup_schedule_time", None) or "02:00")

        if sched == "daily":
            _scheduler.add_job(
                _run_scheduled_job,
                CronTrigger(hour=h, minute=m),
                id="postgresql_backup",
                replace_existing=True,
            )
        elif sched == "weekly":
            dow = getattr(row, "backup_schedule_weekday", None)
            if dow is None:
                dow = 5
            _scheduler.add_job(
                _run_scheduled_job,
                CronTrigger(day_of_week=dow, hour=h, minute=m),
                id="postgresql_backup",
                replace_existing=True,
            )
        elif sched == "monthly":
            dom = getattr(row, "backup_schedule_month_day", None) or 1
            dom = max(1, min(int(dom), 28))
            _scheduler.add_job(
                _run_scheduled_job,
                CronTrigger(day=dom, hour=h, minute=m),
                id="postgresql_backup",
                replace_existing=True,
            )
        else:
            return

        _logger.info("Backup schedule synced: %s at %02d:%02d (server local time)", sched, h, m)
    finally:
        db.close()


def create_daily_backup_job() -> None:
    """تسجيل مهمة نسخ احتياطي ثابتة يومياً الساعة 03:00 بصرف النظر عن إعدادات النظام."""
    global _scheduler

    if not _APSCHEDULER_AVAILABLE:
        _logger.warning("create_daily_backup_job: apscheduler not installed — daily backup disabled")
        return

    if _scheduler is None:
        _scheduler = BackgroundScheduler()
        _scheduler.start()
        _logger.info("BackgroundScheduler started (daily backup)")

    _scheduler.add_job(
        _run_scheduled_job,
        CronTrigger(hour=3, minute=0),
        id="postgresql_daily_backup",
        replace_existing=True,
    )
    _logger.info("Daily backup job registered: every day at 03:00 → /backups")


def shutdown_backup_scheduler() -> None:
    global _scheduler
    if not _APSCHEDULER_AVAILABLE or _scheduler is None:
        _scheduler = None
        return
    try:
        _scheduler.shutdown(wait=False)
    except Exception:
        pass
    _scheduler = None
