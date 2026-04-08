import { fetchApi } from '@/api/client';

export const settingsApi = {
  getAll: () => fetchApi('/api/settings'),
  update: (id: number, data: any) => fetchApi(`/api/settings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};
