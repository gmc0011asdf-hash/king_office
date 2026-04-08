import { fetchApi } from '@/api/client';
import type { OfficeMaterial, OfficeCustomer, OfficeSale } from '@/context/AppContext';

type AnyRec = Record<string, unknown>;

export const officeApi = {
  getMaterials: async (): Promise<OfficeMaterial[]> => {
    const rows = (await fetchApi<AnyRec[]>('/api/office-materials')) ?? [];
    return rows.map((m) => ({
      id: Number(m.id),
      name: String(m.name ?? ''),
      purchasePrice: Number(m.purchase_price ?? m.purchasePrice ?? 0),
      sellingPrice: Number(m.selling_price ?? m.sellingPrice ?? 0),
      quantity: Number(m.quantity ?? 0),
    }));
  },
  createMaterial: async (material: Omit<OfficeMaterial, 'id'>): Promise<OfficeMaterial> => {
    const response = await fetchApi<AnyRec>('/api/office-materials', {
      method: 'POST',
      body: JSON.stringify({
        name: material.name,
        purchase_price: material.purchasePrice,
        selling_price: material.sellingPrice,
        quantity: material.quantity,
      }),
    });
    return {
      id: Number(response.id),
      name: String(response.name ?? ''),
      purchasePrice: Number(response.purchase_price ?? 0),
      sellingPrice: Number(response.selling_price ?? 0),
      quantity: Number(response.quantity ?? 0),
    };
  },
  updateMaterial: async (id: number, material: Omit<OfficeMaterial, 'id'>): Promise<OfficeMaterial> => {
    const response = await fetchApi<AnyRec>(`/api/office-materials/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: material.name,
        purchase_price: material.purchasePrice,
        selling_price: material.sellingPrice,
        quantity: material.quantity,
      }),
    });
    return {
      id: Number(response.id),
      name: String(response.name ?? ''),
      purchasePrice: Number(response.purchase_price ?? 0),
      sellingPrice: Number(response.selling_price ?? 0),
      quantity: Number(response.quantity ?? 0),
    };
  },
  deleteMaterial: async (id: number) => {
    await fetchApi(`/api/office-materials/${id}`, { method: 'DELETE' });
  },
  getCustomers: async (): Promise<OfficeCustomer[]> => {
    const rows = (await fetchApi<AnyRec[]>('/api/office-customers')) ?? [];
    return rows.map((c) => ({
      id: Number(c.id),
      name: String(c.name ?? ''),
      phone: String(c.phone ?? ''),
      debt: Number(c.debt ?? 0),
      history: [],
    }));
  },
  createCustomer: async (customer: Omit<OfficeCustomer, 'id'>): Promise<OfficeCustomer> => {
    const response = await fetchApi<AnyRec>('/api/office-customers', {
      method: 'POST',
      body: JSON.stringify({
        name: customer.name,
        phone: customer.phone,
        debt: customer.debt,
      }),
    });
    return {
      id: Number(response.id),
      name: String(response.name ?? ''),
      phone: String(response.phone ?? ''),
      debt: Number(response.debt ?? 0),
      history: [],
    };
  },
  updateCustomer: async (id: number, customer: Partial<OfficeCustomer>): Promise<OfficeCustomer> => {
    const response = await fetchApi<AnyRec>(`/api/office-customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: customer.name,
        phone: customer.phone,
        debt: customer.debt,
      }),
    });
    return {
      id: Number(response.id),
      name: String(response.name ?? ''),
      phone: String(response.phone ?? ''),
      debt: Number(response.debt ?? 0),
      history: [],
    };
  },
  getSales: async (): Promise<OfficeSale[]> => {
    const rows = (await fetchApi<AnyRec[]>('/api/office-sales')) ?? [];
    return rows.map((s) => ({
      id: Number(s.id),
      date: s.date ? String(s.date).split('T')[0] : '',
      materialName: String(s.material_name ?? s.materialName ?? ''),
      quantity: Number(s.quantity ?? 0),
      purchasePrice: Number(s.purchase_price ?? s.purchasePrice ?? 0),
      sellingPrice: Number(s.selling_price ?? s.sellingPrice ?? 0),
      totalAmount: Number(s.total_amount ?? s.totalAmount ?? 0),
      profit: Number(s.profit ?? 0),
      paymentMethod: (s.payment_method ?? s.paymentMethod ?? 'cash') as 'cash' | 'debt' | 'installments',
      customerName: (s.customer_name ?? s.customerName) as string | undefined,
    }));
  },
  createSale: async (sale: {
    materialName: string;
    quantity: number;
    purchasePrice: number;
    sellingPrice: number;
    totalAmount: number;
    profit: number;
    paymentMethod: string;
    customerName?: string;
  }): Promise<OfficeSale> => {
    const response = await fetchApi<AnyRec>('/api/office-sales', {
      method: 'POST',
      body: JSON.stringify({
        material_name: sale.materialName,
        quantity: sale.quantity,
        purchase_price: sale.purchasePrice,
        selling_price: sale.sellingPrice,
        total_amount: sale.totalAmount,
        profit: sale.profit,
        payment_method: sale.paymentMethod,
        customer_name: sale.customerName,
      }),
    });
    return {
      id: Number(response.id),
      date: response.date ? String(response.date).split('T')[0] : '',
      materialName: String(response.material_name ?? ''),
      quantity: Number(response.quantity ?? 0),
      purchasePrice: Number(response.purchase_price ?? 0),
      sellingPrice: Number(response.selling_price ?? 0),
      totalAmount: Number(response.total_amount ?? 0),
      profit: Number(response.profit ?? 0),
      paymentMethod: (response.payment_method ?? 'cash') as 'cash' | 'debt' | 'installments',
      customerName: response.customer_name as string | undefined,
    };
  },
  getDebtAlerts: async (): Promise<{ id: number; name: string; phone: string | null; debt: number }[]> => {
    return (await fetchApi<{ id: number; name: string; phone: string | null; debt: number }[]>('/api/alerts/office-debts')) ?? [];
  },
  markDebtNotified: async (id: number): Promise<void> => {
    await fetchApi(`/api/office-customers/${id}/mark-notified`, { method: 'POST' });
  },
};
