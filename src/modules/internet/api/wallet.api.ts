import { fetchApi, fetchApiWithTrace } from '@/api/client';

export const walletApi = {
  getAll: () => fetchApi('/api/wallet-transactions'),
  create: (data: any) => fetchApi('/api/wallet-transactions', { method: 'POST', body: JSON.stringify(data) }),
  createTracked: (data: any) => fetchApiWithTrace('/api/wallet-transactions', { method: 'POST', body: JSON.stringify(data) }),
};
