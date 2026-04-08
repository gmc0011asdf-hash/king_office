import { fetchApi } from '@/api/client';
import { Supplier, SupplierTransaction } from '@/context/AppContext';

export const suppliersApi = {
  getSuppliers: async (): Promise<Supplier[]> => {
    const data = await fetchApi<any[]>('/api/suppliers');
    const arr = Array.isArray(data) ? data : [];
    return arr.map((s: any) => ({
      id: s.id,
      name: s.name,
      specialty: s.specialty,
      phone: s.phone,
      outstandingDebt: Number(s.outstanding_debt ?? s.outstandingDebt ?? 0),
    }));
  },

  createSupplier: async (supplier: Omit<Supplier, 'id'>): Promise<Supplier> => {
    const res = await fetchApi<any>('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({
        name: supplier.name,
        specialty: supplier.specialty,
        phone: supplier.phone,
        outstanding_debt: supplier.outstandingDebt ?? 0,
      }),
    });
    const s = (res as any)?.data ?? res;
    return {
      id: s.id,
      name: s.name,
      specialty: s.specialty,
      phone: s.phone,
      outstandingDebt: Number(s.outstanding_debt ?? s.outstandingDebt ?? 0),
    };
  },

  updateSupplier: async (id: number, supplier: Partial<Supplier>): Promise<Supplier> => {
    const res = await fetchApi<any>(`/api/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: supplier.name,
        specialty: supplier.specialty,
        phone: supplier.phone,
        outstanding_debt: supplier.outstandingDebt,
      }),
    });
    const s = (res as any)?.data ?? res;
    return {
      id: s.id,
      name: s.name,
      specialty: s.specialty,
      phone: s.phone,
      outstandingDebt: Number(s.outstanding_debt ?? s.outstandingDebt ?? 0),
    };
  },

  deleteSupplier: async (id: number) => {
    return fetchApi(`/api/suppliers/${id}`, { method: 'DELETE' });
  },

  getTransactions: async (supplierId: number) => {
    const data = await fetchApi<any[]>(`/api/suppliers/${supplierId}/transactions`);
    const arr = Array.isArray(data) ? data : [];
    return arr.map((t: any) => ({
      id: t.id,
      supplierId: t.supplier_id ?? t.supplierId,
      date: t.date,
      type: t.type,
      amount: t.amount,
      notes: t.notes,
    }));
  },

  createTransaction: async (supplierId: number, transaction: Omit<SupplierTransaction, 'id'>) => {
    const res = await fetchApi<any>(`/api/suppliers/${supplierId}/transactions`, {
      method: 'POST',
      body: JSON.stringify({
        supplier_id: supplierId,
        type: transaction.type,
        amount: transaction.amount,
        notes: transaction.notes,
      }),
    });
    const t = (res as any)?.data ?? res;
    return {
      id: t.id,
      supplierId: t.supplier_id ?? t.supplierId,
      date: t.date,
      type: t.type,
      amount: t.amount,
      notes: t.notes,
    };
  },
};
