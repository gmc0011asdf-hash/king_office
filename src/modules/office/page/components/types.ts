/** Shared types for Office page components */

export type OfficeTab = 'quick_sale' | 'inventory' | 'customers' | 'invoices' | 'debts' | 'lines' | 'reports' | 'alerts';

export interface OfficeMaterial {
  id: number;
  name?: string;
  category?: string;
  barcode?: string;
  description?: string;
  purchasePrice?: number;
  purchase_price?: number;
  sellingPrice?: number;
  selling_price?: number;
  quantity?: number;
}

export interface OfficeCustomer {
  id: number;
  name?: string;
  phone?: string;
  debt?: number;
}

export interface InvoiceItem {
  materialId?: number | '';
  materialName?: string;
  quantity: number;
  sellingPrice: number;
  lineTotal?: number;
}

export interface Invoice {
  id: number;
  invoiceNo?: string;
  invoice_no?: string;
  date?: string;
  customerName?: string;
  customer_name?: string;
  customerPhone?: string;
  customer_phone?: string;
  paymentMethod?: string;
  payment_method?: string;
  totalAmount?: number;
  total_amount?: number;
  paidAmount?: number;
  paid_amount?: number;
  isPaid?: boolean;
  is_paid?: boolean;
  items?: InvoiceItem[];
  officeName?: string;
  office_name?: string;
}

export interface CartRow {
  materialId: number;
  name: string;
  available: number;
  qty: number;
  selling: number;
  purchase: number;
  lineTotal: number;
  lineProfit: number;
}

export interface CartCalc {
  rows: CartRow[];
  baseTotal: number;
  profit: number;
  commissionPct: number;
  totalWithCommission: number;
  months: number;
  monthly: number;
}

export interface InvoiceCalc {
  items: InvoiceItem[];
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  status: 'paid' | 'partial' | 'unpaid';
}
