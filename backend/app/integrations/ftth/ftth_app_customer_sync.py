"""
Upsert من ftth_external_data إلى ftth_customers في قاعدة التطبيق الرئيسية (DATABASE_URL).
لا يعتمد على ConnectorBase أو FTTH_CONNECTOR_DATABASE_URL.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from sqlalchemy.orm import Session

from app.core.iraq_phone import normalize_iraq_mobile
from app.models import models

logger = logging.getLogger(__name__)


def _date_to_dt_utc(d: date | None) -> datetime | None:
    if d is None:
        return None
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def _resolve_subscriber_id(db: Session, ext: models.FtthExternalData) -> int | None:
    if ext.imported_subscriber_id is not None:
        sid = int(ext.imported_subscriber_id)
        exists = db.query(models.Subscriber.id).filter(models.Subscriber.id == sid).first()
        if exists:
            return sid
    phone = (ext.phone or "").strip()
    if not phone:
        return None
    norm = normalize_iraq_mobile(phone, required=False)
    if not norm:
        return None
    row = db.query(models.Subscriber).filter(models.Subscriber.phone == norm).first()
    return int(row.id) if row else None


def _commitment_period_text(ext: models.FtthExternalData) -> str | None:
    if ext.commitment_period is not None:
        return str(ext.commitment_period)
    if ext.commitment_label:
        return str(ext.commitment_label)[:255]
    return None


def _apply_ext_to_customer(
    row: models.FtthCustomer,
    ext: models.FtthExternalData,
    now: datetime,
    subscriber_id: int | None,
) -> None:
    row.subscriber_id = subscriber_id
    row.source_system = "ftth_portal"
    row.raw_payload = ext.raw_payload if ext.raw_payload is not None else {}
    row.last_synced_at = now
    row.import_status = "linked" if subscriber_id else "pending"
    row.sync_error = None
    row.sync_status = "synced"

    if ext.national_name is not None:
        row.full_name = ext.national_name
    if ext.customer_type is not None:
        row.customer_type = ext.customer_type
    if ext.phone is not None:
        row.phone = ext.phone
    if ext.secondary_phone is not None:
        row.secondary_phone = ext.secondary_phone
    if ext.email is not None:
        row.email = ext.email
    if ext.address is not None:
        row.address = ext.address
    if ext.governorate is not None:
        row.governorate = ext.governorate
    if ext.district is not None:
        row.district = ext.district
    if ext.sub_district is not None:
        row.sub_district = ext.sub_district
    if ext.gps_latitude is not None:
        row.gps_latitude = ext.gps_latitude
    if ext.gps_longitude is not None:
        row.gps_longitude = ext.gps_longitude
    if ext.status is not None:
        row.subscription_status = ext.status
    if ext.start_date is not None:
        row.subscription_start_date = _date_to_dt_utc(ext.start_date)
    if ext.end_date is not None:
        row.subscription_end_date = _date_to_dt_utc(ext.end_date)
    if ext.zone is not None:
        row.zone = ext.zone
    if ext.bundle is not None:
        row.bundle = ext.bundle
    _cp = _commitment_period_text(ext)
    if _cp is not None:
        row.commitment_period = _cp
    if ext.service_username is not None:
        row.onu_username = ext.service_username
    if ext.onu_serial is not None:
        row.onu_serial = ext.onu_serial
    if ext.fdt is not None:
        row.fdt = ext.fdt
    if ext.fat is not None:
        row.fat = ext.fat
    if ext.ip_address is not None:
        row.ip_address = ext.ip_address
    if ext.mac_address is not None:
        row.mac_address = ext.mac_address
    if ext.has_active_session is not None:
        row.has_active_session = ext.has_active_session
    if ext.active_session_started_at is not None:
        row.active_session_started_at = ext.active_session_started_at
    if ext.raw_customer_json is not None:
        row.raw_customer_json = ext.raw_customer_json
    if ext.raw_detail_json is not None:
        row.raw_detail_json = ext.raw_detail_json
    if ext.raw_subscription_json is not None:
        row.raw_subscription_json = ext.raw_subscription_json


def upsert_ftth_customers_from_external_batch(
    db: Session,
    external_ids: list[str],
    now: datetime,
    *,
    sync_run_id: int | None = None,
) -> tuple[int, int]:
    """Upsert من صفوف ftth_external_data إلى ftth_customers. يعيد (نجح، فشل)."""
    sync_run: models.FtthSyncRun | None = None
    if sync_run_id is not None:
        sync_run = db.get(models.FtthSyncRun, sync_run_id)

    ids = [str(x).strip() for x in external_ids if x and str(x).strip()]
    if not ids:
        return 0, 0
    existing_ext = {
        r.external_id: r
        for r in db.query(models.FtthExternalData)
        .filter(models.FtthExternalData.external_id.in_(ids))
        .all()
    }
    ok = 0
    failed = 0
    for eid in ids:
        ext = existing_ext.get(eid)
        if not ext:
            failed += 1
            if sync_run is not None:
                db.add(
                    models.FtthSyncRunItem(
                        sync_run_id=sync_run.id,
                        external_customer_id=eid,
                        ftth_external_data_id=None,
                        status="failed",
                        error_message="لم يُعثر على صف ftth_external_data بعد الحفظ",
                    )
                )
            continue
        try:
            sub_id = _resolve_subscriber_id(db, ext)
            cust = (
                db.query(models.FtthCustomer)
                .filter(models.FtthCustomer.external_customer_id == eid)
                .first()
            )
            if cust is None:
                cust = models.FtthCustomer(external_customer_id=eid)
                db.add(cust)
            _apply_ext_to_customer(cust, ext, now, sub_id)
            db.flush()
            ok += 1
            if sync_run is not None:
                db.add(
                    models.FtthSyncRunItem(
                        sync_run_id=sync_run.id,
                        external_customer_id=eid,
                        ftth_external_data_id=ext.id,
                        status="success",
                        error_message=None,
                    )
                )
        except Exception as exc:
            failed += 1
            logger.exception("FTTH ftth_customers upsert failed for %s: %s", eid, exc)
            if sync_run is not None:
                db.add(
                    models.FtthSyncRunItem(
                        sync_run_id=sync_run.id,
                        external_customer_id=eid,
                        ftth_external_data_id=getattr(ext, "id", None),
                        status="failed",
                        error_message=str(exc)[:2000],
                    )
                )
    if sync_run is not None:
        sync_run.total_ftth_customers_upserted = int(sync_run.total_ftth_customers_upserted or 0) + ok
        sync_run.total_ftth_customers_failed = int(sync_run.total_ftth_customers_failed or 0) + failed
    return ok, failed
