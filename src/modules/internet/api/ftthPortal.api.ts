import { fetchApi } from '@/api/client';
import type {
  FtthExternalRow,
  FtthPortalCustomerRow,
  FtthPortalStatus,
} from '@/modules/internet/page/components/types';

export interface FtthSetupPayload {
  login_url: string;
  username: string;
  password: string;
  list_url?: string;
  parse_mode?: string;
  parse_options?: Record<string, unknown>;
}

export interface FtthSyncResult {
  new_count: number;
  updated_count: number;
  pages_fetched: number;
  message: string;
}

export interface FtthExternalStats {
  total: number;
  imported: number;
  pending: number;
}

export interface FtthSubscriberSyncResult {
  ok: boolean;
  subscriber_id: number;
  external_id: string;
  status: string | null;
  expiration_date: string | null;
  updated_fields: Record<string, string>;
  message: string;
}

export interface FtthImportedSubscriberLink {
  /** يوجد سجل وسيط FTTH يشير إلى هذا المشترك المحلي */
  linked: boolean;
  externalId?: string | null;
  detailUrl?: string | null;
}

export const ftthPortalApi = {
  getStatus: (): Promise<FtthPortalStatus> => fetchApi<FtthPortalStatus>('/api/ftth/portal/status'),

  setup: (body: FtthSetupPayload): Promise<FtthPortalStatus> =>
    fetchApi<FtthPortalStatus>('/api/ftth/portal/setup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  sync: (): Promise<FtthSyncResult> =>
    fetchApi<FtthSyncResult>('/api/ftth/portal/sync', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  /** تسجيل خروج من البوابة: حذف الاعتمادات؛ اختيارياً مسح الجدول الوسيط */
  logout: (clearStagedData = true): Promise<FtthPortalStatus> =>
    fetchApi<FtthPortalStatus>('/api/ftth/portal/logout', {
      method: 'POST',
      body: JSON.stringify({ clear_staged_data: clearStagedData }),
    }),

  getExternalStats: (): Promise<FtthExternalStats> =>
    fetchApi<FtthExternalStats>('/api/ftth/portal/external-stats'),

  /** مزامنة مشترك واحد من بوابة FTTH بمعرّفه المحلي */
  syncSubscriber: (subscriberId: number): Promise<FtthSubscriberSyncResult> =>
    fetchApi<FtthSubscriberSyncResult>(`/api/ftth/portal/sync/${subscriberId}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  /** رابط تفاصيل المشترك في admin.ftth.iq إن وُجد ترحيل من البوابة */
  getImportedSubscriberLink: (subscriberId: number): Promise<FtthImportedSubscriberLink> =>
    fetchApi<FtthImportedSubscriberLink>(`/api/ftth/portal/imported-subscriber-link/${subscriberId}`),

  getExternalData: (params?: {
    skip?: number;
    limit?: number;
    search?: string;
    status?: string;
    notImportedOnly?: boolean;
  }): Promise<FtthExternalRow[]> => {
    const sp = new URLSearchParams();
    if (params?.skip != null) sp.set('skip', String(params.skip));
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.search) sp.set('search', params.search);
    if (params?.status) sp.set('status', params.status);
    if (params?.notImportedOnly) sp.set('notImportedOnly', 'true');
    const q = sp.toString();
    return fetchApi<FtthExternalRow[]>(`/api/ftth/portal/external-data${q ? `?${q}` : ''}`);
  },

  /** قائمة من جدول ftth_customers (العرض المحلي المنظّف) */
  getPortalCustomers: (params?: {
    skip?: number;
    limit?: number;
    search?: string;
    status?: string;
    notImportedOnly?: boolean;
  }): Promise<FtthPortalCustomerRow[]> => {
    const sp = new URLSearchParams();
    if (params?.skip != null) sp.set('skip', String(params.skip));
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.search) sp.set('search', params.search);
    if (params?.status) sp.set('status', params.status);
    if (params?.notImportedOnly) sp.set('notImportedOnly', 'true');
    const q = sp.toString();
    return fetchApi<FtthPortalCustomerRow[]>(`/api/ftth/portal/customers${q ? `?${q}` : ''}`);
  },

  /** تفاصيل سجل واحد من ftth_customers */
  getPortalCustomerDetail: (externalCustomerId: string): Promise<FtthPortalCustomerRow> =>
    fetchApi<FtthPortalCustomerRow>(
      `/api/ftth/portal/customers/${encodeURIComponent(String(externalCustomerId).trim())}`,
    ),

  /** تفاصيل عميل FTTH حسب المعرف الخارجي (قاعدة أو جلب مباشر بصلاحية البوابة) */
  getExternalCustomerByExternalId: (externalId: string): Promise<FtthExternalRow> =>
    fetchApi<FtthExternalRow>(
      `/api/ftth/portal/external-customer/${encodeURIComponent(String(externalId).trim())}`,
    ),

  importToSubscriber: (body: {
    ftthRowId: number;
    /** إن تُرك أو أُرسل فارغاً يمكن للخادم استخدام الاسم من سجل FTTH */
    realName?: string;
    phone?: string;
    zone?: string;
    fat?: string;
    location?: string;
    category?: string;
    categoryPrice?: number;
    /** YYYY-MM-DD — يدوي؛ إن وُضع أحدهما فقط يُحسب الآخر باستخدام subscriptionSpanDays أو 30 */
    subscriptionDateOverride?: string;
    expirationDateOverride?: string;
    /** عند وجود تاريخ واحد فقط: عدد الأيام التقويمية للفترة (1–3660) */
    subscriptionSpanDays?: number;
    updateExisting?: boolean;
    /** اختيار الحقول المنسوخة من جدول FTTH */
    fieldsFromFtth?: {
      phone?: boolean;
      zone?: boolean;
      fat?: boolean;
      location?: boolean;
      nationalIdName?: boolean;
      subscriptionDates?: boolean;
      ftthDateAnchor?: 'expiration' | 'start';
      subscriberStatus?: boolean;
      serviceUsernameInDescription?: boolean;
    };
  }) => fetchApi<unknown>('/api/ftth/portal/import-to-subscriber', { method: 'POST', body: JSON.stringify(body) }),

  importAllPending: (body?: {
    limit?: number;
    fieldsFromFtth?: {
      phone?: boolean;
      zone?: boolean;
      fat?: boolean;
      location?: boolean;
      nationalIdName?: boolean;
      subscriptionDates?: boolean;
      ftthDateAnchor?: 'expiration' | 'start';
      subscriberStatus?: boolean;
      serviceUsernameInDescription?: boolean;
    };
  }): Promise<{ imported: number; failed: number; errors: { ftth_row_id?: number; external_id?: string; detail?: string }[] }> =>
    fetchApi('/api/ftth/portal/import-all-pending', {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
};
