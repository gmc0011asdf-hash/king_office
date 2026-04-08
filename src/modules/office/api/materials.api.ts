import { fetchApi } from '@/api/client';

export const materialsApi = {
  getAll: () => fetchApi('/api/office-materials'),
  create: (data: any) => fetchApi('/api/office-materials', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => fetchApi(`/api/office-materials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => fetchApi(`/api/office-materials/${id}`, { method: 'DELETE' }),
  getCustomers: (includeHistory?: boolean) => fetchApi(includeHistory ? '/api/office-customers?includeHistory=true' : '/api/office-customers'),
  createCustomer: (data: any) => fetchApi('/api/office-customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: number, data: any) => fetchApi(`/api/office-customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getCustomerHistory: (id: number) => fetchApi(`/api/office-customers/${id}/history`),
  getCustomerSales: (id: number) => fetchApi(`/api/office-customers/${id}/sales`),
  getSales: () => fetchApi('/api/office-sales'),
  createSale: (data: any) => fetchApi('/api/office-sales', { method: 'POST', body: JSON.stringify(data) }),
  createCartSale: (data: any) => fetchApi('/api/office-cart-sales', { method: 'POST', body: JSON.stringify(data) }),
  getInvoices: (params?: { q?: string; status?: string; dateFrom?: string; dateTo?: string; customerId?: number }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.status) sp.set('status', params.status);
    if (params?.dateFrom) sp.set('dateFrom', params.dateFrom);
    if (params?.dateTo) sp.set('dateTo', params.dateTo);
    if (params?.customerId) sp.set('customerId', String(params.customerId));
    const qs = sp.toString();
    return fetchApi(`/api/office-invoices${qs ? '?' + qs : ''}`);
  },
  createInvoice: (data: any) => fetchApi('/api/office-invoices', { method: 'POST', body: JSON.stringify(data) }),
  deleteInvoice: (id: number) => fetchApi(`/api/office-invoices/${id}`, { method: 'DELETE' }),
  updateInvoicePayment: (id: number, data: any) => fetchApi(`/api/office-invoices/${id}/payment`, { method: 'PUT', body: JSON.stringify(data) }),
  getCustomerInstallments: (id: number) => fetchApi(`/api/office-customers/${id}/installments`),
  payCustomerDebt: (id: number, data: any) => fetchApi(`/api/office-customers/${id}/pay-debt`, { method: 'POST', body: JSON.stringify(data) }),
  payInstallment: (id: number, data: any) => fetchApi(`/api/office-installments/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
  getReportsSummary: () => fetchApi('/api/office-reports/summary'),
};
