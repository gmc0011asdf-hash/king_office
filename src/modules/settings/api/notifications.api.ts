import { fetchApi } from '@/api/client';

export const notificationsApi = {
  getAll: () => fetchApi<Array<{ id: number; title: string; message: string; type: string; read: boolean; date: string }>>('/api/notifications'),
  markAsRead: (id: number) => fetchApi(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllAsRead: () => fetchApi('/api/notifications/read-all', { method: 'POST' }),
};
