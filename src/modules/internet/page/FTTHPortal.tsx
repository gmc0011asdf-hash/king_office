import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe2, RefreshCw, UserPlus, Users, Search, X, AlertCircle, CheckCircle2, LogOut, ExternalLink } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { ApiRequestError } from '@/api/client';
import { subscribersApi } from '@/api/subscribers';
import { ftthPortalApi } from '@/modules/internet/api/ftthPortal.api';
import { mergeSubscribersWithHistory } from '@/utils/subscriberListMerge';
import type {
  FtthExternalRow,
  FtthPortalCustomerRow,
  FtthPortalStatus,
} from '@/modules/internet/page/components/types';
import {
  resolveFtthMigrationDates,
  type FtthDateAnchor,
} from '@/modules/internet/utils/ftthMigrationDates';
import {
  FTTH_DEFAULT_SPAN_DAYS,
  calculateRemainingDaysSigned,
  calculateTotalDaysInclusive,
  calendarSpanDays,
  formatDateDDMMYYYY,
  parseFtthDate,
  syncFtthImportDateFields,
  type FtthDurationMode,
} from '@/utils/ftthDateCalculations';

const PAGE_SIZE = 50;

/** حقول تُرحَّل من جدول FTTH (الاسم الحقيقي يُدخل يدوياً دائماً) */
interface FieldsFromFtthState {
  phone: boolean;
  zone: boolean;
  fat: boolean;
  location: boolean;
  nationalIdName: boolean;
  subscriptionDates: boolean;
  /** مرجع المدة 30 يوماً: انتهاء أو بداية */
  ftthDateAnchor: FtthDateAnchor;
  subscriberStatus: boolean;
  serviceUsernameInDescription: boolean;
}

function ftthPortalRowDisplayMetrics(r: FtthPortalCustomerRow) {
  const endSrc = r.subscription_end_date ? String(r.subscription_end_date).slice(0, 10) : '';
  const startSrc = r.subscription_start_date ? String(r.subscription_start_date).slice(0, 10) : '';
  const sd = parseFtthDate(startSrc ?? '');
  const ed = parseFtthDate(endSrc ?? '');
  const span =
    sd && ed && ed.getTime() >= sd.getTime() ? calendarSpanDays(sd, ed) : null;
  const signedRemaining = calculateRemainingDaysSigned(endSrc || null);
  return { signedRemaining, span };
}

/** تحويل صف ftth_customers إلى شكل ترحيل (يحتاج staging_row_id من الوسيط) */
function portalRowToImportShape(r: FtthPortalCustomerRow): FtthExternalRow {
  const stagingId = r.staging_row_id != null && r.staging_row_id > 0 ? r.staging_row_id : 0;
  const start = r.subscription_start_date ? String(r.subscription_start_date).slice(0, 10) : null;
  const end = r.subscription_end_date ? String(r.subscription_end_date).slice(0, 10) : null;
  return {
    id: stagingId,
    external_id: r.external_customer_id,
    national_name: r.full_name,
    phone: r.phone,
    zone: r.zone,
    fat: r.fat,
    location: r.address ?? null,
    service_username: r.onu_username ?? null,
    start_date: start,
    end_date: end,
    resolved_subscription_date: null,
    resolved_expiration_date: null,
    calculated_subscription_date: null,
    remaining_days: null,
    commitment_days: null,
    status: r.subscription_status,
    imported_subscriber_id: r.subscriber_id,
    synced_at: r.last_synced_at ?? null,
    last_synced_at: r.last_synced_at ?? null,
  };
}

function normalizeFtthPortalCustomerRow(raw: unknown): FtthPortalCustomerRow {
  const r = raw as Record<string, unknown>;
  const any = r as Record<string, any>;
  return {
    id: Number(r.id ?? any.id ?? 0) || 0,
    external_customer_id: String(r.external_customer_id ?? any.externalCustomerId ?? '').trim(),
    full_name: (r.full_name ?? any.fullName ?? null) as string | null,
    phone: (r.phone ?? any.phone ?? null) as string | null,
    address: (r.address ?? any.address ?? null) as string | null,
    zone: (r.zone ?? any.zone ?? null) as string | null,
    fat: (r.fat ?? any.fat ?? null) as string | null,
    fdt: (r.fdt ?? any.fdt ?? null) as string | null,
    bundle: (r.bundle ?? any.bundle ?? null) as string | null,
    subscription_status: (r.subscription_status ?? any.subscriptionStatus ?? null) as string | null,
    subscription_start_date: (r.subscription_start_date ?? any.subscriptionStartDate ?? null) as string | null,
    subscription_end_date: (r.subscription_end_date ?? any.subscriptionEndDate ?? null) as string | null,
    onu_username: (r.onu_username ?? any.onuUsername ?? null) as string | null,
    onu_serial: (r.onu_serial ?? any.onuSerial ?? null) as string | null,
    import_status: (r.import_status ?? any.importStatus ?? null) as string | null,
    last_synced_at: (r.last_synced_at ?? any.lastSyncedAt ?? null) as string | null,
    subscriber_id:
      r.subscriber_id != null
        ? Number(r.subscriber_id)
        : any.subscriberId != null
          ? Number(any.subscriberId)
          : null,
    staging_row_id:
      r.staging_row_id != null
        ? Number(r.staging_row_id)
        : any.stagingRowId != null
          ? Number(any.stagingRowId)
          : null,
    raw_payload: (r.raw_payload ?? null) as Record<string, unknown> | null,
  };
}

const FTTH_MAIN_PAYLOAD_KEYS = new Set([
  'phone', 'zone', 'fat', 'onu_username', 'service_username',
  'address', 'subscription_start_date', 'subscription_end_date',
  'bundle', 'subscription_status', 'full_name', 'external_customer_id',
  'national_name', 'start_date', 'end_date', 'status',
  'id', 'fdt', 'onu_serial', 'import_status', 'last_synced_at',
  'subscriber_id', 'staging_row_id', 'remaining_days',
]);

const FTTH_EXTRA_FIELD_LABELS: Record<string, string> = {
  ip_address: 'IP',
  partner_name: 'الشريك',
  governorate: 'المحافظة',
  district: 'الحي',
  location: 'الموقع',
  fdt: 'FDT',
  commitment_days: 'مدة الالتزام',
  active_session_started_at: 'بداية الجلسة',
};

