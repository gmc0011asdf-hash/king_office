/**
 * معاينة تواريخ الترحيل في الواجهة فقط — المرجع النهائي للمنطق هو الخادم (ftth_dates / API).
 * مسار بوابة FTTH: شهر = 30 يوماً تقويمياً (وليس «شهراً تقويمياً») ما لم يُختر وضع الشهر في النموذج.
 * - expiration: أولوية لتاريخ الانتهاء من FTTH → اشتراك = انتهاء − span
 * - start: أولوية لتاريخ البداية → انتهاء = بداية + span
 */
import { addLocalDays, formatLocalDate, parseLocalDate } from '@/utils/subscriptionDates';

export type FtthDateAnchor = 'expiration' | 'start';

export function resolveFtthMigrationDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  anchor: FtthDateAnchor,
  spanDays: number = 30,
): { subscription: string | null; expiration: string | null } {
  const SPAN = spanDays;
  const hasStart = !!(startDate && String(startDate).trim());
  const hasEnd = !!(endDate && String(endDate).trim());

  if (anchor === 'start') {
    if (hasStart) {
      const s = parseLocalDate(startDate!.trim());
      return {
        subscription: formatLocalDate(s),
        expiration: formatLocalDate(addLocalDays(s, SPAN)),
      };
    }
    if (hasEnd) {
      const e = parseLocalDate(endDate!.trim());
      return {
        subscription: formatLocalDate(addLocalDays(e, -SPAN)),
        expiration: formatLocalDate(e),
      };
    }
  } else {
    if (hasEnd) {
      const e = parseLocalDate(endDate!.trim());
      return {
        subscription: formatLocalDate(addLocalDays(e, -SPAN)),
        expiration: formatLocalDate(e),
      };
    }
    if (hasStart) {
      const s = parseLocalDate(startDate!.trim());
      return {
        subscription: formatLocalDate(s),
        expiration: formatLocalDate(addLocalDays(s, SPAN)),
      };
    }
  }
  return { subscription: null, expiration: null };
}
