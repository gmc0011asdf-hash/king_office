import { fetchApi } from '@/api/client';

export interface ExpiringSubscriber {
  id: number;
  real_name: string | null;
  user_code: string | null;
  phone: string | null;
  expiration_date: string | null;
  remaining_days: number;
}

export interface MarkNotifiedResponse {
  ok: boolean;
  subscriber_id: number;
  marked_at: string;
}

export interface DebtSubscriber {
  id: number;
  real_name: string | null;
  user_code: string | null;
  phone: string | null;
  debt: number;
  zone: string | null;
  fat: string | null;
}

export interface BroadcastItem {
  id: number;
  recipient: string;
  message: string;
  channel: string;
  status: string;
  error_log: string | null;
  created_at: string;
}

export const alertsApi = {
  getExpiringSubscribers: (): Promise<ExpiringSubscriber[]> =>
    fetchApi<ExpiringSubscriber[]>('/api/alerts/expiring-subscribers'),

  markExpiryNotified: (subscriberId: number): Promise<MarkNotifiedResponse> =>
    fetchApi<MarkNotifiedResponse>(`/api/alerts/mark-expiry-notified/${subscriberId}`, {
      method: 'POST',
    }),

  getDebtAlerts: (): Promise<DebtSubscriber[]> =>
    fetchApi<DebtSubscriber[]>('/api/alerts/internet-debts'),

  markDebtNotified: (subscriberId: number): Promise<MarkNotifiedResponse> =>
    fetchApi<MarkNotifiedResponse>(`/api/alerts/mark-debt-notified/${subscriberId}`, {
      method: 'POST',
    }),

  getBroadcastQueue: (status?: string): Promise<BroadcastItem[]> =>
    fetchApi<BroadcastItem[]>(`/api/broadcast/queue${status ? `?status=${status}` : ''}`),

  triggerDebtScan: (threshold: number): Promise<{ ok: boolean, queued_count: number }> =>
    fetchApi<{ ok: boolean, queued_count: number }>(`/api/broadcast/scan-debt?threshold=${threshold}`, {
      method: 'POST',
    }),

  cancelBroadcast: (id: number): Promise<{ ok: boolean }> =>
    fetchApi<{ ok: boolean }>(`/api/broadcast/${id}/cancel`, {
      method: 'POST',
    }),
};
