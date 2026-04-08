import { fetchApi, fetchApiWithTrace } from '@/api/client';

/** fetchApi returns unknown without generic; normalize for .map() under strict mode */
const asArray = (data: unknown): any[] => (Array.isArray(data) ? data : []);

const mapZone = (item: any) => ({
  id: item.id,
  name: item.name,
  createdAt: item.createdAt ?? item.created_at ?? null,
});

const mapFat = (item: any) => ({
  id: item.id,
  zoneId: item.zoneId ?? item.zone_id,
  name: item.name,
  coordinates: item.coordinates ?? '',
  createdAt: item.createdAt ?? item.created_at ?? null,
});

const mapCategory = (item: any) => ({
  id: item.id,
  name: item.name,
  price: Number(item.price ?? 0),
  subscriptionType: (item.subscriptionType ?? item.subscription_type ?? 'ftth').toLowerCase(),
  costPrice: (() => {
    const v = item.costPrice ?? item.cost_price;
    if (v == null || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  })(),
  createdAt: item.createdAt ?? item.created_at ?? null,
});

const mapMaterial = (item: any) => ({
  id: item.id,
  name: item.name,
  purchasePrice: Number(item.purchasePrice ?? item.purchase_price ?? 0),
  sellingPrice: Number(item.sellingPrice ?? item.selling_price ?? 0),
  quantity: Number(item.quantity ?? 0),
  createdAt: item.createdAt ?? item.created_at ?? null,
});

const mapMaterialSale = (item: any) => ({
  id: item.id,
  materialId: item.materialId ?? item.material_id ?? null,
  date: item.date ? String(item.date).split('T')[0] : '',
  materialName: item.materialName ?? item.material_name ?? '',
  quantity: Number(item.quantity ?? 0),
  purchasePrice: Number(item.purchasePrice ?? item.purchase_price ?? 0),
  sellingPrice: Number(item.sellingPrice ?? item.selling_price ?? 0),
  totalAmount: Number(item.totalAmount ?? item.total_amount ?? 0),
  profit: Number(item.profit ?? 0),
  paymentMethod: item.paymentMethod ?? item.payment_method ?? 'cash',
  subscriberName: item.subscriberName ?? item.subscriber_name ?? undefined,
});

const mapHistory = (item: any) => ({
  id: item.id,
  subscriberId: item.subscriberId ?? item.subscriber_id ?? null,
  date: item.date ? String(item.date).split('T')[0] : '',
  type: item.type ?? '',
  amount: Number(item.amount ?? 0),
  description: item.description ?? '',
});

const mapCashback = (item: any) => ({
  id: item.id,
  date: item.date ? String(item.date).split('T')[0] : '',
  amount: Number(item.amount ?? item.value ?? 0),
  description: item.description ?? '',
  user: item.user ?? '',
});

const mapSummary = (item: any) => ({
  cashCollected: Number(item.cashCollected ?? item.cash_collected ?? 0),
  debtsCreated: Number(item.debtsCreated ?? item.debts_created ?? 0),
  totalProfits: Number(item.totalProfits ?? item.total_profits ?? 0),
  wirelessProfits: Number(item.wirelessProfits ?? item.wireless_profits ?? 0),
  materialProfit: Number(item.materialProfit ?? item.material_profit ?? 0),
  materialCash: Number(item.materialCash ?? item.material_cash ?? 0),
  subscriptionCash: Number(item.subscriptionCash ?? item.subscription_cash ?? 0),
  cashbackExpected: Number(item.cashbackExpected ?? item.cashback_expected ?? 0),
  currentDebts: Number(item.currentDebts ?? item.current_debts ?? 0),
  ftthSubscriberCount: Number(item.ftthSubscriberCount ?? item.ftth_subscriber_count ?? 0),
  subscriberCount: Number(item.subscriberCount ?? item.subscriber_count ?? 0),
});

const mapReportDetails = (item: any) => ({
  materialSales: Array.isArray(item.materialSales ?? item.material_sales) ? (item.materialSales ?? item.material_sales).map(mapMaterialSale) : [],
  subscriberHistory: Array.isArray(item.subscriberHistory ?? item.subscriber_history) ? (item.subscriberHistory ?? item.subscriber_history).map(mapHistory) : [],
  cashbackHistory: Array.isArray(item.cashbackHistory ?? item.cashback_history) ? (item.cashbackHistory ?? item.cashback_history).map(mapCashback) : [],
});

export const internetApi = {
  getZones: async () => asArray(await fetchApi('/api/internet/zones')).map(mapZone),
  createZone: async (data: any) => mapZone(await fetchApi('/api/internet/zones', { method: 'POST', body: JSON.stringify({ name: data.name }) })),
  createZoneTracked: async (data: any) => {
    const result = await fetchApiWithTrace('/api/internet/zones', { method: 'POST', body: JSON.stringify({ name: data.name }) });
    return { ...result, data: result.data ? mapZone(result.data) : result.data };
  },
  updateZone: async (id: number, data: any) => mapZone(await fetchApi(`/api/internet/zones/${id}`, { method: 'PUT', body: JSON.stringify({ name: data.name }) })),
  deleteZone: (id: number) => fetchApi(`/api/internet/zones/${id}`, { method: 'DELETE' }),

  getFats: async () => asArray(await fetchApi('/api/internet/fats')).map(mapFat),
  createFat: async (data: any) => mapFat(await fetchApi('/api/internet/fats', { method: 'POST', body: JSON.stringify({ zone_id: data.zoneId ?? data.zone_id, name: data.name, coordinates: data.coordinates }) })),
  createFatTracked: async (data: any) => {
    const result = await fetchApiWithTrace('/api/internet/fats', { method: 'POST', body: JSON.stringify({ zone_id: data.zoneId ?? data.zone_id, name: data.name, coordinates: data.coordinates }) });
    return { ...result, data: result.data ? mapFat(result.data) : result.data };
  },
  updateFat: async (id: number, data: any) => mapFat(await fetchApi(`/api/internet/fats/${id}`, { method: 'PUT', body: JSON.stringify({ zone_id: data.zoneId ?? data.zone_id, name: data.name, coordinates: data.coordinates }) })),
  deleteFat: (id: number) => fetchApi(`/api/internet/fats/${id}`, { method: 'DELETE' }),

  getCategories: async () => asArray(await fetchApi('/api/internet/categories')).map(mapCategory),
  createCategory: async (data: any) => mapCategory(await fetchApi('/api/internet/categories', { method: 'POST', body: JSON.stringify({ name: data.name, price: Number(data.price ?? 0), subscriptionType: data.subscriptionType ?? 'ftth', costPrice: data.costPrice != null ? Number(data.costPrice) : null }) })),
  createCategoryTracked: async (data: any) => {
    const result = await fetchApiWithTrace('/api/internet/categories', { method: 'POST', body: JSON.stringify({ name: data.name, price: Number(data.price ?? 0), subscriptionType: data.subscriptionType ?? 'ftth', costPrice: data.costPrice != null ? Number(data.costPrice) : null }) });
    return { ...result, data: result.data ? mapCategory(result.data) : result.data };
  },
  updateCategory: async (id: number, data: any) => mapCategory(await fetchApi(`/api/internet/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name: data.name, price: Number(data.price ?? 0), subscriptionType: data.subscriptionType ?? 'ftth', costPrice: data.costPrice != null ? Number(data.costPrice) : null }) })),
  deleteCategory: (id: number) => fetchApi(`/api/internet/categories/${id}`, { method: 'DELETE' }),

  getMaterials: async () => asArray(await fetchApi('/api/internet/materials')).map(mapMaterial),
  createMaterial: async (data: any) => mapMaterial(await fetchApi('/api/internet/materials', { method: 'POST', body: JSON.stringify({ name: data.name, purchase_price: Number(data.purchasePrice ?? data.purchase_price ?? 0), selling_price: Number(data.sellingPrice ?? data.selling_price ?? 0), quantity: Number(data.quantity ?? 0) }) })),
  createMaterialTracked: async (data: any) => {
    const result = await fetchApiWithTrace('/api/internet/materials', { method: 'POST', body: JSON.stringify({ name: data.name, purchase_price: Number(data.purchasePrice ?? data.purchase_price ?? 0), selling_price: Number(data.sellingPrice ?? data.selling_price ?? 0), quantity: Number(data.quantity ?? 0) }) });
    return { ...result, data: result.data ? mapMaterial(result.data) : result.data };
  },
  updateMaterial: async (id: number, data: any) => mapMaterial(await fetchApi(`/api/internet/materials/${id}`, { method: 'PUT', body: JSON.stringify({ name: data.name, purchase_price: Number(data.purchasePrice ?? data.purchase_price ?? 0), selling_price: Number(data.sellingPrice ?? data.selling_price ?? 0), quantity: Number(data.quantity ?? 0) }) })),
  deleteMaterial: (id: number) => fetchApi(`/api/internet/materials/${id}`, { method: 'DELETE' }),

  getMaterialSales: async () => asArray(await fetchApi('/api/internet/material-sales')).map(mapMaterialSale),
  createMaterialSale: async (data: any) => mapMaterialSale(await fetchApi('/api/internet/material-sales', { method: 'POST', body: JSON.stringify({ material_id: data.materialId ?? data.material_id ?? null, subscriber_id: data.subscriberId ?? data.subscriber_id ?? null, quantity: Number(data.quantity ?? 1), payment_method: data.paymentMethod ?? data.payment_method ?? 'cash', subscriber_name: data.subscriberName ?? data.subscriber_name ?? null }) })),
  createMaterialSaleTracked: async (data: any) => {
    const result = await fetchApiWithTrace('/api/internet/material-sales', { method: 'POST', body: JSON.stringify({ material_id: data.materialId ?? data.material_id ?? null, subscriber_id: data.subscriberId ?? data.subscriber_id ?? null, quantity: Number(data.quantity ?? 1), payment_method: data.paymentMethod ?? data.payment_method ?? 'cash', subscriber_name: data.subscriberName ?? data.subscriber_name ?? null }) });
    return { ...result, data: result.data ? mapMaterialSale(result.data) : result.data };
  },

  getReportSummary: async (params?: { startDate?: string; endDate?: string }) => {
    const search = new URLSearchParams();
    if (params?.startDate) search.set('start_date', params.startDate);
    if (params?.endDate) search.set('end_date', params.endDate);
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return mapSummary(await fetchApi(`/api/internet/reports/summary${suffix}`));
  },

  getReportDetails: async (params?: { startDate?: string; endDate?: string }) => {
    const search = new URLSearchParams();
    if (params?.startDate) search.set('start_date', params.startDate);
    if (params?.endDate) search.set('end_date', params.endDate);
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return mapReportDetails(await fetchApi(`/api/internet/reports/details${suffix}`));
  },
};
