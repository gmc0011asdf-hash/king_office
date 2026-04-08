/**
 * حسابات وتواريخ FTTH Connector — معزولة لإعادة الاستخدام.
 * يعتمد على تواريخ محلية (تقويم) بدون UTC drift لصيغة YYYY-MM-DD.
 *
 * بوابة FTTH (مزامنة/ترحيل): القاعدة الموحدة على الخادم هي أيام تقويمية ثابتة
 * (شهر=30، …) عبر `commitment_days`؛ هذا الملف للعرض/النماذج — لا يُعارض استجابة الـ API.
 */
import {
  addLocalDays,
  formatLocalDate,
  inclusiveDaysBetween,
  parseLocalDate,
  startOfLocalDay,
} from '@/utils/subscriptionDates';

export const FTTH_DEFAULT_SPAN_DAYS = 30;

export type FtthDurationMode = 'calendar_days' | 'one_calendar_month';

const MS_PER_DAY = 86400000;

/** تحليل مرن: YYYY-MM-DD، DD/MM/YYYY، DD-MM-YYYY، وبادئة ISO */
export function parseFtthDate(value: string | null | undefined): Date | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
      if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
    }
    return null;
  }

  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
      if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
    }
    return null;
  }

  const t = Date.parse(raw);
  if (!Number.isNaN(t)) {
    const dt = new Date(t);
    return startOfLocalDay(dt);
  }

  return null;
}

/** YYYY-MM-DD للحقول type="date" أو فارغ */
export function toIsoDateString(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return formatLocalDate(startOfLocalDay(value));
  }
  const d = parseFtthDate(value);
  return d ? formatLocalDate(d) : '';
}

