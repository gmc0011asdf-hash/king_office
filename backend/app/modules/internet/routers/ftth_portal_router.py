"""
بوابة FTTH الخارجية — إعداد، مزامنة، وترحيل اختياري إلى subscribers.
كل المسارات تتطلب صلاحية مدير.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from app.core import database
from app.core.config import settings
from app.core.database import ftth_sync_connection_log_info
from app.core.ftth_db_debug import debug_db_target
from app.core.dependencies import get_current_user, require_ftth_portal_access, _parse_user_permissions_json
from app.core.ftth_crypto import decrypt_str
from app.core.iraq_phone import normalize_iraq_mobile
from app.integrations.ftth.engine import (
    _apply_ftth_iq_subscription_dates_only,
    _merge_options,
    _norm_to_ftth_row_dict,
    _parse_date,
    _parse_datetime_tz,
    _parse_int,
    _upsert_ftth_norm_batch_chunk_execute,
    ensure_ftth_tables,
    save_portal_config,
    sync_ftth_subscribers,
    verify_ftth_connection,
)
from app.integrations.ftth.ftth_iq_api import ftth_iq_get_token
from app.integrations.ftth.ftth_unified_sync import (
    fetch_unified_customer_bundle,
    sync_single_ftth_subscriber,
    unified_record_to_ftth_norm,
)
from app.integrations.ftth.ftth_dates import effective_commitment_days
from app.models import models
from app.modules.internet.routers.subscribers_router import (
    build_user_code,
    ensure_unique_user_code,
    subscriber_name_for_user_code,
    _status_from_expiration,
)
from app.schemas import schemas
from app.schemas.ftth import (
    FtthExternalRowOut,
    FtthImportAllPendingBody,
    FtthImportAllPendingResult,
    FtthImportToSubscriberBody,
    FtthImportedSubscriberLinkOut,
    FtthPortalCustomerRowOut,
    FtthPortalLogoutBody,
    FtthPortalSetup,
    FtthPortalStatusOut,
    FtthSyncResult,
)

router = APIRouter(tags=["FTTH Portal"])

# عند وجود FAT من FTTH دون اسم منطقة: نربطها بمنطقة افتراضية حتى تُسجَّل في internet_zones / internet_fats
_FTTH_FALLBACK_ZONE_FOR_SYNC = "عام — FTTH"


def _ftth_clean_label(s: str | None, max_len: int = 100) -> str | None:
    t = (s or "").strip()
    return t[:max_len] if t else None


def ftth_get_or_create_zone(db: Session, raw: str | None) -> tuple[str | None, int | None]:
    """إدراج منطقة في internet_zones دون تكرار (مطابقة غير حساسة لحالة الأحرف)."""
    name = _ftth_clean_label(raw)
    if not name:
        return None, None
    z = db.query(models.InternetZone).filter(models.InternetZone.name == name).first()
    if z:
        return z.name, z.id
    z = (
        db.query(models.InternetZone)
        .filter(func.lower(models.InternetZone.name) == name.lower())
        .first()
    )
    if z:
        return z.name, z.id
    nz = models.InternetZone(name=name)
    db.add(nz)
    db.flush()
    return nz.name, nz.id


def ftth_get_or_create_fat(db: Session, zone_id: int, raw: str | None) -> str | None:
    """FAT تابعة للمنطقة في internet_fats دون تكرار لكل (zone_id, اسم)."""
    name = _ftth_clean_label(raw)
    if not name:
        return None
    f = (
        db.query(models.InternetFat)
        .filter(models.InternetFat.zone_id == zone_id, models.InternetFat.name == name)
        .first()
    )
    if f:
        return f.name
    f = (
        db.query(models.InternetFat)
        .filter(
            models.InternetFat.zone_id == zone_id,
            func.lower(models.InternetFat.name) == name.lower(),
        )
        .first()
    )
    if f:
        return f.name
    nf = models.InternetFat(zone_id=zone_id, name=name)
    db.add(nf)
    db.flush()
    return nf.name


def ftth_sync_zone_fat_on_import(
    db: Session,
    *,
    target: models.Subscriber | None,
    merged_zone: str | None,
    merged_fat: str | None,
) -> tuple[str | None, str | None]:
    """
    يُحدّث جداول المناطق و FAT ويُرجع القيم الموحّدة لوضعها على المشترك.
    merged_zone / merged_fat == None يعني «لا تغيّر هذا الحقل» عند التحديث.
    """
    if target is None:
        zt = _ftth_clean_label(merged_zone)
        ft = _ftth_clean_label(merged_fat)
        if not zt and not ft:
            return merged_zone, merged_fat
        if not zt and ft:
            zn, zid = ftth_get_or_create_zone(db, _FTTH_FALLBACK_ZONE_FOR_SYNC)
            if zid:
                return zn, ftth_get_or_create_fat(db, zid, ft)
            return merged_zone, merged_fat
        zn, zid = ftth_get_or_create_zone(db, zt) if zt else (None, None)
        if zid and ft:
            return zn, ftth_get_or_create_fat(db, zid, ft)
        if zid:
            return zn, merged_fat
        return merged_zone, merged_fat

    new_z = merged_zone
    new_f = merged_fat
    if new_z is None and new_f is None:
        return None, None

    cur_z = _ftth_clean_label(target.zone)
    cur_f = _ftth_clean_label(target.fat)
    eff_z = _ftth_clean_label(new_z) if new_z is not None else cur_z
    eff_f = _ftth_clean_label(new_f) if new_f is not None else cur_f
    used_fallback_zone = False
    if eff_f and not eff_z:
        eff_z = _FTTH_FALLBACK_ZONE_FOR_SYNC
        used_fallback_zone = True

    zn, zid = ftth_get_or_create_zone(db, eff_z) if eff_z else (None, None)
    ff: str | None = None
    if zid and eff_f:
        ff = ftth_get_or_create_fat(db, zid, eff_f)
    elif new_f is not None:
        ff = eff_f

    out_z: str | None = None
    out_f: str | None = None
    if new_z is not None:
        out_z = zn
    elif used_fallback_zone and new_f is not None:
        out_z = zn
    if new_f is not None:
        out_f = ff
    if new_z is not None and new_f is None and eff_f and zid:
        ftth_get_or_create_fat(db, zid, eff_f)
    return out_z, out_f


def _ftth_date_anchor_subscription_first(date_anchor: str | None) -> bool:
    da = (date_anchor or "expiration").strip().lower()
    return da in ("start", "subscription", "begin", "بداية")


def _ftth_resolve_subscription_dates(
    row: models.FtthExternalData,
    *,
    date_anchor: str | None = "expiration",
) -> tuple[date | None, date | None]:
    """
    قاعدة المدة: شهر/مدة الالتزام من السجل الوسيط (أو 30 يوماً افتراضياً).
    - date_anchor=expiration (الافتراضي): إن وُجد end_date يُعتمد؛ وإلا start_date.
    - date_anchor=start: إن وُجد start_date يُعتمد؛ وإلا end_date.
    """
    span = timedelta(days=effective_commitment_days(row.commitment_days))
    sub_first = _ftth_date_anchor_subscription_first(date_anchor)

    if sub_first:
        if row.start_date is not None:
            s = row.start_date
            return s, s + span
        if row.end_date is not None:
            e = row.end_date
            return e - span, e
        return None, None

    if row.end_date is not None:
        e = row.end_date
        return e - span, e
    if row.start_date is not None:
        s = row.start_date
        return s, s + span
    return None, None


def _ftth_effective_import_span_days(
    row: models.FtthExternalData,
    subscription_span_days: int | None,
) -> int:
    if subscription_span_days is not None and subscription_span_days >= 1:
        return int(subscription_span_days)
    return effective_commitment_days(row.commitment_days)


def _ftth_resolve_import_subscription_dates(
    row: models.FtthExternalData,
    *,
    date_anchor: str | None,
    subscription_date_override: date | None,
    expiration_date_override: date | None,
    subscription_span_days: int | None = None,
) -> tuple[date | None, date | None]:
    """
    تواريخ الترحيل النهائية: يدوي (أحدهما أو كلاهما) أو حساب من المزامنة.
    - كلاهما يدوياً: يُستخدمان كما هما.
    - اشتراك فقط: انتهاء = اشتراك + N يوماً (N من الطلب أو commitment_days أو 30).
    - انتهاء فقط: اشتراك = انتهاء − N يوماً.
    - لا شيء: من _ftth_resolve_subscription_dates حسب المرجع.
    """
    o_sub = subscription_date_override
    o_exp = expiration_date_override
    span = timedelta(days=_ftth_effective_import_span_days(row, subscription_span_days))
    if o_sub is not None and o_exp is not None:
        return o_sub, o_exp
    if o_sub is not None:
        return o_sub, o_sub + span
    if o_exp is not None:
        return o_exp - span, o_exp
    return _ftth_resolve_subscription_dates(row, date_anchor=date_anchor)


def _ftth_external_row_out(
    row: models.FtthExternalData,
    *,
    data_source: str | None = "database",
) -> FtthExternalRowOut:
    """معاينة التواريخ وحقول مرادفة واضحة للواجهة (مصدر الحقيقة: الخادم)."""
    rs, re_ = _ftth_resolve_subscription_dates(row, date_anchor="expiration")
    base = FtthExternalRowOut.model_validate(row)
    ds: Literal["database", "live"] | None
    if data_source == "live":
        ds = "live"
    elif data_source == "database":
        ds = "database"
    else:
        ds = None
    return base.model_copy(
        update={
            "resolved_subscription_date": rs,
            "resolved_expiration_date": re_,
            "calculated_subscription_date": row.start_date,
            "last_synced_at": row.synced_at,
            "external_customer_id": row.external_id,
            "full_name": row.national_name,
            "subscription_start_date": row.start_date,
            "subscription_end_date": row.end_date,
            "data_source": ds,
        }
    )


def _user_has_ftth_portal_access(user: models.User) -> bool:
    if user.role == "admin":
        return True
    perms = _parse_user_permissions_json(user)
    inet = perms.get("internet")
    return isinstance(inet, dict) and bool(inet.get("ftthPortal"))


def _ftth_model_from_staging_dict(rd: dict[str, Any]) -> models.FtthExternalData:
    row = models.FtthExternalData()
    row.id = 0
    for k, v in rd.items():
        if k == "id":
            continue
        if hasattr(row, k):
            setattr(row, k, v)
    return row


def _status_from_cfg(
    cfg: models.FtthPortalConfig | None,
    setup_message: str | None = None,
) -> FtthPortalStatusOut:
    if not cfg:
        return FtthPortalStatusOut(configured=False, setup_message=setup_message)
    return FtthPortalStatusOut(
        configured=True,
        login_url=cfg.login_url,
        list_url=cfg.list_url,
        parse_mode=cfg.parse_mode,
        last_sync_at=cfg.last_sync_at,
        last_sync_new=int(cfg.last_sync_new or 0),
        last_sync_updated=int(cfg.last_sync_updated or 0),
        last_sync_error=cfg.last_sync_error,
        setup_message=setup_message,
    )


@router.get("/api/ftth/portal/status", response_model=FtthPortalStatusOut)
def ftth_portal_status(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_ftth_portal_access),
):
    cfg = db.query(models.FtthPortalConfig).order_by(models.FtthPortalConfig.id.asc()).first()
    return _status_from_cfg(cfg)


@router.post("/api/ftth/portal/setup", response_model=FtthPortalStatusOut)
def ftth_portal_setup(
    body: FtthPortalSetup,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_ftth_portal_access),
):
    from app.core.database import engine

    ensure_ftth_tables(engine)
    po = body.parse_options if isinstance(body.parse_options, dict) else None
    mode = (body.parse_mode or "json_generic").lower()
    login_url = (body.login_url or "").strip()
    if mode == "ftth_iq_admin" and not login_url:
        login_url = "https://admin.ftth.iq/auth/login"
    verify_msg: str | None = None
    try:
        v = verify_ftth_connection(
            login_url,
            body.username,
            body.password,
            (body.list_url or "").strip() or None,
            mode,
            po,
        )
        if isinstance(v, dict) and v.get("message"):
            verify_msg = str(v["message"])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    save_portal_config(
        db,
        login_url=login_url,
        username=body.username,
        password=body.password,
        list_url=body.list_url,
        parse_mode=body.parse_mode or "json_generic",
        parse_options=po or {},
    )
    db.commit()
    cfg = db.query(models.FtthPortalConfig).order_by(models.FtthPortalConfig.id.asc()).first()
    return _status_from_cfg(cfg, setup_message=verify_msg)


@router.post("/api/ftth/portal/logout", response_model=FtthPortalStatusOut)
def ftth_portal_logout(
    body: FtthPortalLogoutBody | None = None,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_ftth_portal_access),
):
    """
    إزالة إعدادات البوابة من القاعدة (بيانات الدخول المشفّرة).
    عند الحاجة لربط موقع FTTH آخر، يُعاد عرض نموذج الإعداد.
    """
    clear_staged = True if body is None else bool(body.clear_staged_data)
    for cfg in db.query(models.FtthPortalConfig).all():
        db.delete(cfg)
    if clear_staged:
        db.query(models.FtthExternalData).delete(synchronize_session=False)
    db.commit()
    return FtthPortalStatusOut(configured=False)


@router.post("/api/ftth/portal/sync", response_model=FtthSyncResult)
def ftth_portal_sync(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_ftth_portal_access),
):
    from app.core.database import engine

    ensure_ftth_tables(engine)
    ft_info = ftth_sync_connection_log_info()
    masked_db_url = ft_info.get("masked_connection_url", "")
    db_name = ft_info.get("db_name", "")

    logger.info("FTTH SYNC START")
    logger.info(
        "FTTH_SYNC_TRACE POST /api/ftth/portal/sync handler entered (sync_ftth_subscribers next)"
    )
    logger.info("FTTH SYNC DB TARGET CHECK (request)")
    logger.info("- current database url (masked): %s", masked_db_url)
    logger.info("- db_name: %s", db_name)
    logger.info("- target table = public.ftth_external_data")

    cfg = db.query(models.FtthPortalConfig).order_by(models.FtthPortalConfig.id.asc()).first()
    if not cfg:
        raise HTTPException(status_code=400, detail="لم يُضبط بوابة FTTH بعد")
    try:
        debug_db_target(db, settings.DATABASE_URL)
        merged_opts = _merge_options(cfg.parse_options if isinstance(cfg.parse_options, dict) else {})
        commit_every_pages = max(1, int(merged_opts.get("commit_every_pages") or 1))
        logger.info(
            "FTTH_SYNC_TRACE router: commit_every_pages=%s (parse_options) — "
            "per-page commits use session_commit from router; engine does not call db.commit internally",
            commit_every_pages,
        )

        def _session_commit() -> None:
            db.commit()
            db.expunge_all()

        stats = sync_ftth_subscribers(db, session_commit=_session_commit)
        logger.info(
            "FTTH_SYNC_TRACE sync_ftth_subscribers returned: new_count=%s updated_count=%s "
            "pages_fetched=%s fetched_customers=%s built_records=%s attempted_saves=%s "
            "successful_saves=%s failed_saves=%s",
            stats.get("new_count"),
            stats.get("updated_count"),
            stats.get("pages_fetched"),
            stats.get("fetched_customers_count"),
            stats.get("built_records_count"),
            stats.get("attempted_db_saves_count"),
            stats.get("successful_db_saves_count"),
            stats.get("failed_db_saves_count"),
        )
        # commit واحد هنا فقط لحفظ حقول cfg (last_sync_*) بعد أن تُحدَّث في المحرك؛ بيانات الصفحات تُلتزم عبر _session_commit أعلاه
        logger.info("FTTH_SYNC_TRACE router: db.commit() for FtthPortalConfig sync metadata (post-sync)")
        db.commit()
        logger.info("FTTH_SYNC_TRACE router: db.commit() finished OK")
        logger.info("FTTH SYNC SUCCESS")
        return FtthSyncResult(
            new_count=int(stats.get("new_count", 0)),
            updated_count=int(stats.get("updated_count", 0)),
            pages_fetched=int(stats.get("pages_fetched", 0)),
            message=str(stats.get("message", "")),
            fetched_customers_count=stats.get("fetched_customers_count"),
            built_records_count=stats.get("built_records_count"),
            attempted_db_saves_count=stats.get("attempted_db_saves_count"),
            successful_db_saves_count=stats.get("successful_db_saves_count"),
            failed_db_saves_count=stats.get("failed_db_saves_count"),
        )
    except Exception as e:
        logger.exception("FTTH SYNC FAILED WITH EXCEPTION")
        db.rollback()
        cfg = db.query(models.FtthPortalConfig).order_by(models.FtthPortalConfig.id.asc()).first()
        if cfg:
            cfg.last_sync_error = str(e)[:2000]
            cfg.last_sync_at = datetime.now(timezone.utc)
            db.commit()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/api/ftth/portal/sync/{subscriber_id}")
def ftth_sync_single_subscriber(
    subscriber_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    مزامنة مشترك واحد من بوابة FTTH بمعرّفه المحلي (subscriber_id).
    يجلب تفاصيل + اشتراك هذا العميل فقط، يُحدّث ftth_external_data و ftth_customers،
    ويُسجّل العملية في audit_logs.
    """
    # 1. التحقق من المشترك وربطه بمعرّف FTTH الخارجي
    subscriber = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
    if not subscriber:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")

    ext_row = (
        db.query(models.FtthExternalData)
        .filter(models.FtthExternalData.imported_subscriber_id == subscriber_id)
        .order_by(models.FtthExternalData.id.desc())
        .first()
    )
    if not ext_row or not str(ext_row.external_id or "").strip():
        raise HTTPException(
            status_code=404,
            detail="لا يوجد معرّف FTTH مرتبط بهذا المشترك — يجب استيراده من بوابة FTTH أولاً",
        )
    external_id = str(ext_row.external_id).strip()

    # 2. تحميل إعدادات البوابة وفك تشفير بيانات الدخول
    cfg = db.query(models.FtthPortalConfig).order_by(models.FtthPortalConfig.id.asc()).first()
    if not cfg:
        raise HTTPException(status_code=400, detail="لم تُضبط بوابة FTTH بعد")

    try:
        username = decrypt_str(cfg.username_enc)
        password = decrypt_str(cfg.password_enc)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"فشل فك تشفير بيانات الدخول — تحقق من SECRET_KEY أو أعد إدخال بيانات البوابة: {e}",
        ) from e

    opts = _merge_options(cfg.parse_options if isinstance(cfg.parse_options, dict) else {})

    # 3. الحصول على access token
    try:
        token_data = ftth_iq_get_token(username, password, opts)
        access_token = token_data.get("access_token") or token_data.get("token") or ""
        if not access_token:
            raise RuntimeError(f"استجابة التوكن لا تحتوي على access_token: {list(token_data.keys())}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل تسجيل الدخول إلى بوابة FTTH: {e}") from e

    # 4. مزامنة العميل الواحد
    try:
        norm = sync_single_ftth_subscriber(access_token, external_id, opts)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ غير متوقع أثناء المزامنة: {e}") from e

    # 5. upsert في ftth_external_data ثم commit
    try:
        now = datetime.now(timezone.utc)
        norm["imported_subscriber_id"] = subscriber_id
        _upsert_ftth_norm_batch_chunk_execute(db, [norm], now)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"فشل حفظ بيانات المزامنة: {e}") from e

    # 6. تحديث ftth_customers إن وُجد سجل مرتبط
    ftth_customer = (
        db.query(models.FtthCustomer)
        .filter(models.FtthCustomer.external_customer_id == external_id)
        .first()
    )
    updated_fields: dict[str, str] = {}
    if ftth_customer:
        field_map = {
            "subscription_status": ("status", norm.get("status")),
            "subscription_start_date": ("start_date", norm.get("start_date")),
            "subscription_end_date": ("end_date", norm.get("end_date")),
            "phone": ("phone", norm.get("phone")),
            "zone": ("zone", norm.get("zone")),
            "fat": ("fat", norm.get("fat")),
            "bundle": ("bundle", norm.get("bundle")),
            "onu_username": ("service_username", norm.get("service_username")),
        }
        for customer_field, (norm_key, new_val) in field_map.items():
            old_val = getattr(ftth_customer, customer_field, None)
            if new_val is not None and str(new_val) != str(old_val or ""):
                setattr(ftth_customer, customer_field, new_val)
                updated_fields[customer_field] = str(new_val)
        ftth_customer.last_synced_at = datetime.now(timezone.utc)
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning("ftth_customers update failed (non-fatal): %s", e)

    # 7. إسقاط التحديثات على جدول subscribers المحلي
    subscriber_updated_fields: dict[str, str] = {}
    try:
        today = date.today()

        # expiration_date ← norm["end_date"]
        raw_end = norm.get("end_date")
        new_expiry: date | None = None
        if raw_end is not None:
            try:
                new_expiry = _parse_date(str(raw_end)) if not isinstance(raw_end, date) else raw_end
            except Exception:
                new_expiry = None
        if new_expiry is not None and new_expiry != subscriber.expiration_date:
            subscriber.expiration_date = new_expiry
            subscriber_updated_fields["expiration_date"] = str(new_expiry)

        # status ← derive from expiration_date when available, else map FTTH status string
        if new_expiry is not None:
            derived_status = _status_from_expiration(new_expiry, today)
        else:
            ftth_status = str(norm.get("status") or "").strip().lower()
            derived_status = "نشط" if ftth_status in ("active", "نشط") else ("منتهي" if ftth_status in ("expired", "inactive", "منتهي") else None)
        if derived_status and derived_status != subscriber.status:
            subscriber.status = derived_status
            subscriber_updated_fields["status"] = derived_status

        # fat ← norm["fat"]
        new_fat = norm.get("fat")
        if new_fat and str(new_fat).strip() and str(new_fat).strip() != str(subscriber.fat or ""):
            subscriber.fat = str(new_fat).strip()[:100]
            subscriber_updated_fields["fat"] = subscriber.fat

        # zone ← norm["zone"]
        new_zone = norm.get("zone")
        if new_zone and str(new_zone).strip() and str(new_zone).strip() != str(subscriber.zone or ""):
            subscriber.zone = str(new_zone).strip()[:100]
            subscriber_updated_fields["zone"] = subscriber.zone

        # category ← norm["bundle"] (profile/plan name on subscribers table)
        new_bundle = norm.get("bundle")
        if new_bundle and str(new_bundle).strip() and str(new_bundle).strip() != str(subscriber.category or ""):
            subscriber.category = str(new_bundle).strip()[:100]
            subscriber_updated_fields["category"] = subscriber.category

        if subscriber_updated_fields:
            db.commit()
            updated_fields.update(subscriber_updated_fields)
    except Exception as e:
        db.rollback()
        logger.warning("subscribers projection failed (non-fatal): %s", e)

    # 8. تسجيل في audit_logs
    try:
        changed_summary = (
            ", ".join(f"{k}={v}" for k, v in updated_fields.items())
            if updated_fields
            else "لا تغييرات"
        )
        audit = models.AuditLog(
            user_id=current_user.id,
            user_email=current_user.email,
            user_name=current_user.name,
            http_method="POST",
            path=f"/api/ftth/portal/sync/{subscriber_id}",
            payload_summary=f"external_id={external_id} | {changed_summary}"[:2000],
            status_code=200,
        )
        db.add(audit)
        db.commit()
    except Exception:
        db.rollback()

    return {
        "ok": True,
        "subscriber_id": subscriber_id,
        "external_id": external_id,
        "status": norm.get("status"),
        "expiration_date": str(subscriber.expiration_date) if subscriber.expiration_date else None,
        "updated_fields": updated_fields,
        "message": f"تمت المزامنة — {len(updated_fields)} حقل محدَّث" if updated_fields else "تمت المزامنة — البيانات محدَّثة مسبقاً",
    }


