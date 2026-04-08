/** Shared types for Internet page components */

export type InternetTab =
  | 'subscribers'
  | 'debts'
  | 'materials'
  | 'zones'
  | 'wallet'
  | 'categories'
  | 'reports'
  | 'phoneDirectory'
  | 'ftthPortal'
  | 'alerts';

/** صف من جدول ftth_customers (عرض محلي منظّف بعد المزامنة) */
export interface FtthPortalCustomerRow {
  id: number;
  external_customer_id: string;
  full_name: string | null;
  phone: string | null;
  address?: string | null;
  zone: string | null;
  fat: string | null;
  fdt: string | null;
  bundle: string | null;
  subscription_status: string | null;
  /** ISO من الخادم (تاريخ/وقت أو تاريخ) */
  subscription_start_date?: string | null;
  subscription_end_date?: string | null;
  onu_username?: string | null;
  onu_serial?: string | null;
  import_status: string | null;
  last_synced_at?: string | null;
  subscriber_id: number | null;
  /** معرف ftth_external_data للترحيل */
  staging_row_id?: number | null;
  /** حقول إضافية من raw_payload للعرض الديناميكي في البوابة */
  raw_payload?: Record<string, unknown> | null;
}

/** صف من جدول FTTH الوسيط */
export interface FtthExternalRow {
  id: number;
  external_id: string;
  national_name: string | null;
  phone: string | null;
  zone: string | null;
  fat: string | null;
  location: string | null;
  service_username: string | null;
  start_date: string | null;
  end_date: string | null;
  /** تاريخ اشتراك محسوب من الخادم (مرادف لـ start_date) */
  calculated_subscription_date?: string | null;
  /** آخر مزامنة (مرادف لـ synced_at) */
  last_synced_at?: string | null;
  /** معاينة من الخادم: اشتراك بعد قاعدة −30/+30 (مرجع انتهاء) */
  resolved_subscription_date?: string | null;
  resolved_expiration_date?: string | null;
  remaining_days: number | null;
  /** مدة الالتزام بالأيام من الخادم (شهر=30، …) */
  commitment_days?: number | null;
  commitment_label?: string | null;
  status: string | null;
  imported_subscriber_id: number | null;
  synced_at: string | null;
  /** مصدر السجل: قاعدة محلية أو جلب مباشر من FTTH */
  data_source?: 'database' | 'live' | null;
  dataSource?: 'database' | 'live' | null;
}

export interface FtthPortalStatus {
  configured: boolean;
  login_url: string | null;
  list_url: string | null;
  parse_mode: string | null;
  last_sync_at: string | null;
  last_sync_new: number;
  last_sync_updated: number;
  last_sync_error: string | null;
  /** رسالة اختيارية من آخر تحقق (مثلاً وضع FTTH IQ) */
  setup_message?: string | null;
}

export interface InternetPhone {
  id: number;
  sequence: number;
  name: string;
  phone_number: string;
  last_promo_msg_date: string | null;
}

export interface InternetPhoneStats {
  total: number;
  unique_prefixes: number;
}

export interface InternetSubscriber {
  id: number;
  userCode?: string;
  realName?: string;
  phone?: string;
  zone?: string;
  fat?: string;
  category?: string;
  debt?: number;
  status?: string;
  expirationDate?: string;
  location?: string;
  history?: { id: number; date: string; type: string; amount: number; description: string }[];
}

export interface InternetMaterial {
  id: number;
  name?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  quantity?: number;
}

export interface InternetZone {
  id: number;
  name?: string;
}

export interface InternetFat {
  id: number;
  name?: string;
  zoneId?: number;
  coordinates?: string;
}

export interface InternetCategory {
  id: number;
  name?: string;
  price?: number;
  costPrice?: number;
  subscriptionType?: string;
  subscription_type?: string;
}

export interface InternetReportData {
  cashCollected: number;
  totalProfits: number;
  debtsCreated: number;
  wirelessProfits: number;
  ftthSubscribersCount?: number;
  isDateInRange: (dateStr: string) => boolean;
}
