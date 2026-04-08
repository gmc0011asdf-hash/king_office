import { fetchApi, fetchApiWithTrace } from '@/api/client';

export const usersApi = {
  getAll: () => fetchApi('/api/users'),
  create: (data: Record<string, unknown>) =>
    fetchApi('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  createTracked: (data: Record<string, unknown>) =>
    fetchApiWithTrace('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, unknown>) =>
    fetchApi(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => fetchApi(`/api/users/${id}`, { method: 'DELETE' }),
};