@router.get("/api/ftth/portal/external-stats")
def ftth_external_stats(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_ftth_portal_access),
):
    total = db.query(func.count(models.FtthExternalData.id)).scalar() or 0
    imported = (
        db.query(func.count(models.FtthExternalData.id))
        .filter(models.FtthExternalData.imported_subscriber_id.isnot(None))
        .scalar()
        or 0
    )
    return {"total": int(total), "imported": int(imported), "pending": int(total - imported)}


@router.get(
    "/api/ftth/portal/imported-subscriber-link/{subscriber_id}",
    response_model=FtthImportedSubscriberLinkOut,
)
def ftth_imported_subscriber_link(
    subscriber_id: int,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(get_current_user),
):
    """معرّف FTTH (external_id) لصفحة التفاصيل إن وُجد صف وسيط يشير إلى هذا المشترك.

    يتطلب تسجيل دخول فقط (مثل صفحة المشتركين) — لا يشترط صلاحية «بوابة FTTH»
    حتى لا تُعرض رسالة خطأ خاطئة لمن يستعرض تفاصيل المشترك بلا صلاحية إدارة البوابة.
    """
    row = (
        db.query(models.FtthExternalData)
        .filter(models.FtthExternalData.imported_subscriber_id == subscriber_id)
        .order_by(models.FtthExternalData.id.desc())
        .first()
    )
    if not row or not str(row.external_id or "").strip():
        return FtthImportedSubscriberLinkOut(linked=False, external_id=None, detail_url=None)
    eid = str(row.external_id).strip()
    return FtthImportedSubscriberLinkOut(
        linked=True,
        external_id=eid,
        detail_url=f"https://admin.ftth.iq/customer-details/{eid}/details/view",
    )


