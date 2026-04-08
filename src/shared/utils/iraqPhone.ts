/** تطبيع أرقام الجوال العراقي: 11 رقمًا، 077 أو 078. يُضاف 0 إن وُجد 77/78 بدون الصفر. */

export const IRAQ_PHONE_HINT_AR =
  'رقم الهاتف يجب أن يكون 11 رقمًا بالضبط ويبدأ بـ 077 أو 078 (مثال: 07701234567). يُضاف الصفر تلقائيًا إن أدخلت الرقم بدون 0 في البداية.';

export function normalizeIraqMobile(raw: string | null | undefined): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('964')) d = d.slice(3);
  d = d.replace(/^0+/, '');
  if (d.length === 10 && (d.startsWith('77') || d.startsWith('78'))) {
    return `0${d}`;
  }
  return /^07[78]\d{8}$/.test(d) ? d : null;
}

/** حقل إلزامي */
export function requireIraqMobile(raw: string | null | undefined): string {
  const sIn = String(raw ?? '').trim();
  if (!sIn) throw new Error(IRAQ_PHONE_HINT_AR);
  const n = normalizeIraqMobile(sIn);
  if (!n) throw new Error(IRAQ_PHONE_HINT_AR);
  return n;
}

/** اختياري: فارغ = null */
export function normalizeIraqMobileOptional(raw: string | null | undefined): string | null {
  const sIn = String(raw ?? '').trim();
  if (!sIn) return null;
  const n = normalizeIraqMobile(sIn);
  if (!n) throw new Error(IRAQ_PHONE_HINT_AR);
  return n;
}
