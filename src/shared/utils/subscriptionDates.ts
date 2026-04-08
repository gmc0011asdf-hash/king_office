/** تواريخ محلية YYYY-MM-DD بدون انزياح المنطقة الزمنية */

const MS_PER_DAY = 86400000;

/**
 * مدة الاشتراك/التجديد: 30 يوماً تقويمياً شاملاً ليوم البدء ويوم الانتهاء
 * (مثال: من 1 إلى 30 من الشهر = 30 أيام) ⇒ إزاحة التقويم من تاريخ البداية = 29.
 */
export const SUBSCRIPTION_PERIOD_CALENDAR_OFFSET = 29;

/** YYYY-MM-DD أو بادئة ISO من الخادم (مثل 2026-03-19T00:00:00) */
export function parseLocalDate(dateStr: string): Date {
  const s = String(dateStr ?? '').trim();
  if (!s) return new Date(NaN);
  const dayPart = s.slice(0, 10);
  const parts = dayPart.split('-');
  if (parts.length < 3) return new Date(NaN);
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date(NaN);
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return new Date(NaN);
  return dt;
}

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** من start إلى end شاملاً لكلا التاريخين */
export function inclusiveDaysBetween(start: Date, end: Date): number {
  const s = startOfLocalDay(start).getTime();
  const e = startOfLocalDay(end).getTime();
  if (e < s) return 0;
  return Math.floor((e - s) / MS_PER_DAY) + 1;
}

export function addLocalDays(base: Date, days: number): Date {
  const d = startOfLocalDay(base);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * فرق تقويمي: بداية يوم الانتهاء − بداية اليوم (أو asOf).
 * مستقبل: موجب، اليوم: 0، ماضي: سالب — بدون خطأ ±يوم من الحساب الشامل.
 */
export function remainingCalendarDaysUntil(
  expirationDate: string | undefined | null,
  asOf: Date = new Date(),
): number | null {
  if (expirationDate == null || !String(expirationDate).trim()) return null;
  const exp = startOfLocalDay(parseLocalDate(String(expirationDate).trim()));
  if (Number.isNaN(exp.getTime())) return null;
  const today = startOfLocalDay(asOf);
  return Math.round((exp.getTime() - today.getTime()) / MS_PER_DAY);
}

/** نفس remainingCalendarDaysUntil؛ عند غياب التاريخ يُرجع 0 لتوافق الفلاتر القديمة */
export function calculateRemainingDays(expirationDate: string | undefined): number {
  return remainingCalendarDaysUntil(expirationDate) ?? 0;
}

export function subscriberDisplayStatus(expirationDate: string | undefined): 'نشط' | 'منتهي' {
  const r = remainingCalendarDaysUntil(expirationDate);
  if (r === null) return 'منتهي';
  return r >= 0 ? 'نشط' : 'منتهي';
}

/** ملخص عرض للجدول والتفاصيل */
export function formatRemainingDaysLabel(expirationDate: string | undefined | null): string {
  const r = remainingCalendarDaysUntil(expirationDate);
  if (r === null) return '—';
  if (r < 0) return `${r} يوم`;
  if (r === 0) return 'اليوم';
  return `${r} يوم`;
}

/**
 * دالة موحّدة: من تاريخي اشتراك/انتهاء يُرجع المدة التقويمية، الشاملة، والمتبقية.
 */
export function calculateSubscriptionDates(args: {
  subscriptionIso: string;
  expirationIso: string;
  asOf?: Date;
}): {
  spanCalendarDays: number | null;
  inclusiveTotalDays: number | null;
  remainingCalendarDays: number | null;
} {
  const subS = args.subscriptionIso?.trim() ?? '';
  const expS = args.expirationIso?.trim() ?? '';
  const sub = subS ? parseLocalDate(subS) : null;
  const exp = expS ? parseLocalDate(expS) : null;
  const subOk = sub && !Number.isNaN(sub.getTime());
  const expOk = exp && !Number.isNaN(exp.getTime());
  let spanCalendarDays: number | null = null;
  let inclusiveTotalDays: number | null = null;
  if (subOk && expOk && exp!.getTime() >= sub!.getTime()) {
    const s = startOfLocalDay(sub!);
    const e = startOfLocalDay(exp!);
    spanCalendarDays = Math.round((e.getTime() - s.getTime()) / MS_PER_DAY);
    inclusiveTotalDays = inclusiveDaysBetween(sub!, exp!);
  }
  const remainingCalendarDays = expS ? remainingCalendarDaysUntil(expS, args.asOf) : null;
  return { spanCalendarDays, inclusiveTotalDays, remainingCalendarDays };
}

/** تاريخ انتهاء بعد التجديد: 30 يوم خدمة + الأيام المحمولة (إن وُجدت) */
export function computeRenewalExpirationDate(
  renewalDateStr: string,
  subscriber: { expirationDate?: string },
): string {
  const renewalLocal = startOfLocalDay(parseLocalDate(renewalDateStr));
  const currentExp = subscriber.expirationDate
    ? startOfLocalDay(parseLocalDate(subscriber.expirationDate))
    : null;
  let carryDays = 0;
  if (currentExp && currentExp.getTime() >= renewalLocal.getTime()) {
    carryDays = inclusiveDaysBetween(renewalLocal, currentExp);
  }
  return formatLocalDate(addLocalDays(renewalLocal, SUBSCRIPTION_PERIOD_CALENDAR_OFFSET + carryDays));
}
