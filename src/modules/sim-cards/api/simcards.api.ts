import { fetchApi } from '@/api/client';

export const simCardsApi = {
  getPackages: () => fetchApi('/api/sim-packages'),
  getInventory: () => fetchApi('/api/sim-inventory'),
  getSales: () => fetchApi('/api/sim-sales'),
  getNumbers: () => fetchApi('/api/sim-numbers'),
  createPackage: (data: any) => fetchApi('/api/sim-packages', { method: 'POST', body: JSON.stringify(data) }),
  updatePackage: (id: number, data: any) => fetchApi(`/api/sim-packages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePackage: (id: number) => fetchApi(`/api/sim-packages/${id}`, { method: 'DELETE' }),
  createInventory: (data: any) => fetchApi('/api/sim-inventory', { method: 'POST', body: JSON.stringify(data) }),
  createSale: (data: any) => fetchApi('/api/sim-sales', { method: 'POST', body: JSON.stringify(data) }),
  createNumber: (data: any) => fetchApi('/api/sim-numbers', { method: 'POST', body: JSON.stringify(data) }),
  updateNumber: (id: number, data: any) => fetchApi(`/api/sim-numbers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNumber: (id: number) => fetchApi(`/api/sim-numbers/${id}`, { method: 'DELETE' }),
};
