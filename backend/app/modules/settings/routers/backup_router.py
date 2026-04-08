"""نسخ احتياطي واسترجاع قاعدة PostgreSQL — للمدير فقط."""
from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core import backup_service, database
from app.core.backup_scheduler import parse_hhmm, sync_backup_schedule
from app.core.dependencies import require_admin
from app.models import models

router = APIRouter(prefix="/api/admin/backup", tags=["Backup"])


class BackupItemOut(BaseModel):
    filename: str
    size_bytes: int
    modified_at: str


class CreateBackupOut(BaseModel):
    ok: bool = True
    message: str = "تم إنشاء النسخة الاحتياطية (PostgreSQL / pg_dump)"
    backup: BackupItemOut


class RestoreBody(BaseModel):
    filename: str = Field(..., min_length=10, max_length=200)


class BackupSettingsOut(BaseModel):
    backup_storage_path: str | None = None
    backup_schedule: str = "none"
    backup_schedule_time: str = "02:00"
    backup_schedule_weekday: int | None = None
    backup_schedule_month_day: int | None = None
    backup_last_scheduled_at: str | None = None


class BackupSettingsIn(BaseModel):
    backup_storage_path: str | None = None
    backup_schedule: Literal["none", "daily", "weekly", "monthly"] = "none"
    backup_schedule_time: str = "02:00"
    backup_schedule_weekday: int | None = Field(default=None, ge=0, le=6)
    backup_schedule_month_day: int | None = Field(default=None, ge=1, le=28)


