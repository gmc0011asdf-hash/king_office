import { ApiRequestError, fetchApi, getApiBaseUrl } from '@/api/client';
import type { InternetPhone, InternetPhoneStats } from '../page/components/types';

const mapPhone = (item: any): InternetPhone => ({
  id: item.id,
  sequence: Number(item.sequence ?? 0),
  name: item.name ?? '',
  phone_number: item.phone_number ?? item.phoneNumber ?? '',
  last_promo_msg_date: item.last_promo_msg_date ?? null,
});

export const internetPhonesApi = {
  getAll: async (params?: { skip?: number; limit?: number; search?: string }) => {
    const search = new URLSearchParams();
    if (params?.skip != null) search.set('skip', String(params.skip));
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.search) search.set('search', params.search);
    const suffix = search.toString() ? `?${search.toString()}` : '';
    const data = await fetchApi<any[]>(`/api/internet/phones${suffix}`);
    return (Array.isArray(data) ? data : []).map(mapPhone);
  },

  getStats: async (): Promise<InternetPhoneStats> => {
    const data = await fetchApi<any>('/api/internet/phones/stats');
    return {
      total: Number(data?.total ?? 0),
      unique_prefixes: Number(data?.unique_prefixes ?? 0),
    };
  },

  create: async (data: { sequence?: number; name?: string; phone_number: string }) =>
    mapPhone(await fetchApi('/api/internet/phones', {
      method: 'POST',
      body: JSON.stringify({
        sequence: data.sequence ?? 0,
        name: data.name ?? null,
        phone_number: data.phone_number,
      }),
    })),

  update: async (id: number, data: { sequence?: number; name?: string; phone_number?: string }) =>
    mapPhone(await fetchApi(`/api/internet/phones/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })),

  delete: (id: number) =>
    fetchApi(`/api/internet/phones/${id}`, { method: 'DELETE' }),

  /** تحديث كل الأرقام المحفوظة في DB إلى صيغة 077/078 (إضافة 0 عند الحاجة) */
  normalizeStored: async (): Promise<{
    updated: number;
    skipped_count: number;
    skipped: string[];
    message: string;
  }> => {
    const body = JSON.stringify({});
    const paths = [
      '/api/internet/phone-directory/normalize-stored',
      '/api/internet/phones/normalize-stored',
    ];
    let last: ApiRequestError | null = null;
    for (const path of paths) {
      try {
        const data = await fetchApi<any>(path, { method: 'POST', body });
        return {
          updated: Number(data?.updated ?? 0),
          skipped_count: Number(data?.skipped_count ?? 0),
          skipped: Array.isArray(data?.skipped) ? data.skipped : [],
          message: String(data?.message ?? ''),
        };
      } catch (e) {
        if (e instanceof ApiRequestError && (e.status === 404 || e.status === 405)) {
          last = e;
          continue;
        }
        throw e;
      }
    }
    throw last ?? new ApiRequestError('تعذّر تصحيح الأرقام', 0);
  },

  importExcel: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = (await import('@/utils/authStorage')).authStorage.getToken?.();
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/internet/phones/import`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail ?? 'فشل الاستيراد');
    return data;
  },

  exportExcel: async (): Promise<Blob> => {
    const token = (await import('@/utils/authStorage')).authStorage.getToken?.();
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/internet/phones/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('فشل التصدير');
    return res.blob();
  },

  markPromoNotified: (id: number) =>
    fetchApi(`/api/internet/phones/${id}/mark-promo-notified`, { method: 'POST' }),
};
