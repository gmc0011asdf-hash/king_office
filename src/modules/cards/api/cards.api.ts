import { fetchApi, fetchApiWithTrace } from '@/api/client';

export const cardsApi = {
  getWalletTransactions: () => fetchApi('/api/card-wallet-transactions'),
  createWalletTransaction: (data: any) => fetchApiWithTrace('/api/card-wallet-transactions', { method: 'POST', body: JSON.stringify(data) }),
  getPurchases: () => fetchApi('/api/card-purchases'),
  createPurchase: (data: any) => fetchApiWithTrace('/api/card-purchases', { method: 'POST', body: JSON.stringify(data) }),
  getSales: () => fetchApi('/api/card-sales'),
  createSale: (data: any) => fetchApiWithTrace('/api/card-sales', { method: 'POST', body: JSON.stringify(data) }),
};