function getFtthExtraFields(
  rawPayload: Record<string, unknown> | null | undefined,
): { key: string; label: string; value: unknown }[] {
  if (!rawPayload || typeof rawPayload !== 'object') return [];
  return Object.entries(rawPayload)
    .filter(([k, v]) => {
      if (FTTH_MAIN_PAYLOAD_KEYS.has(k)) return false;
      if (v === null || v === undefined) return false;
      if (typeof v === 'string' && v.trim() === '') return false;
      if (typeof v === 'number' && v === 0) return false;
      return true;
    })
    .map(([k, v]) => ({ key: k, label: FTTH_EXTRA_FIELD_LABELS[k] ?? k, value: v }));
}

const DEFAULT_FIELDS_FROM_FTTH: FieldsFromFtthState = {
  phone: true,
  zone: true,
  fat: true,
  location: true,
  nationalIdName: true,
  subscriptionDates: true,
  ftthDateAnchor: 'expiration',
  subscriberStatus: true,
  serviceUsernameInDescription: true,
};

const MSG_LOGIN_OK =
  'تم التحقق بنجاح: تسجيل الدخول إلى موقع FTTH يعمل. يمكنك الآن الضغط على «مزامنة الآن» لجلب واستيراد البيانات إلى الجدول، ثم استخدام «ترحيل للنظام» لنقل المشتركين إلى قاعدة بياناتك الأساسية.';

function formatDt(s: string | null | undefined): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('ar-IQ');
  } catch {
    return s;
  }
}

function unwrapExternalDataList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const inner = o.data ?? o.items ?? o.results ?? o.records ?? o.rows ?? o.payload;
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

export type FTTHPortalProps = {
  /** بعد ترحيل FTTH: إعادة جلب المناطق والفاتات والفئات لصفحة الإنترنت */
  onInternetMetaRefresh?: () => void | Promise<void>;
};