def _ftth_portal_customer_row_out(
    c: models.FtthCustomer,
    *,
    staging_row_id: int | None,
) -> FtthPortalCustomerRowOut:
    return FtthPortalCustomerRowOut(
        id=int(c.id),
        external_customer_id=str(c.external_customer_id or "").strip(),
        full_name=c.full_name,
        phone=c.phone,
        address=c.address,
        zone=c.zone,
        fat=c.fat,
        fdt=c.fdt,
        bundle=c.bundle,
        subscription_status=c.subscription_status,
        subscription_start_date=c.subscription_start_date,
        subscription_end_date=c.subscription_end_date,
        onu_username=c.onu_username,
        onu_serial=c.onu_serial,
        import_status=c.import_status,
        last_synced_at=c.last_synced_at,
        subscriber_id=int(c.subscriber_id) if c.subscriber_id is not None else None,
        staging_row_id=staging_row_id,
        raw_payload=c.raw_payload if isinstance(c.raw_payload, dict) else None,
    )


@router.get("/api/ftth/portal/customers", response_model=list[FtthPortalCustomerRowOut])
def ftth_list_portal_customers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    search: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    not_imported_only: bool = Query(False, alias="notImportedOnly"),
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_ftth_portal_access),
):
    """قائمة من جدول ftth_customers (العرض المحلي المنظّف بعد المزامنة)."""
    # page/page_size take precedence over skip/limit when page > 1 or page_size differs from default
    effective_limit = page_size if (page > 1 or page_size != 100) else limit
    effective_skip = (page - 1) * effective_limit if (page > 1 or page_size != 100) else skip
    q = (
        db.query(models.FtthCustomer, models.FtthExternalData.id)
        .outerjoin(
            models.FtthExternalData,
            models.FtthExternalData.external_id == models.FtthCustomer.external_customer_id,
        )
        .order_by(desc(models.FtthCustomer.last_synced_at), desc(models.FtthCustomer.id))
    )
    if not_imported_only:
        q = q.filter(models.FtthCustomer.subscriber_id.is_(None))
    if status_filter and status_filter.strip():
        q = q.filter(models.FtthCustomer.subscription_status.ilike(f"%{status_filter.strip()}%"))
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                models.FtthCustomer.external_customer_id.ilike(term),
                models.FtthCustomer.full_name.ilike(term),
                models.FtthCustomer.phone.ilike(term),
                models.FtthCustomer.zone.ilike(term),
                models.FtthCustomer.fat.ilike(term),
                models.FtthCustomer.fdt.ilike(term),
                models.FtthCustomer.bundle.ilike(term),
                models.FtthCustomer.onu_username.ilike(term),
                models.FtthCustomer.onu_serial.ilike(term),
                models.FtthCustomer.address.ilike(term),
            )
        )
    rows = q.offset(effective_skip).limit(effective_limit).all()
    return [_ftth_portal_customer_row_out(c, staging_row_id=staging_id) for c, staging_id in rows]


