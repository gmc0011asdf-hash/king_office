import { fetchApi, fetchApiWithTrace } from '@/api/client';

export const expensesApi = {
  getAll: () => fetchApi('/api/expenses'),
  createExpense: (data: any) => fetchApi('/api/expenses', { method: 'POST', body: JSON.stringify(data) }),
  createExpenseTracked: (data: any) => fetchApiWithTrace('/api/expenses', { method: 'POST', body: JSON.stringify(data) }),
  getCashbackHistory: () => fetchApi('/api/cashback-history'),
  createCashbackHistory: (data: any) => fetchApi('/api/cashback-history', { method: 'POST', body: JSON.stringify(data) }),
};
