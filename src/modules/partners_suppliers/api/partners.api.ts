import { fetchApi } from '@/api/client';

function normalizePartnerTx(tx: any) {
  if (!tx) return tx;
  return {
    ...tx,
    partnerId: tx.partnerId ?? tx.partner_id,
    netProfit: tx.netProfit ?? tx.net_profit ?? 0,
    partnerShare: tx.partnerShare ?? tx.partner_share ?? 0,
    revenue: Number(tx.revenue ?? 0),
    expenses: Number(tx.expenses ?? 0),
    date: tx.date ? String(tx.date).split('T')[0] : tx.date,
  };
}

export const partnersApi = {
  getAll: () => fetchApi('/api/partners'),
  getTransactions: async () => {
    const list = await fetchApi<any[]>('/api/partner-transactions');
    return Array.isArray(list) ? list.map(normalizePartnerTx) : [];
  },
  createPartner: (data: any) => fetchApi('/api/partners', { method: 'POST', body: JSON.stringify(data) }),
  updatePartner: (id: number, data: any) => fetchApi(`/api/partners/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePartner: (id: number) => fetchApi(`/api/partners/${id}`, { method: 'DELETE' }),
  createTransaction: async (_partnerId: number, data: any) => {
    const tx = await fetchApi('/api/partner-transactions', { method: 'POST', body: JSON.stringify(data) });
    return normalizePartnerTx(tx);
  },
};