@router.get(
    "/api/ftth/portal/customers/{external_customer_id}",
    response_model=FtthPortalCustomerRowOut,
)
def ftth_portal_customer_detail(
    external_customer_id: str,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_ftth_portal_access),
):
    """تفاصيل سجل واحد من ftth_customers (بديل/مكمّل لمسار external-customer الذي يعتمد الوسيط أو الجلب المباشر)."""
    eid = str(external_customer_id or "").strip()
    if not eid:
        raise HTTPException(status_code=400, detail="معرّف خارجي غير صالح")
    c = (
        db.query(models.FtthCustomer)
        .filter(models.FtthCustomer.external_customer_id == eid)
        .order_by(desc(models.FtthCustomer.id))
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="لا يوجد سجل في العرض المحلي (ftth_customers) لهذا المعرف")
    staging = (
        db.query(models.FtthExternalData)
        .filter(models.FtthExternalData.external_id == eid)
        .order_by(models.FtthExternalData.id.desc())
        .first()
    )
    staging_id = int(staging.id) if staging else None
    return _ftth_portal_customer_row_out(c, staging_row_id=staging_id)


@router.get("/api/ftth/portal/external-data", response_model=list[FtthExternalRowOut])
def ftth_list_external(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    not_imported_only: bool = Query(False, alias="notImportedOnly"),
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_ftth_portal_access),
):
    q = db.query(models.FtthExternalData).order_by(
        models.FtthExternalData.synced_at.desc(),
        models.FtthExternalData.id.desc(),
    )
    if not_imported_only:
        q = q.filter(models.FtthExternalData.imported_subscriber_id.is_(None))
    if status_filter and status_filter.strip():
        q = q.filter(models.FtthExternalData.status.ilike(f"%{status_filter.strip()}%"))
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                models.FtthExternalData.national_name.ilike(term),
                models.FtthExternalData.phone.ilike(term),
                models.FtthExternalData.secondary_phone.ilike(term),
                models.FtthExternalData.external_id.ilike(term),
                models.FtthExternalData.zone.ilike(term),
                models.FtthExternalData.fat.ilike(term),
                models.FtthExternalData.fdt.ilike(term),
                models.FtthExternalData.location.ilike(term),
                models.FtthExternalData.address.ilike(term),
                models.FtthExternalData.governorate.ilike(term),
                models.FtthExternalData.district.ilike(term),
                models.FtthExternalData.neighborhood.ilike(term),
                models.FtthExternalData.service_username.ilike(term),
                models.FtthExternalData.onu_serial.ilike(term),
                models.FtthExternalData.ip_address.ilike(term),
                models.FtthExternalData.mac_address.ilike(term),
            )
        )
    rows = q.offset(skip).limit(limit).all()
    if rows:
        r0 = rows[0]
        logger.info(
            "FTTH EXTERNAL-DATA FIRST ROW FROM DB:\n%s",
            json.dumps(
                {
                    "external_id": r0.external_id,
                    "national_name": r0.national_name,
                    "phone": r0.phone,
                    "zone": r0.zone,
                    "fat": r0.fat,
                    "service_username": r0.service_username,
                    "location": r0.location,
                    "start_date": r0.start_date.isoformat() if r0.start_date else None,
                    "end_date": r0.end_date.isoformat() if r0.end_date else None,
                    "remaining_days": r0.remaining_days,
                    "status": r0.status,
                },
                ensure_ascii=False,
                default=str,
            ),
        )
    return [_ftth_external_row_out(r) for r in rows]


