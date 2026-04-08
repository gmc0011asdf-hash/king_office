import { fetchApi, ApiRequestError, getApiBaseUrl } from '@/api/client';
import { authStorage } from '@/utils/authStorage';

export type BackupItem = {
  filename: string;
  size_bytes: number;
  modified_at: string;
};

export type CreateBackupResponse = {
  ok: boolean;
  message: string;
  backup: BackupItem;
};

export type BackupSettings = {
  backup_storage_path: string | null;
  backup_schedule: string;
  backup_schedule_time: string;
  backup_schedule_weekday: number | null;
  backup_schedule_month_day: number | null;
  backup_last_scheduled_at: string | null;
};

export const backupApi = {
  getSettings: () => fetchApi<BackupSettings>('/api/admin/backup/settings'),

  putSettings: (body: {
    backup_storage_path?: string | null;
    backup_schedule: 'none' | 'daily' | 'weekly' | 'monthly';
    backup_schedule_time: string;
    backup_schedule_weekday?: number | null;
    backup_schedule_month_day?: number | null;
  }) =>
    fetchApi<BackupSettings>('/api/admin/backup/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  list: () => fetchApi<BackupItem[]>('/api/admin/backup/list'),

  create: () => fetchApi<CreateBackupResponse>('/api/admin/backup/create', { method: 'POST' }),

  restore: (filename: string) =>
    fetchApi<{ ok: boolean; message: string }>('/api/admin/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ filename }),
    }),

  remove: (filename: string) =>
    fetchApi<{ ok: boolean; message: string }>(
      `/api/admin/backup/${encodeURIComponent(filename)}`,
      { method: 'DELETE' },
    ),

  async downloadNow(): Promise<void> {
    const token = authStorage.getToken?.();
    const url = `${getApiBaseUrl()}/api/admin/backup/download-now`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let data: unknown;
      try { data = await res.json(); } catch { data = await res.text(); }
      throw new ApiRequestError(
        typeof data === 'object' && data !== null && 'detail' in data
          ? String((data as { detail: unknown }).detail)
          : `HTTP ${res.status}`,
        res.status,
        data,
      );
    }
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? `postgresql_king_office_backup_${Date.now()}.sql`;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  async download(filename: string): Promise<void> {
    const token = authStorage.getToken?.();
    const url = `${getApiBaseUrl()}/api/admin/backup/download/${encodeURIComponent(filename)}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        data = await res.text();
      }
      throw new ApiRequestError(
        typeof data === 'object' && data !== null && 'detail' in data
          ? String((data as { detail: unknown }).detail)
          : `HTTP ${res.status}`,
        res.status,
        data,
      );
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  async restoreUpload(file: File): Promise<{ ok: boolean; message: string }> {
    const token = authStorage.getToken?.();
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${getApiBaseUrl()}/api/admin/backup/restore-upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiRequestError(
        typeof data === 'object' && data !== null && 'detail' in data
          ? String((data as { detail: unknown }).detail)
          : `HTTP ${res.status}`,
        res.status,
        data,
      );
    }
    return data as { ok: boolean; message: string };
  },
};
