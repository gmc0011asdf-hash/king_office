import { getApiBaseUrl } from '@/api/client';

export const subscribersImportExportApi = {
  exportExcel: async (): Promise<Blob> => {
    const token = (await import('@/utils/authStorage')).authStorage.getToken?.();
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/subscribers/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('فشل التصدير');
    return res.blob();
  },

  importExcel: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = (await import('@/utils/authStorage')).authStorage.getToken?.();
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/subscribers/import`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (ct.includes('application/json')) {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody?.detail;
        const msg =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join(' — ') || 'فشل الاستيراد'
              : 'فشل الاستيراد';
        throw new Error(msg);
      }
      const raw = await res.text();
      const trimmed = raw.trim().slice(0, 120);
      const looksBinary = /[\x00-\x08\x0e-\x1f]/.test(trimmed) || trimmed.startsWith('PK');
      throw new Error(
        looksBinary
          ? `استجابة غير متوقعة من الخادم (${getApiBaseUrl()}). تحقق من عنوان الـ API والجلسة وليس ملفاً ثنائياً.`
          : trimmed || `فشل الاستيراد (HTTP ${res.status})`,
      );
    }
    if (!ct.includes('application/json')) {
      throw new Error('الخادم لم يُرجع JSON. تحقق من عنوان الـ API والجلسة.');
    }
    return res.json();
  },
};