@router.get(
    "/api/ftth/portal/external-customer/{external_id}",
    response_model=FtthExternalRowOut,
)
def ftth_external_customer_by_external_id(
    external_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    تفاصيل عميل FTTH حسب المعرف الخارجي.
    - إن وُجد صف في ftth_external_data يُعاد من القاعدة (أي مستخدم مسجّل).
    - وإلا: جلب مباشر من بوابة admin.ftth.iq عند وضع ftth_iq_admin وبصلاحية «بوابة FTTH» أو مدير.
    """
    eid = str(external_id or "").strip()
    if not eid or not eid.isdigit() or len(eid) > 32:
        raise HTTPException(
            status_code=400,
            detail="معرّف FTTH غير صالح (يجب أن يكون رقماً)",
        )
    row = (
        db.query(models.FtthExternalData)
        .filter(models.FtthExternalData.external_id == eid)
        .order_by(models.FtthExternalData.id.desc())
        .first()
    )
    if row:
        return _ftth_external_row_out(row, data_source="database")

    cfg = db.query(models.FtthPortalConfig).order_by(models.FtthPortalConfig.id.asc()).first()
    if not cfg:
        raise HTTPException(
            status_code=404,
            detail="لا يوجد سجل وسيط لهذا المعرف، ولم تُضبط بوابة FTTH بعد.",
        )
    parse_mode = (cfg.parse_mode or "json_generic").lower()
    if parse_mode != "ftth_iq_admin":
        raise HTTPException(
            status_code=404,
            detail="لا يوجد سجل وسيط لهذا المعرف، والجلب المباشر متاح فقط في وضع ftth_iq_admin. يمكنك المزامنة من تبويب بوابة FTTH.",
        )
    if not _user_has_ftth_portal_access(current_user):
        raise HTTPException(
            status_code=403,
            detail="لا يوجد سجل محلي لهذا المعرف؛ يتطلب جلب البيانات مباشرة من FTTH صلاحية «بوابة FTTH» أو مدير.",
        )
    try:
        username = decrypt_str(cfg.username_enc)
        password = decrypt_str(cfg.password_enc)
    except Exception:
        logger.exception("FTTH decrypt credentials failed")
        raise HTTPException(
            status_code=401,
            detail="تعذر قراءة بيانات الدخول المحفوظة للبوابة.",
        ) from None
    opts = _merge_options(cfg.parse_options if isinstance(cfg.parse_options, dict) else {})
    try:
        token_data = ftth_iq_get_token(username, password, opts)
        access = token_data.get("access_token") or token_data.get("accessToken")
        if not access:
            raise RuntimeError("لا يوجد access_token في استجابة التوكن")
    except Exception as e:
        logger.exception("FTTH token failed for external-customer lookup")
        raise HTTPException(
            status_code=502,
            detail=f"تعذر الاتصال ببوابة FTTH: {str(e)[:500]}",
        ) from e

    list_row: dict[str, Any] = {"id": eid, "self": {"id": eid}}
    _dr, _sr, unified, rate_limited_stop, abort_session = fetch_unified_customer_bundle(
        access,
        eid,
        list_row,
        opts,
        rate_limited_stop_in=False,
        verbose_logs=False,
        sync_profile="full",
    )
    if abort_session:
        raise HTTPException(
            status_code=401,
            detail="انتهت جلسة FTTH — أعد تسجيل الدخول في إعدادات البوابة أو نفّذ مزامنة من جديد.",
        )
    if rate_limited_stop:
        raise HTTPException(
            status_code=429,
            detail="تم تقليل الطلبات من قبل بوابة FTTH. حاول بعد قليل.",
        )
    norm = unified_record_to_ftth_norm(unified)
    if not norm:
        raise HTTPException(
            status_code=404,
            detail="لم يُعثر على بيانات لهذا المعرف في بوابة FTTH.",
        )
    try:
        norm.pop("calculated_subscription_date", None)
        norm.pop("expiration_date", None)
        norm["start_date"] = _parse_date(norm.get("start_date"))
        norm["end_date"] = _parse_date(norm.get("end_date"))
        norm["active_session_started_at"] = _parse_datetime_tz(norm.get("active_session_started_at"))
        if norm.get("commitment_days") is not None:
            norm["commitment_days"] = _parse_int(norm.get("commitment_days"))
        if norm.get("commitment_period") is not None:
            norm["commitment_period"] = _parse_int(norm.get("commitment_period"))
        _apply_ftth_iq_subscription_dates_only(norm)
        try:
            norm["raw_payload"] = json.loads(json.dumps(norm["raw_payload"], default=str))
        except Exception:
            norm["raw_payload"] = {}
        now = datetime.now(timezone.utc)
        rd = _norm_to_ftth_row_dict(norm, now=now)
        ftth_row = _ftth_model_from_staging_dict(rd)
        return _ftth_external_row_out(ftth_row, data_source="live")
    except Exception as e:
        logger.exception("FTTH live normalize failed for external_id=%s", eid)
        raise HTTPException(
            status_code=502,
            detail=f"تعذر تحضير بيانات FTTH: {str(e)[:500]}",
        ) from e


def _ftth_import_use_row_field(body: FtthImportToSubscriberBody, attr: str) -> bool:
    sel = body.fields_from_ftth
    if sel is None:
        return True
    return bool(getattr(sel, attr))


def _find_existing_subscriber_for_ftth_import(
    db: Session,
    row: models.FtthExternalData,
    phone_val: str | None,
    national_id_name: str | None,
) -> models.Subscriber | None:
    """
    يمنع تكرار المشترك عند إعادة المزامنة/الترحيل: يربط السجل الوسيط بمشترك موجود
    إن وُجد تطابق آمن (نفس external_id مُرحَّل سابقاً، أو نفس الهاتف، أو اسم وطني FTTH عند غياب الهاتف).
    """
    ext_id = (row.external_id or "").strip()
    if ext_id:
        link = (
            db.query(models.FtthExternalData)
            .filter(
                models.FtthExternalData.external_id == ext_id,
                models.FtthExternalData.id != row.id,
                models.FtthExternalData.imported_subscriber_id.isnot(None),
            )
            .order_by(models.FtthExternalData.id.desc())
            .first()
        )
        if link and link.imported_subscriber_id:
            sub = db.get(models.Subscriber, int(link.imported_subscriber_id))
            if sub:
                return sub

    if phone_val and str(phone_val).strip():
        raw = str(phone_val).strip()
        candidates: set[str] = {raw}
        try:
            candidates.add(normalize_iraq_mobile(raw, required=True))
        except ValueError:
            pass
        for c in candidates:
            if not c:
                continue
            sub = db.query(models.Subscriber).filter(models.Subscriber.phone == c).first()
            if sub:
                return sub

    nat = (national_id_name or "").strip()
    if nat and not (phone_val and str(phone_val).strip()):
        sub = (
            db.query(models.Subscriber)
            .filter(
                func.lower(models.Subscriber.national_id_name) == nat.lower(),
                or_(
                    models.Subscriber.subscription_type.is_(None),
                    models.Subscriber.subscription_type.ilike("ftth"),
                ),
            )
            .first()
        )
        if sub:
            return sub
    return None


@router.post("/api/ftth/portal/import-to-subscriber", response_model=schemas.Subscriber)
def ftth_import_to_subscriber(
    body: FtthImportToSubscriberBody,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_ftth_portal_access),
):
    row = db.query(models.FtthExternalData).filter(models.FtthExternalData.id == body.ftth_row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="سجل FTTH غير موجود")

    rn_input = (body.real_name or "").strip() or None

    phone_raw = (body.phone or "").strip()
    if not phone_raw and _ftth_import_use_row_field(body, "phone"):
        phone_raw = (row.phone or "").strip()
    phone_val: str | None = None
    if phone_raw:
        try:
            phone_val = normalize_iraq_mobile(phone_raw, required=True)
        except ValueError:
            phone_val = phone_raw[:50]

    national = (
        ((row.national_name or "").strip() or None)
        if _ftth_import_use_row_field(body, "national_id_name")
        else None
    )
    zone_val = (
        body.zone
        if body.zone is not None
        else (row.zone if _ftth_import_use_row_field(body, "zone") else None)
    )
    fat_val = body.fat if body.fat is not None else (
        row.fat if _ftth_import_use_row_field(body, "fat") else None
    )
    location_val = (
        body.location
        if body.location is not None
        else (row.location if _ftth_import_use_row_field(body, "location") else None)
    )

    date_anchor = "expiration"
    if body.fields_from_ftth is not None:
        date_anchor = body.fields_from_ftth.ftth_date_anchor
    if _ftth_import_use_row_field(body, "subscription_dates"):
        sub_d, exp_d = _ftth_resolve_import_subscription_dates(
            row,
            date_anchor=date_anchor,
            subscription_date_override=body.subscription_date_override,
            expiration_date_override=body.expiration_date_override,
            subscription_span_days=body.subscription_span_days,
        )
    else:
        sub_d, exp_d = None, None
    today = date.today()

    target = None
    if row.imported_subscriber_id and body.update_existing:
        target = (
            db.query(models.Subscriber)
            .filter(models.Subscriber.id == row.imported_subscriber_id)
            .first()
        )

    if target is None:
        target = _find_existing_subscriber_for_ftth_import(db, row, phone_val, national)

    # بعد أول ترحيل ناجح لنفس السجل الوسيط: حدّث التواريخ والحالة فقط (update_dates_only)
    dates_only = bool(
        row.imported_subscriber_id
        and target is not None
        and target.id == row.imported_subscriber_id
    )

    if target:
        if dates_only:
            if _ftth_import_use_row_field(body, "subscription_dates"):
                if sub_d:
                    target.subscription_date = sub_d
                if exp_d:
                    target.expiration_date = exp_d
                if exp_d and _ftth_import_use_row_field(body, "subscriber_status"):
                    target.status = _status_from_expiration(exp_d, today)
            elif _ftth_import_use_row_field(body, "subscriber_status") and row.status:
                target.status = row.status
            target.subscription_type = target.subscription_type or "ftth"
            row.imported_subscriber_id = target.id
            db.flush()
            db.commit()
            db.refresh(target)
            return target
        if rn_input:
            target.real_name = rn_input
        if _ftth_import_use_row_field(body, "national_id_name") and national:
            target.national_id_name = national
        if phone_val:
            target.phone = phone_val
        sz, sf = ftth_sync_zone_fat_on_import(
            db, target=target, merged_zone=zone_val, merged_fat=fat_val
        )
        if sz is not None:
            target.zone = sz
        if sf is not None:
            target.fat = sf
        if location_val is not None:
            target.location = location_val
        if body.category is not None:
            target.category = body.category
        if body.category_price is not None:
            target.category_price = body.category_price
        if _ftth_import_use_row_field(body, "subscription_dates"):
            if sub_d:
                target.subscription_date = sub_d
            if exp_d:
                target.expiration_date = exp_d
            if exp_d and _ftth_import_use_row_field(body, "subscriber_status"):
                target.status = _status_from_expiration(exp_d, today)
        elif _ftth_import_use_row_field(body, "subscriber_status") and row.status:
            target.status = row.status
        target.subscription_type = target.subscription_type or "ftth"
        base_code = build_user_code(
            subscriber_name_for_user_code(target.real_name, target.national_id_name),
            str(target.zone or ""),
            str(target.fat or ""),
            str(target.phone or ""),
        )
        target.user_code = ensure_unique_user_code(db, base_code, exclude_subscriber_id=target.id)
        row.imported_subscriber_id = target.id
        db.flush()
        db.commit()
        db.refresh(target)
        return target

    if not national and not rn_input:
        raise HTTPException(
            status_code=400,
            detail="فعّل «الاسم الوطني (FTTH)» في خيارات الترحيل أو أدخل الاسم الحقيقي يدوياً",
        )

    st_val: str | None = None
    if _ftth_import_use_row_field(body, "subscription_dates") and exp_d:
        if _ftth_import_use_row_field(body, "subscriber_status"):
            st_val = _status_from_expiration(exp_d, today)
    elif _ftth_import_use_row_field(body, "subscriber_status") and row.status:
        st_val = str(row.status).strip()[:50] or None
    if st_val is None:
        st_val = "نشط"

    zone_val, fat_val = ftth_sync_zone_fat_on_import(
        db, target=None, merged_zone=zone_val, merged_fat=fat_val
    )

    db_subscriber = models.Subscriber(
        real_name=rn_input,
        national_id_name=national,
        phone=phone_val,
        zone=zone_val,
        fat=fat_val,
        location=location_val,
        category=body.category,
        category_price=body.category_price,
        subscription_type="ftth",
        debt=0,
        subscription_date=sub_d if _ftth_import_use_row_field(body, "subscription_dates") else None,
        expiration_date=exp_d if _ftth_import_use_row_field(body, "subscription_dates") else None,
        status=st_val,
    )
    base_code = build_user_code(
        subscriber_name_for_user_code(db_subscriber.real_name, db_subscriber.national_id_name),
        str(zone_val or ""),
        str(fat_val or ""),
        str(phone_val or ""),
    )
    db_subscriber.user_code = ensure_unique_user_code(db, base_code)
    db.add(db_subscriber)
    db.flush()
    paid_amount = max(
        0.0,
        float(db_subscriber.category_price or 0) - float(db_subscriber.debt or 0),
    )
    desc_parts = [f"ترحيل من بوابة FTTH — الاسم الوطني: {national or '—'}"]
    if (
        _ftth_import_use_row_field(body, "service_username_in_description")
        and (row.service_username or "").strip()
    ):
        desc_parts.append(f"مستخدم الخدمة: {row.service_username}")
    db.add(
        models.SubscriberHistory(
            subscriber_id=db_subscriber.id,
            type="اشتراك جديد",
            amount=paid_amount,
            description=" — ".join(desc_parts),
        )
    )
    row.imported_subscriber_id = db_subscriber.id
    db.commit()
    db.refresh(db_subscriber)
    return db_subscriber


@router.post("/api/ftth/portal/import-all-pending", response_model=FtthImportAllPendingResult)
def ftth_import_all_pending(
    body: FtthImportAllPendingBody | None = None,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_ftth_portal_access),
):
    """ترحيل كل السجلات غير المُرحَّلة (حتى limit) بنفس قواعد الترحيل المفرد."""
    from app.core.database import engine

    ensure_ftth_tables(engine)
    b = body or FtthImportAllPendingBody()
    rows = (
        db.query(models.FtthExternalData)
        .filter(models.FtthExternalData.imported_subscriber_id.is_(None))
        .order_by(models.FtthExternalData.id.asc())
        .limit(b.limit)
        .all()
    )
    imported = 0
    errors: list[dict[str, Any]] = []
    for row in rows:
        try:
            inner = FtthImportToSubscriberBody(
                ftth_row_id=row.id,
                real_name=None,
                phone=None,
                zone=None,
                fat=None,
                location=None,
                category=None,
                category_price=None,
                update_existing=True,
                fields_from_ftth=b.fields_from_ftth,
            )
            ftth_import_to_subscriber(inner, db)
            imported += 1
        except HTTPException as e:
            db.rollback()
            detail = e.detail
            if not isinstance(detail, str):
                detail = str(detail)
            errors.append({"ftth_row_id": row.id, "external_id": row.external_id, "detail": detail})
        except Exception as e:
            db.rollback()
            errors.append(
                {"ftth_row_id": row.id, "external_id": row.external_id, "detail": str(e)[:500]},
            )
    return FtthImportAllPendingResult(imported=imported, failed=len(errors), errors=errors[:100])