def _settings_row(db: Session) -> models.SystemSettings:
    row = db.query(models.SystemSettings).order_by(models.SystemSettings.id.asc()).first()
    if not row:
        row = models.SystemSettings()
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/settings", response_model=BackupSettingsOut)
def get_backup_settings(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    row = _settings_row(db)
    last = getattr(row, "backup_last_scheduled_at", None)
    return BackupSettingsOut(
        backup_storage_path=row.backup_storage_path,
        backup_schedule=(row.backup_schedule or "none").strip().lower(),
        backup_schedule_time=row.backup_schedule_time or "02:00",
        backup_schedule_weekday=row.backup_schedule_weekday,
        backup_schedule_month_day=row.backup_schedule_month_day,
        backup_last_scheduled_at=last.isoformat() if isinstance(last, datetime) else None,
    )


@router.put("/settings", response_model=BackupSettingsOut)
def put_backup_settings(
    body: BackupSettingsIn,
    db: Session = Depends(database.get_db),
    user: models.User = Depends(require_admin),
):
    try:
        parse_hhmm(body.backup_schedule_time)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    row = _settings_row(db)
    path_raw = (body.backup_storage_path or "").strip()
    row.backup_storage_path = path_raw if path_raw else None
    row.backup_schedule = body.backup_schedule
    row.backup_schedule_time = (body.backup_schedule_time or "02:00").strip()
    row.backup_schedule_weekday = None
    row.backup_schedule_month_day = None
    if body.backup_schedule == "weekly":
        row.backup_schedule_weekday = (
            body.backup_schedule_weekday if body.backup_schedule_weekday is not None else 5
        )
    elif body.backup_schedule == "monthly":
        row.backup_schedule_month_day = (
            body.backup_schedule_month_day if body.backup_schedule_month_day is not None else 1
        )

    db.commit()
    db.refresh(row)

    try:
        log = models.ActivityLog(
            user_id=user.id,
            user_name=user.name or user.email or "",
            section="settings",
            action="backup_settings_update",
            details=f"إعدادات النسخ: مسار={row.backup_storage_path or 'افتراضي'}، جدولة={row.backup_schedule}",
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()

    try:
        sync_backup_schedule()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"حُفظت الإعدادات لكن فشل ضبط الجدولة: {e}") from e

    last = row.backup_last_scheduled_at
    return BackupSettingsOut(
        backup_storage_path=row.backup_storage_path,
        backup_schedule=(row.backup_schedule or "none").strip().lower(),
        backup_schedule_time=row.backup_schedule_time or "02:00",
        backup_schedule_weekday=row.backup_schedule_weekday,
        backup_schedule_month_day=row.backup_schedule_month_day,
        backup_last_scheduled_at=last.isoformat() if isinstance(last, datetime) else None,
    )


@router.get("/list", response_model=list[BackupItemOut])
def list_backups(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    return [BackupItemOut(**b.__dict__) for b in backup_service.list_backups(db)]


@router.post("/create", response_model=CreateBackupOut)
def create_backup(
    db: Session = Depends(database.get_db),
    user: models.User = Depends(require_admin),
):
    try:
        _, info = backup_service.create_backup_sql(db)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    try:
        log = models.ActivityLog(
            user_id=user.id,
            user_name=user.name or user.email or "",
            section="settings",
            action="backup_create",
            details=f"نسخ PostgreSQL: {info.filename} ({info.size_bytes} بايت)",
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()

    return CreateBackupOut(
        backup=BackupItemOut(
            filename=info.filename,
            size_bytes=info.size_bytes,
            modified_at=info.modified_at,
        )
    )


@router.get("/download-now")
def download_backup_now(
    db: Session = Depends(database.get_db),
    user: models.User = Depends(require_admin),
):
    """ينشئ نسخة احتياطية فورية عبر pg_dump ويُعيدها مباشرةً كملف قابل للتحميل."""
    try:
        out_path, info = backup_service.create_backup_sql(db)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    try:
        log = models.ActivityLog(
            user_id=user.id,
            user_name=user.name or user.email or "",
            section="settings",
            action="backup_create",
            details=f"تحميل مباشر: {info.filename} ({info.size_bytes} بايت)",
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()

    return FileResponse(
        path=str(out_path),
        filename=info.filename,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{info.filename}"'},
    )


@router.get("/download/{filename}")
def download_backup(
    filename: str,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    try:
        safe = backup_service.validate_backup_filename(filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    path = backup_service.resolve_backup_dir(db) / safe
    if not path.is_file():
        raise HTTPException(status_code=404, detail="الملف غير موجود")
    return FileResponse(
        path=str(path),
        filename=safe,
        media_type="application/sql",
    )


@router.post("/restore")
def restore_backup(
    body: RestoreBody,
    db: Session = Depends(database.get_db),
    user: models.User = Depends(require_admin),
):
    try:
        safe = backup_service.validate_backup_filename(body.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    path = backup_service.resolve_backup_dir(db) / safe
    if not path.is_file():
        raise HTTPException(status_code=404, detail="الملف غير موجود")
    user_id = user.id
    user_name = user.name or user.email or ""
    # أغلق جلسة ORM قبل psql الطويلة لتفريغ اتصال الحوض وتجنّب تعليق طلبات أخرى
    db.close()
    try:
        backup_service.restore_from_sql_file(path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    db_log = database.SessionLocal()
    try:
        log = models.ActivityLog(
            user_id=user_id,
            user_name=user_name,
            section="settings",
            action="backup_restore",
            details=f"استرجاع من: {safe}",
        )
        db_log.add(log)
        db_log.commit()
    except Exception:
        db_log.rollback()
    finally:
        db_log.close()

    return {
        "ok": True,
        "message": "تم تنفيذ الاسترجاع. يُنصح بإعادة تشغيل الخادم وتحديث الصفحة.",
    }


@router.post("/restore-upload")
async def restore_backup_upload(
    db: Session = Depends(database.get_db),
    user: models.User = Depends(require_admin),
    file: UploadFile = File(...),
):
    if not file.filename or not str(file.filename).lower().endswith(".sql"):
        raise HTTPException(status_code=400, detail="يُسمح بملفات .sql فقط")

    max_bytes = 500 * 1024 * 1024
    uid = uuid.uuid4().hex
    temp_path = backup_service.resolve_backup_dir(db) / f"_restore_upload_{uid}.sql"
    user_id = user.id
    user_name = user.name or user.email or ""
    orig_filename = file.filename or "upload.sql"
    try:
        total = 0
        with open(temp_path, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(status_code=413, detail="حجم الملف يتجاوز الحد المسموح (500 ميجابايت)")
                out.write(chunk)
        db.close()
        backup_service.restore_from_sql_file(temp_path)
    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass

    db_log = database.SessionLocal()
    try:
        log = models.ActivityLog(
            user_id=user_id,
            user_name=user_name,
            section="settings",
            action="backup_restore_upload",
            details=f"استرجاع من ملف مرفوع: {orig_filename}",
        )
        db_log.add(log)
        db_log.commit()
    except Exception:
        db_log.rollback()
    finally:
        db_log.close()

    return {
        "ok": True,
        "message": "تم تنفيذ الاسترجاع من الملف المرفوع. يُنصح بإعادة تشغيل الخادم وتحديث الصفحة.",
    }


@router.delete("/{filename}")
def delete_backup(
    filename: str,
    db: Session = Depends(database.get_db),
    user: models.User = Depends(require_admin),
):
    try:
        backup_service.delete_backup(filename, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="الملف غير موجود") from None

    try:
        log = models.ActivityLog(
            user_id=user.id,
            user_name=user.name or user.email or "",
            section="settings",
            action="backup_delete",
            details=f"حذف نسخة: {Path(filename).name}",
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()

    return {"ok": True, "message": "تم حذف النسخة الاحتياطية"}