export function FTTHPortal({ onInternetMetaRefresh }: FTTHPortalProps): React.ReactElement {
  const { addNotification, logActivity, setSubscribers } = useAppContext();

  const refreshGlobalSubscribers = useCallback(async () => {
    const [fresh, hist] = await Promise.all([
      subscribersApi.getAll().catch(() => []),
      subscribersApi.getHistory().catch(() => []),
    ]);
    if (Array.isArray(fresh)) {
      setSubscribers(mergeSubscribersWithHistory(fresh, hist) as any[]);
    }
  }, [setSubscribers]);
  const [status, setStatus] = useState<FtthPortalStatus | null>(null);
  const [stats, setStats] = useState<{ total: number; imported: number; pending: number } | null>(null);
  const [rows, setRows] = useState<FtthPortalCustomerRow[]>([]);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [notImportedOnly, setNotImportedOnly] = useState(false);
  const [lastSyncBanner, setLastSyncBanner] = useState<string | null>(null);
  /** خطأ تحميل الجدول فقط — لا يُخلط مع «لا توجد بيانات» */
  const [tableLoadError, setTableLoadError] = useState<string | null>(null);
  /** رسالة بعد نجاح التحقق من تسجيل الدخول للموقع الخارجي */
  const [loginSuccessBanner, setLoginSuccessBanner] = useState<string | null>(null);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [logoutClearStaged, setLogoutClearStaged] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);

  const [loginUrl, setLoginUrl] = useState('https://admin.ftth.iq/auth/login');
  const [listUrl, setListUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [parseMode, setParseMode] = useState('ftth_iq_admin');
  const [parseOptionsJson, setParseOptionsJson] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [importRow, setImportRow] = useState<FtthExternalRow | null>(null);
  const [realName, setRealName] = useState('');
  const [impPhone, setImpPhone] = useState('');
  const [impZone, setImpZone] = useState('');
  const [impFat, setImpFat] = useState('');
  const [impLocation, setImpLocation] = useState('');
  const [impCategory, setImpCategory] = useState('');
  const [impCategoryPrice, setImpCategoryPrice] = useState('');
  const [impSubscriptionDate, setImpSubscriptionDate] = useState('');
  const [impExpirationDate, setImpExpirationDate] = useState('');
  const [impSpanDaysStr, setImpSpanDaysStr] = useState(String(FTTH_DEFAULT_SPAN_DAYS));
  const [impDurationMode, setImpDurationMode] = useState<FtthDurationMode>('calendar_days');
  const [importLoading, setImportLoading] = useState(false);
  const [bulkImportLoading, setBulkImportLoading] = useState(false);
  const [importFieldsFromFtth, setImportFieldsFromFtth] = useState<FieldsFromFtthState>({
    ...DEFAULT_FIELDS_FROM_FTTH,
  });

  const migrationPreview = useMemo(() => {
    if (!importRow || !importOpen) return null;
    const span =
      importRow.commitment_days != null && importRow.commitment_days > 0
        ? importRow.commitment_days
        : FTTH_DEFAULT_SPAN_DAYS;
    return resolveFtthMigrationDates(
      importRow.start_date,
      importRow.end_date,
      importFieldsFromFtth.ftthDateAnchor,
      span,
    );
  }, [
    importOpen,
    importRow,
    importFieldsFromFtth.ftthDateAnchor,
  ]);

  useEffect(() => {
    if (!importOpen || !importRow) return;
    const spanDefault =
      importRow.commitment_days != null && importRow.commitment_days > 0
        ? importRow.commitment_days
        : FTTH_DEFAULT_SPAN_DAYS;
    const p = resolveFtthMigrationDates(
      importRow.start_date,
      importRow.end_date,
      importFieldsFromFtth.ftthDateAnchor,
      spanDefault,
    );
    const next = syncFtthImportDateFields(
      {
        subscriptionIso: '',
        expirationIso: '',
        spanDaysStr: String(spanDefault),
        durationMode: 'calendar_days',
      },
      'reset',
      {
        subscriptionIso: p.subscription ?? '',
        expirationIso: p.expiration ?? '',
        defaultSpanDays: spanDefault,
      },
    );
    setImpSubscriptionDate(next.subscriptionIso);
    setImpExpirationDate(next.expirationIso);
    setImpSpanDaysStr(next.spanDaysStr);
    setImpDurationMode(next.durationMode);
  }, [
    importOpen,
    importRow?.id,
    importFieldsFromFtth.ftthDateAnchor,
    importRow?.start_date,
    importRow?.end_date,
    importRow?.commitment_days,
  ]);

  const impDateBlock = useMemo(() => {
    const sub = impSubscriptionDate.trim();
    const exp = impExpirationDate.trim();
    const sd = sub ? parseFtthDate(sub) : null;
    const ed = exp ? parseFtthDate(exp) : null;
    const remaining = calculateRemainingDaysSigned(exp || null);
    const inclusiveDays =
      sd && ed && ed.getTime() >= sd.getTime() ? calculateTotalDaysInclusive(sd, ed) : null;
    const spanOnly =
      sd && ed && ed.getTime() >= sd.getTime() ? calendarSpanDays(sd, ed) : null;
    return { remaining, inclusiveDays, spanOnly };
  }, [impSubscriptionDate, impExpirationDate]);

  const impDateFieldBase = useMemo(
    () => ({
      subscriptionIso: impSubscriptionDate,
      expirationIso: impExpirationDate,
      spanDaysStr: impSpanDaysStr,
      durationMode: impDurationMode,
    }),
    [impSubscriptionDate, impExpirationDate, impSpanDaysStr, impDurationMode],
  );

  const applyImpSubscription = useCallback((value: string) => {
    const n = syncFtthImportDateFields(impDateFieldBase, 'subscription', { subscriptionIso: value });
    setImpSubscriptionDate(n.subscriptionIso);
    setImpExpirationDate(n.expirationIso);
    setImpSpanDaysStr(n.spanDaysStr);
    setImpDurationMode(n.durationMode);
  }, [impDateFieldBase]);

  const applyImpExpiration = useCallback((value: string) => {
    const n = syncFtthImportDateFields(impDateFieldBase, 'expiration', { expirationIso: value });
    setImpSubscriptionDate(n.subscriptionIso);
    setImpExpirationDate(n.expirationIso);
    setImpSpanDaysStr(n.spanDaysStr);
    setImpDurationMode(n.durationMode);
  }, [impDateFieldBase]);

  const applyImpSpan = useCallback((value: string) => {
    const n = syncFtthImportDateFields(impDateFieldBase, 'span', { spanDaysStr: value });
    setImpSubscriptionDate(n.subscriptionIso);
    setImpExpirationDate(n.expirationIso);
    setImpSpanDaysStr(n.spanDaysStr);
    setImpDurationMode(n.durationMode);
  }, [impDateFieldBase]);

  const applyImpDurationMode = useCallback((mode: FtthDurationMode) => {
    const n = syncFtthImportDateFields(impDateFieldBase, 'mode', { durationMode: mode });
    setImpSubscriptionDate(n.subscriptionIso);
    setImpExpirationDate(n.expirationIso);
    setImpSpanDaysStr(n.spanDaysStr);
    setImpDurationMode(n.durationMode);
  }, [impDateFieldBase]);

  const loadStatus = useCallback(async () => {
    const s = await ftthPortalApi.getStatus();
    setStatus(s);
    return s;
  }, []);

  const loadData = useCallback(async () => {
    setTableLoading(true);
    setTableLoadError(null);
    let st: Awaited<ReturnType<typeof ftthPortalApi.getExternalStats>> | null = null;
    let listRaw: unknown = null;
    try {
      st = await ftthPortalApi.getExternalStats().catch((err) => {
        console.warn('FTTH external-stats failed', err);
        return null;
      });
      listRaw = await ftthPortalApi.getPortalCustomers({
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: searchQ || undefined,
        notImportedOnly: notImportedOnly || undefined,
      });
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof ApiRequestError
          ? e.status === 403
            ? 'لا صلاحية لعرض بيانات المزامنة (يتطلب صلاحية بوابة FTTH أو المدير).'
            : String(e.message || 'تعذر تحميل بيانات FTTH')
          : 'تعذر تحميل بيانات المزامنة. تحقق من الاتصال.';
      setTableLoadError(msg);
      setRows([]);
      addNotification?.('بوابة FTTH', msg, 'alert');
      return;
    } finally {
      setTableLoading(false);
    }
    if (st) setStats(st);
    const arr = unwrapExternalDataList(listRaw);
    setRows(arr.map((row) => normalizeFtthPortalCustomerRow(row)));
  }, [page, searchQ, notImportedOnly, addNotification]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadStatus();
      } catch {
        if (!cancelled) {
          setStatus({
            configured: false,
            login_url: null,
            list_url: null,
            parse_mode: null,
            last_sync_at: null,
            last_sync_new: 0,
            last_sync_updated: 0,
            last_sync_error: null,
          });
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  useEffect(() => {
    loadData();
  }, [page, searchQ, notImportedOnly, loadData]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    let parse_options: Record<string, unknown> | undefined;
    if (parseOptionsJson.trim()) {
      try {
        parse_options = JSON.parse(parseOptionsJson) as Record<string, unknown>;
      } catch {
        addNotification?.('بوابة FTTH', 'حقل خيارات JSON غير صالح', 'alert');
        return;
      }
    }
    setSetupLoading(true);
    try {
      const s = await ftthPortalApi.setup({
        login_url: loginUrl.trim(),
        username: username.trim(),
        password,
        list_url: listUrl.trim() || undefined,
        parse_mode: parseMode,
        parse_options,
      });
      setStatus(s);
      setPassword('');
      setShowLoginForm(false);
      const okMsg = s.setup_message?.trim() || MSG_LOGIN_OK;
      setLoginSuccessBanner(okMsg);
      addNotification?.('بوابة FTTH — نجاح تسجيل الدخول', okMsg, 'info');
      logActivity?.('internet', 'ftth_portal_setup', `FTTH portal configured — ${loginUrl.slice(0, 80)}`);
      await loadData();
    } catch (err) {
      const msg = err instanceof ApiRequestError ? String(err.message) : 'فشل الإعداد';
      addNotification?.('بوابة FTTH', msg, 'alert');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleSync = async () => {
    if (!status?.configured) {
      addNotification?.('بوابة FTTH', 'يرجى تسجيل الدخول أولاً للتمكن من المزامنة مع بوابة FTTH.', 'alert');
      return;
    }
    setSyncLoading(true);
    setLastSyncBanner(null);
    try {
      const r = await ftthPortalApi.sync();
      setLastSyncBanner(r.message);
      addNotification?.('بوابة FTTH', r.message, 'info');
      logActivity?.(
        'internet',
        'ftth_portal_sync',
        `FTTH sync — جديد: ${r.new_count}, محدّث: ${r.updated_count}, صفحات: ${r.pages_fetched}`,
      );
      await loadStatus();
      await loadData();
    } catch (err) {
      const msg = err instanceof ApiRequestError ? String(err.message) : 'فشلت المزامنة';
      addNotification?.('بوابة FTTH', msg, 'alert');
    } finally {
      setSyncLoading(false);
    }
  };

  const openImport = (row: FtthPortalCustomerRow) => {
    setImportRow(portalRowToImportShape(row));
    setRealName('');
    setImpPhone(row.phone || '');
    setImpZone(row.zone || '');
    setImpFat(row.fat || '');
    setImpLocation('');
    setImpCategory('');
    setImpCategoryPrice('');
    setImportFieldsFromFtth({ ...DEFAULT_FIELDS_FROM_FTTH });
    setImportOpen(true);
  };

  const submitImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importRow) return;
    const hasNational =
      importFieldsFromFtth.nationalIdName && (importRow.national_name || '').trim().length > 0;
    const optionalReal = realName.trim();
    if (!hasNational && !optionalReal) {
      addNotification?.('بوابة FTTH', 'فعّل «الاسم الوطني (FTTH)» أو أدخل الاسم الحقيقي اختيارياً', 'alert');
      return;
    }
    setImportLoading(true);
    try {
      await ftthPortalApi.importToSubscriber({
        ftthRowId: importRow.id,
        realName: optionalReal || undefined,
        phone: impPhone.trim() || undefined,
        zone: impZone.trim() || undefined,
        fat: impFat.trim() || undefined,
        location: impLocation.trim() || undefined,
        category: impCategory.trim() || undefined,
        categoryPrice: impCategoryPrice.trim() ? Number(impCategoryPrice) : undefined,
        subscriptionDateOverride: impSubscriptionDate.trim() || undefined,
        expirationDateOverride: impExpirationDate.trim() || undefined,
        ...(() => {
          const subT = impSubscriptionDate.trim();
          const expT = impExpirationDate.trim();
          const spanN = parseInt(impSpanDaysStr.trim(), 10);
          const validSpan =
            Number.isFinite(spanN) && spanN >= 1 && spanN <= 3660 ? spanN : undefined;
          const oneOnly = (subT && !expT) || (!subT && expT);
          if (!importFieldsFromFtth.subscriptionDates || !oneOnly) return {};
          return { subscriptionSpanDays: validSpan ?? FTTH_DEFAULT_SPAN_DAYS };
        })(),
        updateExisting: true,
        fieldsFromFtth: {
          ...importFieldsFromFtth,
          ftthDateAnchor: importFieldsFromFtth.ftthDateAnchor,
        },
      });
      await refreshGlobalSubscribers();
      await onInternetMetaRefresh?.();
      addNotification?.('بوابة FTTH', 'تم ترحيل المشترك إلى النظام الأساسي', 'info');
      logActivity?.(
        'internet',
        'ftth_import',
        `FTTH import — ${importRow.national_name || importRow.external_id}`,
      );
      setImportOpen(false);
      setImportRow(null);
      await loadData();
      await loadStatus();
    } catch (err) {
      const msg = err instanceof ApiRequestError ? String(err.message) : 'فشل الترحيل';
      addNotification?.('بوابة FTTH', msg, 'alert');
    } finally {
      setImportLoading(false);
    }
  };

  const handleBulkImport = async () => {
    const pending = stats?.pending ?? 0;
    if (pending <= 0) {
      addNotification?.('بوابة FTTH', 'لا توجد سجلات بانتظار الترحيل', 'alert');
      return;
    }
    const limit = Math.min(pending, 500);
    if (
      !window.confirm(
        `سيتم ترحيل حتى ${limit} سجل: تواريخ الاشتراك/الانتهاء حسب قاعدة 30 يوماً (افتراضياً من تاريخ الانتهاء في المزامنة إن وُجد). المتابعة؟`,
      )
    ) {
      return;
    }
    setBulkImportLoading(true);
    try {
      const r = await ftthPortalApi.importAllPending({
        limit,
        fieldsFromFtth: { ...DEFAULT_FIELDS_FROM_FTTH },
      });
      const msg =
        r.failed > 0
          ? `مُرحَّل: ${r.imported} — فشل: ${r.failed}. راجع التفاصيل في رسالة الخادم.`
          : `تم ترحيل ${r.imported} مشتركاً بنجاح.`;
      addNotification?.('بوابة FTTH', msg, r.failed > 0 ? 'alert' : 'info');
      logActivity?.('internet', 'ftth_import_bulk', `FTTH bulk import — ok=${r.imported} fail=${r.failed}`);
      await refreshGlobalSubscribers();
      await onInternetMetaRefresh?.();
      await loadData();
      await loadStatus();
    } catch (err) {
      const msg = err instanceof ApiRequestError ? String(err.message) : 'فشل الترحيل الجماعي';
      addNotification?.('بوابة FTTH', msg, 'alert');
    } finally {
      setBulkImportLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearchQ(search.trim());
  };

  const handleConfirmLogout = async () => {
    setLogoutLoading(true);
    try {
      const s = await ftthPortalApi.logout(logoutClearStaged);
      setStatus(s);
      await loadData();
      setLastSyncBanner(null);
      setLoginSuccessBanner(null);
      setLoginUrl('https://admin.ftth.iq/auth/login');
      setListUrl('');
      setUsername('');
      setPassword('');
      setParseMode('ftth_iq_admin');
      setParseOptionsJson('');
      setLogoutModalOpen(false);
      addNotification?.(
        'بوابة FTTH',
        logoutClearStaged
          ? 'تم تسجيل الخروج وحذف الاعتمادات والبيانات المؤقتة. أعد إدخال بيانات الموقع الجديد عند الحاجة.'
          : 'تم تسجيل الخروج وحذف الاعتمادات فقط. يمكنك ربط موقع آخر بإدخال بيانات جديدة.',
        'info',
      );
      logActivity?.('internet', 'ftth_portal_logout', `FTTH portal logout — clear_staged=${logoutClearStaged}`);
    } catch (err) {
      const msg = err instanceof ApiRequestError ? String(err.message) : 'فشل تسجيل الخروج';
      addNotification?.('بوابة FTTH', msg, 'alert');
    } finally {
      setLogoutLoading(false);
    }
  };

  if (bootstrapping || !status) {
    return (
      <div className="flex justify-center py-16 text-slate-500 dark:text-slate-400">
        جاري التحميل...
      </div>
    );
  }



  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Globe2 className="text-indigo-600" size={22} />
            بوابة FTTH — بيانات خارجية
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            بعد «مزامنة الآن» استخدم «ترحيل للنظام» لكل صف أو «ترحيل الكل» لغير المُرحَّلين دفعة واحدة. اسم FTTH يُحفظ في «الاسم في الوطني»؛ الاسم الحقيقي يُكمل لاحقاً من تعديل المشترك.
          </p>
        </div>
        {!status.configured && (
          <div className="flex-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center justify-between mx-4">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm">
              <AlertCircle size={18} />
              <span>الجلسة غير نشطة. يرجى تسجيل الدخول لتتمكن من المزامنة.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowLoginForm(true);
              }}
              className="text-xs font-bold bg-amber-200 dark:bg-amber-800 px-3 py-1.5 rounded hover:bg-amber-300 transition-colors"
            >
              تسجيل الدخول
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleBulkImport}
            disabled={bulkImportLoading || syncLoading || (stats?.pending ?? 0) <= 0}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            title="ترحيل كل السجلات غير المُرحَّلة (حد أقصى 500 لكل عملية)"
          >
            <Users size={16} className={bulkImportLoading ? 'animate-pulse' : ''} />
            {bulkImportLoading ? 'جاري الترحيل...' : 'ترحيل الكل'}
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncLoading}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncLoading ? 'animate-spin' : ''} />
            مزامنة الآن
          </button>
          <button
            type="button"
            onClick={() => setLogoutModalOpen(true)}
            className="inline-flex items-center gap-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <LogOut size={16} />
            خروج
          </button>
        </div>
      </div>

      {showLoginForm && !status.configured && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <Globe2 className="text-indigo-600" size={28} />
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">إعداد الاتصال ببوابة FTTH</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  أدخل بيانات الدخول ورابط القائمة للتمكن من جلب البيانات الجديدة.
                </p>
              </div>
            </div>
            <button 
              onClick={() => setShowLoginForm(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">رابط تسجيل الدخول</label>
              <input
                required
                dir="ltr"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                value={loginUrl}
                onChange={(e) => setLoginUrl(e.target.value)}
                placeholder="https://portal.example.com/login"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                رابط قائمة المشتركين (مع {'{page}'} للترقيم)
              </label>
              <input
                dir="ltr"
                required={parseMode !== 'demo' && parseMode !== 'ftth_iq_admin'}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                value={listUrl}
                onChange={(e) => setListUrl(e.target.value)}
                placeholder={
                  parseMode === 'ftth_iq_admin'
                    ? 'يُستخدم API تلقائياً — يمكن تركه فارغاً'
                    : 'https://portal.example.com/api/subscribers?page={page}'
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">اسم المستخدم</label>
                <input
                  required
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">كلمة المرور</label>
                <input
                  required
                  type="password"
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">نمط الجلب</label>
              <select
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                value={parseMode}
                onChange={(e) => setParseMode(e.target.value)}
              >
                <option value="ftth_iq_admin">FTTH العراق — admin.ftth.iq (API رسمي)</option>
                <option value="json_generic">JSON عام (mapping اختياري)</option>
                <option value="html_table">جدول HTML</option>
                <option value="demo">تجريبي (بدون موقع حقيقي)</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLoginForm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                تجاهل
              </button>
              <button
                type="submit"
                disabled={setupLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {setupLoading ? 'جاري التحقق...' : 'حفظ والتحقق من الاتصال'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loginSuccessBanner && (
        <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-sm text-emerald-900 dark:text-emerald-100">
          <CheckCircle2 className="shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" size={22} />
          <div className="flex-1 space-y-1">
            <div className="font-semibold">تم تسجيل الدخول للموقع بنجاح</div>
            <p className="text-emerald-800/90 dark:text-emerald-200/90 leading-relaxed">{loginSuccessBanner}</p>
          </div>
          <button
            type="button"
            onClick={() => setLoginSuccessBanner(null)}
            className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {(status.last_sync_error || lastSyncBanner || status.last_sync_at) && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {lastSyncBanner && (
            <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              <span>{lastSyncBanner}</span>
            </div>
          )}
          {status.last_sync_error && (
            <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-sm text-rose-800 dark:text-rose-200 sm:col-span-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>آخر خطأ: {status.last_sync_error}</span>
            </div>
          )}
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm">
            <div className="text-slate-500 text-xs">آخر مزامنة</div>
            <div className="font-medium text-slate-800 dark:text-slate-100">{formatDt(status.last_sync_at)}</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm">
            <div className="text-slate-500 text-xs">جديد / محدّث (آخر عملية)</div>
            <div className="font-medium text-slate-800 dark:text-slate-100">
              {status.last_sync_new} جديد — {status.last_sync_updated} محدّث
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
            إجمالي السجلات: <strong>{stats.total}</strong>
          </span>
          <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200">
            مُرحَّل: <strong>{stats.imported}</strong>
          </span>
          <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200">
            بانتظار الترحيل: <strong>{stats.pending}</strong>
          </span>
        </div>
      )}

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="w-full border border-slate-200 dark:border-slate-600 rounded-lg pr-10 pl-3 py-2 text-sm bg-white dark:bg-slate-700"
            placeholder="بحث بالاسم أو الهاتف أو المعرف أو المنطقة أو الباقة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={notImportedOnly} onChange={(e) => { setNotImportedOnly(e.target.checked); setPage(0); }} />
          غير المُرحَّل فقط
        </label>
        <button type="submit" className="bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium">
          بحث
        </button>
      </form>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* جدول سطح المكتب — بيانات من ftth_customers (عرض محلي منظّف) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-right text-xs min-w-[1200px] table-fixed">
            <thead className="bg-slate-100 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-2.5 font-semibold">الاسم</th>
                <th className="px-2 py-2.5 font-semibold">الهاتف</th>
                <th className="px-2 py-2.5 font-semibold">المنطقة</th>
                <th className="px-2 py-2.5 font-semibold whitespace-nowrap">FAT</th>
                <th className="px-2 py-2.5 font-semibold">الخدمة / اسم المستخدم</th>
                <th className="px-2 py-2.5 font-semibold">العنوان</th>
                <th className="px-2 py-2.5 font-semibold whitespace-nowrap">البداية</th>
                <th className="px-2 py-2.5 font-semibold whitespace-nowrap">النهاية</th>
                <th className="px-2 py-2.5 font-semibold whitespace-nowrap">عدد الأيام المتبقية</th>
                <th className="px-2 py-2.5 font-semibold">الاشتراك</th>
                <th className="px-2 py-2.5 font-semibold">الحالة</th>
                <th className="px-2 py-2.5 font-semibold text-center">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {tableLoading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-slate-500">
                    جاري التحميل...
                  </td>
                </tr>
              ) : tableLoadError ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-rose-700 dark:text-rose-300">
                    {tableLoadError}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    لا توجد بيانات في العرض المحلي (ftth_customers). نفّذ «مزامنة الآن» ثم أعد تحميل القائمة.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => {
                  const endIso = r.subscription_end_date
                    ? String(r.subscription_end_date).slice(0, 10)
                    : null;
                  const startIso = r.subscription_start_date
                    ? String(r.subscription_start_date).slice(0, 10)
                    : null;
                  const canImport = (r.staging_row_id ?? 0) > 0;
                  const actionTitle = [
                    r.import_status ? `استيراد: ${r.import_status}` : null,
                    r.last_synced_at ? `آخر مزامنة: ${formatDt(r.last_synced_at)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  const extraFields = getFtthExtraFields(r.raw_payload);
                  const rowBg = idx % 2 === 0
                    ? 'bg-white dark:bg-slate-800/40 hover:bg-indigo-50/50 dark:hover:bg-slate-700/40'
                    : 'bg-slate-50/80 dark:bg-slate-800/80 hover:bg-indigo-50/50 dark:hover:bg-slate-700/40';
                  return (
                  <React.Fragment key={`${r.id}-${r.external_customer_id}`}>
                  <tr
                    className={rowBg}
                  >
                    <td className="px-2 py-2 font-medium text-slate-800 dark:text-slate-100 align-top break-words">
                      <div>{r.full_name || '—'}</div>
                      <div className="mt-0.5 flex items-center gap-1 flex-wrap font-mono text-[10px] text-slate-500" dir="ltr">

                        <a
                          href={`https://admin.ftth.iq/customer-details/${encodeURIComponent(r.external_customer_id)}/details/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 p-0.5 rounded"
                          title="فتح صفحة التفاصيل في admin.ftth.iq"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={12} />
                        </a>
                        <Link
                          to={`/internet/ftth-customer/${encodeURIComponent(r.external_customer_id)}`}
                          className="shrink-0 text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                          title="صفحة التفاصيل في النظام"
                          onClick={(e) => e.stopPropagation()}
                        >
                          عرض
                        </Link>
                      </div>
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px] align-top truncate" dir="ltr" title={r.phone || ''}>
                      {r.phone || '—'}
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px] align-top truncate" dir="ltr" title={r.zone || ''}>
                      {r.zone || '—'}
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px] align-top truncate" dir="ltr" title={r.fat || ''}>
                      {r.fat || '—'}
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px] align-top truncate" dir="ltr" title={r.onu_username || ''}>
                      {r.onu_username || '—'}
                    </td>
                    <td className="px-2 py-2 text-[11px] align-top text-slate-600 dark:text-slate-300 break-words max-h-14 overflow-hidden" title={r.address || ''}>
                      {r.address || '—'}
                    </td>
                    <td className="px-2 py-2 text-[11px] align-top whitespace-nowrap" title={startIso || ''}>
                      {formatDateDDMMYYYY(startIso) || startIso || '—'}
                    </td>
                    <td className="px-2 py-2 text-[11px] align-top whitespace-nowrap" title={endIso || ''}>
                      {formatDateDDMMYYYY(endIso) || endIso || '—'}
                    </td>
                    <td className="px-2 py-2 text-[11px] align-top text-center" dir="ltr">
                      {(() => {
                        const { signedRemaining } = ftthPortalRowDisplayMetrics(r);
                        if (signedRemaining === null) return <span className="text-slate-400">—</span>;
                        return signedRemaining < 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">{signedRemaining}</span>
                        ) : (
                          <span className="text-emerald-600 font-bold">{signedRemaining}</span>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-2 text-[11px] align-top text-slate-600 dark:text-slate-300 break-words max-h-12 overflow-hidden" title={r.bundle || ''}>
                      {r.bundle || '—'}
                    </td>
                    <td className="px-2 py-2 text-[11px] align-top text-slate-600 dark:text-slate-300 max-h-10 overflow-hidden" title={r.subscription_status || ''}>
                      {r.subscription_status || '—'}
                    </td>
                    <td className="px-2 py-2 text-center align-top" title={actionTitle || undefined}>
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {r.subscriber_id != null ? (
                          <Link
                            to={`/internet?openSubscriber=${r.subscriber_id}`}
                            className="inline-flex items-center justify-center rounded-lg border border-emerald-600 dark:border-emerald-500 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-semibold"
                          >
                            #{r.subscriber_id}
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          disabled={!canImport}
                          title={
                            !canImport
                              ? 'لا يوجد سجل وسيط مطابق للترحيل — تحقق من المزامنة'
                              : actionTitle || 'ترحيل للنظام'
                          }
                          onClick={() => canImport && openImport(r)}
                          className="inline-flex items-center gap-0.5 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <UserPlus size={12} />
                          ترحيل
                        </button>
                      </div>
                    </td>
                  </tr>

                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* بطاقات للجوال والتابلت */}
        <div className="lg:hidden divide-y divide-slate-200 dark:divide-slate-700">
          {tableLoading ? (
            <div className="p-8 text-center text-slate-500">جاري التحميل...</div>
          ) : tableLoadError ? (
            <div className="p-8 text-center text-rose-700 dark:text-rose-300">{tableLoadError}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              لا توجد بيانات في العرض المحلي (ftth_customers). نفّذ «مزامنة الآن».
            </div>
          ) : (
            rows.map((r) => {
              const endIso = r.subscription_end_date
                ? String(r.subscription_end_date).slice(0, 10)
                : null;
              const startIso = r.subscription_start_date
                ? String(r.subscription_start_date).slice(0, 10)
                : null;
              const canImport = (r.staging_row_id ?? 0) > 0;
              const extraFieldsMobile = getFtthExtraFields(r.raw_payload);
              return (
              <div key={`${r.id}-${r.external_customer_id}`} className="p-4 space-y-3 bg-white dark:bg-slate-800">
                <div className="flex justify-between gap-2 items-start">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">{r.full_name || '—'}</div>
                    <div className="text-[11px] font-mono text-slate-500 mt-1 flex items-center gap-1 flex-wrap" dir="ltr">
                      <a
                        href={`https://admin.ftth.iq/customer-details/${encodeURIComponent(r.external_customer_id)}/details/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-500"
                        title="التفاصيل في FTTH"
                      >
                        <ExternalLink size={12} />
                      </a>
                      <Link
                        to={`/internet/ftth-customer/${encodeURIComponent(r.external_customer_id)}`}
                        className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold"
                        title="صفحة التفاصيل في النظام"
                      >
                        عرض
                      </Link>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    {r.subscriber_id != null ? (
                      <Link
                        to={`/internet?openSubscriber=${r.subscriber_id}`}
                        className="inline-flex items-center justify-center rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-300 px-2 py-1 text-[10px] font-semibold"
                      >
                        فتح #{r.subscriber_id}
                      </Link>
                    ) : (
                      <span className="text-[10px] text-slate-400" title="غير مربوط بعد">
                        غير مربوط بعد
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={!canImport}
                      onClick={() => canImport && openImport(r)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                    >
                      <UserPlus size={14} />
                      ترحيل للنظام
                    </button>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
                  <div>
                    <dt className="text-slate-400">هاتف</dt>
                    <dd className="font-mono" dir="ltr">
                      {r.phone || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">منطقة</dt>
                    <dd className="font-mono" dir="ltr">
                      {r.zone || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">FAT</dt>
                    <dd className="font-mono" dir="ltr">
                      {r.fat || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">الخدمة / اسم المستخدم</dt>
                    <dd className="font-mono break-all" dir="ltr">
                      {r.onu_username || '—'}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-400">العنوان</dt>
                    <dd className="break-words">{r.address || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">البداية</dt>
                    <dd className="font-mono" dir="ltr">
                      {formatDateDDMMYYYY(startIso) || startIso || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">النهاية</dt>
                    <dd className="font-mono" dir="ltr">
                      {formatDateDDMMYYYY(endIso) || endIso || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">أيّام متبقية</dt>
                    <dd className="font-mono" dir="ltr">
                      {(() => {
                        const { signedRemaining } = ftthPortalRowDisplayMetrics(r);
                        if (signedRemaining === null) return <span className="text-slate-400">—</span>;
                        return signedRemaining < 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">{signedRemaining}</span>
                        ) : (
                          <span className="text-emerald-600 font-bold">{signedRemaining}</span>
                        );
                      })()}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-400">الاشتراك (الباقة)</dt>
                    <dd className="break-words">{r.bundle || '—'}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-400">الحالة</dt>
                    <dd>{r.subscription_status || '—'}</dd>
                  </div>
                </dl>
              </div>
              );
            })
          )}
        </div>

        <div className="flex justify-between items-center px-4 py-3 border-t border-slate-200 dark:border-slate-700 text-sm bg-slate-50/50 dark:bg-slate-900/30">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="text-indigo-600 disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-slate-500">صفحة {page + 1}</span>
          <button
            type="button"
            disabled={rows.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
            className="text-indigo-600 disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      </div>

      {importOpen && importRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">ترحيل إلى المشتركين</h3>
              <button type="button" onClick={() => setImportOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submitImport} className="p-4 space-y-4">
              <div className="text-sm bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 space-y-1">
                <div>
                  <span className="text-slate-500">الاسم في FTTH: </span>
                  <strong>{importRow.national_name || '—'}</strong>
                </div>
                <div className="text-xs font-mono text-slate-600" dir="ltr">
                  external_id: {importRow.external_id}
                </div>
                {(importRow.zone || importRow.fat || importRow.service_username) && (
                  <div className="text-xs text-slate-600 space-y-0.5 pt-1 border-t border-slate-200 dark:border-slate-600">
                    {importRow.zone && (
                      <div dir="ltr">
                        <span className="text-slate-500">منطقة:</span> {importRow.zone}
                      </div>
                    )}
                    {importRow.fat && (
                      <div dir="ltr">
                        <span className="text-slate-500">FAT:</span> {importRow.fat}
                      </div>
                    )}
                    {importRow.service_username && (
                      <div dir="ltr">
                        <span className="text-slate-500">مستخدم الخدمة:</span> {importRow.service_username}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 p-3 space-y-2 bg-slate-50/80 dark:bg-slate-900/40">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  الحقول المُرحَّلة من بيانات FTTH إلى المشترك
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  ألغِ التحديد عن أي حقل لا تريد أن يُنسَخ من الجدول المستورد (القيم في الحقول أدناه تظل للتعديل اليدوي).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 dark:text-slate-200">
                  {(
                    [
                      { key: 'phone', label: 'الهاتف' },
                      { key: 'zone', label: 'المنطقة' },
                      { key: 'fat', label: 'FAT' },
                      { key: 'location', label: 'العنوان' },
                      { key: 'nationalIdName', label: 'الاسم الوطني (FTTH)' },
                      {
                        key: 'subscriptionDates',
                        label: 'تواريخ الاشتراك والانتهاء (مدة قابلة للتعديل، افتراضي 30 يوماً)',
                      },
                      { key: 'subscriberStatus', label: 'حالة من الانتهاء (نشط/منتهي)' },
                      {
                        key: 'serviceUsernameInDescription',
                        label: 'ذكر مستخدم الخدمة في السجل',
                      },
                    ] as { key: keyof FieldsFromFtthState; label: string }[]
                  )
                    .filter((x) => x.key !== 'ftthDateAnchor')
                    .map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!importFieldsFromFtth[key]}
                        onChange={(e) =>
                          setImportFieldsFromFtth((p) => ({ ...p, [key]: e.target.checked }))
                        }
                        className="rounded border-slate-300"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {importFieldsFromFtth.subscriptionDates && (
                  <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-600 space-y-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <div className="font-semibold text-slate-700 dark:text-slate-200">مرجع حساب المدة (30 يوماً)</div>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="ftthDateAnchor"
                        className="mt-0.5"
                        checked={importFieldsFromFtth.ftthDateAnchor === 'expiration'}
                        onChange={() =>
                          setImportFieldsFromFtth((p) => ({ ...p, ftthDateAnchor: 'expiration' }))
                        }
                      />
                      <span>
                        <strong>من تاريخ الانتهاء</strong> في المزامنة إن وُجد → يُحفظ الانتهاء وتاريخ الاشتراك = انتهاء − 30 يوماً. إن لم يوجد انتهاء يُستخدم تاريخ البداية.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="ftthDateAnchor"
                        className="mt-0.5"
                        checked={importFieldsFromFtth.ftthDateAnchor === 'start'}
                        onChange={() =>
                          setImportFieldsFromFtth((p) => ({ ...p, ftthDateAnchor: 'start' }))
                        }
                      />
                      <span>
                        <strong>من تاريخ البداية</strong> في المزامنة إن وُجد → يُحفظ الاشتراك وتاريخ الانتهاء = بداية + 30 يوماً. إن لم يوجد بداية يُستخدم تاريخ الانتهاء.
                      </span>
                    </label>
                  </div>
                )}
                {importFieldsFromFtth.subscriptionDates && migrationPreview && (
                  <div className="mt-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 p-2 text-[11px] text-indigo-900 dark:text-indigo-100">
                    <div className="font-semibold mb-1">معاينة من المزامنة (قبل التعديل اليدوي)</div>
                    {migrationPreview.subscription || migrationPreview.expiration ? (
                      <div className="font-mono space-y-0.5" dir="ltr">
                        <div>
                          اشتراك:{' '}
                          {formatDateDDMMYYYY(migrationPreview.subscription) ||
                            migrationPreview.subscription ||
                            '—'}
                        </div>
                        <div>
                          انتهاء:{' '}
                          {formatDateDDMMYYYY(migrationPreview.expiration) ||
                            migrationPreview.expiration ||
                            '—'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-amber-800 dark:text-amber-200">
                        لا يوجد في المزامنة تاريخ بداية أو انتهاء صالح — يمكنك إكمال الحقول يدوياً أدناه.
                      </div>
                    )}
                  </div>
                )}
                {importFieldsFromFtth.subscriptionDates && (
                  <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-600 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      تواريخ الترحيل — تحديث تلقائي بين الحقول
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      عند تغيير أي حقل تُحدَّث البقية فوراً. العرض بالتقويم DD/MM/YYYY. المدة: إزاحة تقويمية
                      (مثل 30 يوماً من البداية). الأيام المتبقية تُحسب من الانتهاء (موجبة للمستقبل، سالبة بعد
                      الانتهاء). عند ترك تاريخ واحد فقط يُرسل للخادم مع المدة المختارة.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          تاريخ الاشتراك
                        </label>
                        <input
                          type="date"
                          className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700"
                          dir="ltr"
                          value={impSubscriptionDate}
                          onChange={(e) => applyImpSubscription(e.target.value)}
                        />
                        <div className="text-[10px] text-slate-500 mt-0.5 font-mono" dir="ltr">
                          {formatDateDDMMYYYY(impSubscriptionDate) || '—'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          تاريخ الانتهاء
                        </label>
                        <input
                          type="date"
                          className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700"
                          dir="ltr"
                          value={impExpirationDate}
                          onChange={(e) => applyImpExpiration(e.target.value)}
                        />
                        <div className="text-[10px] text-slate-500 mt-0.5 font-mono" dir="ltr">
                          {formatDateDDMMYYYY(impExpirationDate) || '—'}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          مدة الاشتراك (أيام تقويمية)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={3660}
                          dir="ltr"
                          className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700"
                          value={impSpanDaysStr}
                          onChange={(e) => applyImpSpan(e.target.value)}
                        />
                      </div>
                      <div>
                        <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          نوع المدة
                        </span>
                        <div className="flex flex-wrap gap-3 text-[11px] text-slate-700 dark:text-slate-200">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="impDurationMode"
                              checked={impDurationMode === 'calendar_days'}
                              onChange={() => applyImpDurationMode('calendar_days')}
                            />
                            حسب الأيام
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="impDurationMode"
                              checked={impDurationMode === 'one_calendar_month'}
                              onChange={() => applyImpDurationMode('one_calendar_month')}
                            />
                            شهر تقويمي واحد
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-md bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 p-2 text-[11px] text-slate-700 dark:text-slate-200 space-y-1">
                      <div className="font-semibold text-slate-800 dark:text-slate-100">ملخص فوري</div>
                      <div dir="ltr" className="font-mono">
                        أيام (شاملة البداية والنهاية):{' '}
                        {impDateBlock.inclusiveDays !== null ? impDateBlock.inclusiveDays : '—'}
                      </div>
                      <div dir="ltr" className="font-mono">
                        الأيام المتبقية حتى الانتهاء:{' '}
                        {impDateBlock.remaining === null
                          ? '—'
                          : impDateBlock.remaining < 0
                            ? `${impDateBlock.remaining} (منتهٍ)`
                            : impDateBlock.remaining}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  الاسم الحقيقي (اختياري)
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  يُترك عادةً فارغاً: اسم FTTH يُرحَّل إلى «الاسم في الوطني» فقط. عند الحاجة أدخل الاسم الحقيقي هنا أو لاحقاً من تعديل المشترك. الرمز{' '}
                  <code className="font-mono">user_code</code> يُبنى من الاسم الوطني + المنطقة + الهاتف.
                </p>
                <input
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="اتركه فارغاً إن كنت ستعدّل الاسم لاحقاً"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">الهاتف</label>
                <input
                  dir="ltr"
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                  value={impPhone}
                  onChange={(e) => setImpPhone(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">منطقة</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                    value={impZone}
                    onChange={(e) => setImpZone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">FAT</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                    value={impFat}
                    onChange={(e) => setImpFat(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  العنوان (من FTTH)
                </label>
                <textarea
                  rows={2}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                  value={impLocation}
                  onChange={(e) => setImpLocation(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">فئة</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                    value={impCategory}
                    onChange={(e) => setImpCategory(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">سعر الفئة (د.ع)</label>
                  <input
                    type="number"
                    dir="ltr"
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700"
                    value={impCategoryPrice}
                    onChange={(e) => setImpCategoryPrice(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-600"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={importLoading}
                  className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white disabled:opacity-50"
                >
                  {importLoading ? 'جاري الترحيل...' : 'ترحيل إلى المشتركين'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {logoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <LogOut size={20} className="text-amber-600" />
                تسجيل خروج من بوابة FTTH
              </h3>
              <button
                type="button"
                onClick={() => setLogoutModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
                disabled={logoutLoading}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <p>
                سيتم حذف بيانات الاعتماد المحفوظة للموقع الحالي. عند فتح صفحة إنترنت أخرى أو ربط بوابة مختلفة، ستحتاج
                إلى إدخال رابط تسجيل الدخول واسم المستخدم وكلمة المرور من جديد.
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={logoutClearStaged}
                  onChange={(e) => setLogoutClearStaged(e.target.checked)}
                  disabled={logoutLoading}
                />
                <span>
                  مسح أيضاً المشتركين المخزّنين مؤقتاً في جدول البوابة (البيانات التي جُلبت من الموقع الخارجي ولم تُرحَّل
                  بعد).
                </span>
              </label>
            </div>
            <div className="flex gap-2 justify-end p-4 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setLogoutModalOpen(false)}
                disabled={logoutLoading}
                className="px-4 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-600"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                disabled={logoutLoading}
                className="px-4 py-2 rounded-lg text-sm bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
              >
                {logoutLoading ? 'جاري التنفيذ...' : 'تأكيد تسجيل الخروج'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