/** عرض DD/MM/YYYY */
export function formatDateDDMMYYYY(value: string | Date | null | undefined): string {
  const d = value instanceof Date ? (Number.isNaN(value.getTime()) ? null : startOfLocalDay(value)) : parseFtthDate(value);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** نفس منطق الخادم: إزاحة تقويمية من البداية (مثال: +30 يوماً) */
export function calculateEndDate(startDate: Date, durationDays: number): Date {
  return addLocalDays(startDate, durationDays);
}

export function calculateStartDate(endDate: Date, durationDays: number): Date {
  return addLocalDays(endDate, -durationDays);
}

/** عدد الأيام بين التاريخين شاملاً ليومي البداية والنهاية */
export function calculateTotalDaysInclusive(startDate: Date, endDate: Date): number {
  return inclusiveDaysBetween(startDate, endDate);
}

/**
 * فرق تقويمي بسيط بين بداية ونهاية (غير شامل): يناسب حقل «مدة» بمحاذاة FTTH +30
 * مثال: 1 آذار → 31 آذار = 30
 */
export function calendarSpanDays(startDate: Date, endDate: Date): number {
  const s = startOfLocalDay(startDate).getTime();
  const e = startOfLocalDay(endDate).getTime();
  return Math.round((e - s) / MS_PER_DAY);
}

/**
 * متبقٍ حتى الانتهاء: مستقبل موجب، اليوم 0، منتهٍ سالب
 */
export function calculateRemainingDaysSigned(
  endDate: string | Date | null | undefined,
  today: Date = new Date(),
): number | null {
  const e = endDate instanceof Date ? startOfLocalDay(endDate) : parseFtthDate(endDate ?? '');
  if (!e) return null;
  const t = startOfLocalDay(today);
  return Math.round((e.getTime() - t.getTime()) / MS_PER_DAY);
}

export function addCalendarMonths(base: Date, deltaMonths: number): Date {
  const d = startOfLocalDay(base);
  const day = d.getDate();
  d.setMonth(d.getMonth() + deltaMonths);
  if (d.getDate() < day) d.setDate(0);
  return startOfLocalDay(d);
}

export interface FtthImportDateFields {
  subscriptionIso: string;
  expirationIso: string;
  spanDaysStr: string;
  durationMode: FtthDurationMode;
}

function clampSpan(n: number): number {
  return Math.min(3660, Math.max(1, Math.floor(n)));
}

function parseSpanInput(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return null;
  return clampSpan(n);
}

/**
 * مزامنة حقول نموذج الترحيل بعد تغيير أحد المدخلات (اشتراك / انتهاء / مدة / وضع الشهر).
 */
export function syncFtthImportDateFields(
  prev: FtthImportDateFields,
  source: 'subscription' | 'expiration' | 'span' | 'mode' | 'reset',
  payload: Partial<FtthImportDateFields> & { defaultSpanDays?: number },
): FtthImportDateFields {
  const defaultSpan = payload.defaultSpanDays ?? FTTH_DEFAULT_SPAN_DAYS;

  if (source === 'reset') {
    const subscriptionIso = (payload.subscriptionIso ?? '').trim();
    const expirationIso = (payload.expirationIso ?? '').trim();
    const durationMode = payload.durationMode ?? 'calendar_days';
    const sd = subscriptionIso ? parseLocalDate(subscriptionIso) : null;
    const ed = expirationIso ? parseLocalDate(expirationIso) : null;
    let spanDaysStr = String(defaultSpan);
    if (sd && ed) {
      const sp = calendarSpanDays(sd, ed);
      if (sp >= 1) spanDaysStr = String(clampSpan(sp));
    }
    return { subscriptionIso, expirationIso, spanDaysStr, durationMode };
  }

  const next: FtthImportDateFields = {
    subscriptionIso: (payload.subscriptionIso ?? prev.subscriptionIso).trim(),
    expirationIso: (payload.expirationIso ?? prev.expirationIso).trim(),
    spanDaysStr: payload.spanDaysStr ?? prev.spanDaysStr,
    durationMode: payload.durationMode ?? prev.durationMode,
  };

  const sub = next.subscriptionIso ? parseLocalDate(next.subscriptionIso) : null;
  const exp = next.expirationIso ? parseLocalDate(next.expirationIso) : null;
  let spanNum = parseSpanInput(next.spanDaysStr);

  if (source === 'subscription') {
    if (!sub) return { ...next, subscriptionIso: '' };
    if (next.durationMode === 'one_calendar_month') {
      const end = addCalendarMonths(sub, 1);
      return {
        ...next,
        expirationIso: formatLocalDate(end),
        spanDaysStr: String(clampSpan(calendarSpanDays(sub, end))),
      };
    }
    if (spanNum != null) {
      return {
        ...next,
        expirationIso: formatLocalDate(calculateEndDate(sub, spanNum)),
      };
    }
    if (exp) {
      if (exp.getTime() >= sub.getTime()) {
        const sp = calendarSpanDays(sub, exp);
        return {
          ...next,
          spanDaysStr: sp >= 1 ? String(clampSpan(sp)) : String(defaultSpan),
          expirationIso: formatLocalDate(exp),
        };
      }
      const sp = spanNum ?? defaultSpan;
      return {
        ...next,
        spanDaysStr: String(sp),
        expirationIso: formatLocalDate(calculateEndDate(sub, sp)),
      };
    }
    const sp = defaultSpan;
    return {
      ...next,
      spanDaysStr: String(sp),
      expirationIso: formatLocalDate(calculateEndDate(sub, sp)),
    };
  }

  if (source === 'expiration') {
    if (!exp) return { ...next, expirationIso: '' };
    if (next.durationMode === 'one_calendar_month') {
      const start = addCalendarMonths(exp, -1);
      return {
        ...next,
        subscriptionIso: formatLocalDate(start),
        spanDaysStr: String(clampSpan(calendarSpanDays(start, exp))),
      };
    }
    if (spanNum != null) {
      return {
        ...next,
        subscriptionIso: formatLocalDate(calculateStartDate(exp, spanNum)),
      };
    }
    if (sub) {
      if (exp.getTime() >= sub.getTime()) {
        const sp = calendarSpanDays(sub, exp);
        return {
          ...next,
          spanDaysStr: sp >= 1 ? String(clampSpan(sp)) : String(defaultSpan),
        };
      }
      const sp = spanNum ?? defaultSpan;
      return {
        ...next,
        spanDaysStr: String(sp),
        subscriptionIso: formatLocalDate(calculateStartDate(exp, sp)),
      };
    }
    const sp = defaultSpan;
    return {
      ...next,
      spanDaysStr: String(sp),
      subscriptionIso: formatLocalDate(calculateStartDate(exp, sp)),
    };
  }

  if (source === 'span') {
    spanNum = parseSpanInput(next.spanDaysStr);
    if (spanNum == null) return next;
    if (sub) {
      return { ...next, expirationIso: formatLocalDate(calculateEndDate(sub, spanNum)) };
    }
    if (exp) {
      return { ...next, subscriptionIso: formatLocalDate(calculateStartDate(exp, spanNum)) };
    }
    return next;
  }

  if (source === 'mode') {
    if (next.durationMode === 'one_calendar_month') {
      if (sub) {
        const end = addCalendarMonths(sub, 1);
        return {
          ...next,
          expirationIso: formatLocalDate(end),
          spanDaysStr: String(clampSpan(calendarSpanDays(sub, end))),
        };
      }
      if (exp) {
        const start = addCalendarMonths(exp, -1);
        return {
          ...next,
          subscriptionIso: formatLocalDate(start),
          spanDaysStr: String(clampSpan(calendarSpanDays(start, exp))),
        };
      }
      return next;
    }
    spanNum = parseSpanInput(next.spanDaysStr) ?? defaultSpan;
    if (sub) {
      return {
        ...next,
        spanDaysStr: String(spanNum),
        expirationIso: formatLocalDate(calculateEndDate(sub, spanNum)),
      };
    }
    if (exp) {
      return {
        ...next,
        spanDaysStr: String(spanNum),
        subscriptionIso: formatLocalDate(calculateStartDate(exp, spanNum)),
      };
    }
    return { ...next, spanDaysStr: String(spanNum) };
  }

  return next;
}

/** Mapping توضيحي: صف FTTH الوسيط → حقول المشترك المحلي عند الترحيل */
/** أسماء بديلة واضحة للاستخدام العام */
export const parseDate = parseFtthDate;
export function formatDate(value: string | Date | null | undefined): string {
  return formatDateDDMMYYYY(value);
}

export const FTTH_TO_SUBSCRIBER_DATE_MAP = {
  /** من المزامنة الخام */
  ftth_start_date: 'start_date (جدول FTTH الوسيط)',
  ftth_end_date: 'end_date (جدول FTTH الوسيط)',
  /** بعد قاعدة المرجع ±span في المعاينة */
  resolved_subscription: 'resolved_subscription_date (معاينة API)',
  resolved_expiration: 'resolved_expiration_date (معاينة API)',
  /** ما يُحفظ في المشترك */
  subscriber_subscription_date: 'subscription_date',
  subscriber_expiration_date: 'expiration_date',
  subscriber_status: 'status (من الانتهاء إن فُعّل الخيار)',
} as const;
