import { fetchApi } from '@/api/client';

export type ActivityLogEntry = {
  id: number;
  userId?: number;
  userName?: string;
  section: string;
  action: string;
  details?: string;
  createdAt?: string;
};

export type AuditLogEntry = {
  id: number;
  user_id?: number;
  user_email?: string;
  user_name?: string;
  http_method: string;
  path: string;
  payload_summary?: string;
  ip_address?: string;
  status_code?: number;
  created_at?: string;
};

export const activityLogApi = {
  getAll: (params?: { skip?: number; limit?: number; userId?: number; section?: string }) => {
    const qs = new URLSearchParams();
    if (params?.skip != null) qs.set('skip', String(params.skip));
    if (params?.limit != null) qs.set('limit', String(params.limit));
    if (params?.userId != null) qs.set('user_id', String(params.userId));
    if (params?.section) qs.set('section', params.section);
    const suffix = qs.toString() ? '?' + qs.toString() : '';
    return fetchApi<ActivityLogEntry[]>(`/api/activity-log${suffix}`);
  },
  create: (data: { section: string; action: string; details?: string }) =>
    fetchApi('/api/activity-log', { method: 'POST', body: JSON.stringify(data) }),
};

export const auditLogApi = {
  getAll: (params?: { skip?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.skip != null) qs.set('skip', String(params.skip));
    if (params?.limit != null) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? '?' + qs.toString() : '';
    return fetchApi<AuditLogEntry[]>(`/api/admin/audit-logs${suffix}`);
  },
};
