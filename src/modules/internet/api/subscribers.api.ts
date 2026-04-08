import { fetchApi, fetchApiWithTrace } from '@/api/client';
import { mergeSubscribersWithHistory } from '@/utils/subscriberListMerge';

const mapHistoryPayload = (data: any) => ({
  subscriber_id: data.subscriber_id ?? data.subscriberId,
  type: data.type,
  amount: Number(data.amount ?? 0),
  description: data.description ?? '',
});

export const subscribersApi = {
  getAll: () => fetchApi('/api/subscribers'),
  /** مشترك واحد من الـ API + السجل — أساس ثابت لصفحة التفاصيل */
  getById: async (id: number) => {
    const [sub, hist] = await Promise.all([
      fetchApi(`/api/subscribers/${id}`),
      subscribersApi.getHistory(id).catch(() => []),
    ]);
    const merged = mergeSubscribersWithHistory([sub], hist);
    return (merged[0] ?? sub) as unknown;
  },
  create: (data: any) => fetchApi('/api/subscribers', { method: 'POST', body: JSON.stringify(data) }),
  createTracked: (data: any) => fetchApiWithTrace('/api/subscribers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => fetchApi(`/api/subscribers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateTracked: (id: number, data: any) => fetchApiWithTrace(`/api/subscribers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => fetchApi(`/api/subscribers/${id}`, { method: 'DELETE' }),
  getHistory: (subscriberId?: number | null) => {
    const suffix = subscriberId ? `?subscriber_id=${subscriberId}` : '';
    return fetchApi(`/api/subscriber-history${suffix}`);
  },
  createHistory: (data: any) => fetchApi('/api/subscriber-history', {
    method: 'POST',
    body: JSON.stringify(mapHistoryPayload(data)),
  }),

  getDebtSummary: (subscriberId: number) =>
    fetchApi(`/api/subscribers/${subscriberId}/debt-summary`),

  addDebtEntry: (
    subscriberId: number,
    body: { amount: number; debtDate: string; description?: string; debtScope: 'current' | 'previous' },
  ) =>
    fetchApi(`/api/subscribers/${subscriberId}/debt-entries`, {
      method: 'POST',
      body: JSON.stringify({
        amount: body.amount,
        debtDate: body.debtDate,
        description: body.description ?? '',
        debtScope: body.debtScope,
      }),
    }),

  patchDebtEntry: (
    subscriberId: number,
    entryId: number,
    body: { debtDate?: string; description?: string },
    rollToPrevious?: boolean,
  ) => {
    const q = rollToPrevious ? '?rollToPrevious=true' : '';
    return fetchApi(`/api/subscribers/${subscriberId}/debt-entries/${entryId}${q}`, {
      method: 'PATCH',
      body: JSON.stringify(body ?? {}),
    });
  },

  settleDebtEntry: (
    subscriberId: number,
    entryId: number,
    body: { amount: number; paymentDate: string; description?: string },
  ) =>
    fetchApi(`/api/subscribers/${subscriberId}/debt-entries/${entryId}/settle`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** تسديد مبلغ من إجمالي الدين (FIFO عبر السجلات المفتوحة) */
  payDebt: (
    subscriberId: number,
    body: { amount: number; paymentDate: string; description?: string },
  ) =>
    fetchApi(`/api/subscribers/${subscriberId}/pay-debt`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
