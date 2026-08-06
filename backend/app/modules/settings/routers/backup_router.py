"""Local SQLite backup and restore endpoints — administrator only."""
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
    message: str = "تم إنشاء نسخة احتياطية محلية من SQLite"
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


def _backup_out(info: backup_service.BackupInfo) -> BackupItemOut:
    return BackupItemOut(
        filename=info.filename,
        size_bytes=info.size_bytes,
        modified_at=info.modified_at,
    )


def _activity(db: Session, user: models.User, action: str, details: str) -> None:
    try:
        db.add(
            models.ActivityLog(
                user_id=user.id,
                user_name=user.name or user.email or "",
                section="settings",
                action=action,
                details=details,
            )
        )
        db.commit()
    except Exception:
        db.rollback()


@router.get("/settings", response_model=BackupSettingsOut)
def get_backup_settings(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    row = _settings_row(db)
    last = row.backup_last_scheduled_at
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
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    row = _settings_row(db)
    row.backup_storage_path = (body.backup_storage_path or "").strip() or None
    row.backup_schedule = body.backup_schedule
    row.backup_schedule_time = body.backup_schedule_time.strip()
    row.backup_schedule_weekday = body.backup_schedule_weekday if body.backup_schedule == "weekly" else None
    row.backup_schedule_month_day = body.backup_schedule_month_day if body.backup_schedule == "monthly" else None
    db.commit()
    db.refresh(row)
    _activity(db, user, "backup_settings_update", f"جدولة النسخ المحلي: {row.backup_schedule}")
    sync_backup_schedule()
    return get_backup_settings(db, user)


@router.get("/list", response_model=list[BackupItemOut])
def list_backups(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    return [_backup_out(info) for info in backup_service.list_backups(db)]


@router.post("/create", response_model=CreateBackupOut)
def create_backup(
    db: Session = Depends(database.get_db),
    user: models.User = Depends(require_admin),
):
    try:
        _, info = backup_service.create_backup_sql(db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _activity(db, user, "backup_create", f"نسخة SQLite: {info.filename}")
    return CreateBackupOut(backup=_backup_out(info))


@router.get("/download-now")
def download_backup_now(
    db: Session = Depends(database.get_db),
    user: models.User = Depends(require_admin),
):
    try:
        path, info = backup_service.create_backup_sql(db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _activity(db, user, "backup_create", f"تحميل نسخة SQLite: {info.filename}")
    return FileResponse(path=str(path), filename=info.filename, media_type="application/vnd.sqlite3")


@router.get("/download/{filename}")
def download_backup(
    filename: str,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    try:
        safe_name = backup_service.validate_backup_filename(filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    path = backup_service.resolve_backup_dir(db) / safe_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="الملف غير موجود")
    return FileResponse(path=str(path), filename=safe_name, media_type="application/vnd.sqlite3")


@router.post("/restore")
def restore_backup(
    body: RestoreBody,
    db: Session = Depends(database.get_db),
    user: models.User = Depends(require_admin),
):
    try:
        safe_name = backup_service.validate_backup_filename(body.filename)
        path = backup_service.resolve_backup_dir(db) / safe_name
        backup_service.restore_from_sql_file(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _activity(db, user, "backup_restore", f"استرجاع SQLite من: {safe_name}")
    return {"ok": True, "message": "تم الاسترجاع. أعد تشغيل النظام لضمان فتح القاعدة الجديدة."}


@router.post("/restore-upload")
async def restore_backup_upload(
    db: Session = Depends(database.get_db),
    user: models.User = Depends(require_admin),
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".sqlite3"):
        raise HTTPException(status_code=400, detail="يُسمح بملفات .sqlite3 فقط")

    temp_path = backup_service.resolve_backup_dir(db) / f"_restore_upload_{uuid.uuid4().hex}.sqlite3"
    try:
        total = 0
        with temp_path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > 500 * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="حجم الملف يتجاوز 500 ميجابايت")
                output.write(chunk)
        backup_service.restore_from_sql_file(temp_path)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        temp_path.unlink(missing_ok=True)

    _activity(db, user, "backup_restore_upload", f"استرجاع SQLite مرفوع: {file.filename}")
    return {"ok": True, "message": "تم الاسترجاع. أعد تشغيل النظام."}


@router.delete("/{filename}")
def delete_backup(
    filename: str,
    db: Session = Depends(database.get_db),
    user: models.User = Depends(require_admin),
):
    try:
        backup_service.delete_backup(filename, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    _activity(db, user, "backup_delete", f"حذف نسخة SQLite: {Path(filename).name}")
    return {"ok": True, "message": "تم حذف النسخة الاحتياطية"}
