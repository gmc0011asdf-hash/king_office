import React, { createContext, useState, useContext, useMemo, useEffect, useCallback } from 'react';
import { usersApi } from '@/api/users';
import { subscribersApi } from '@/api/subscribers';
import { mergeSubscribersWithHistory } from '@/utils/subscriberListMerge';
import { materialsApi } from '@/api/materials';
import { walletApi } from '@/api/wallet';
import { expensesApi } from '@/api/expenses';
import { partnersApi } from '@/api/partners';
import { suppliersApi } from '@/modules/partners_suppliers/api/suppliers.api';
import { simCardsApi } from '@/api/simcards';
import { settingsApi } from '@/api/settings';
import { cardsApi } from '@/api/cards';
import { internetApi } from '@/api/internet';
import { notificationsApi } from '@/api/notifications';
import { activityLogApi } from '@/api/activityLog';
import { authStorage } from '@/utils/authStorage';

export type Transaction = {
  id: number;
  type: 'recharge' | 'expense';
  amount: number;
  date: string;
  description: string;
  walletType?: string;
};

export type MaterialSale = {
  id: number;
  date: string;
  materialName: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  totalAmount: number;
  profit: number;
  paymentMethod: 'cash' | 'debt';
  subscriberName?: string;
  payment_method?: 'cash' | 'debt';
  total_amount?: number;
};

export type CashbackHistory = {
  id: number;
  date: string;
  value: number;
  user: string;
  description?: string;
  /** API may return amount instead of value */
  amount?: number;
};

export type Expense = {
  id: number;
  date: string;
  category: string;
  amount: number;
  description?: string;
  payee?: string;
  user?: string;
};

export type Subscriber = {
  id: number;
  realName: string;
  nationalIdName: string;
  phone: string;
  zone: string;
  fat: string;
  category: string;
  categoryPrice: number;
  debt: number;
  subscriptionDate: string;
  expirationDate: string;
  subscription_date?: string;
  expiration_date?: string;
  status: string;
  location: string;
  /** FTTH vs wireless (API snake_case or camelCase) */
  subscriptionType?: string;
  subscription_type?: string;
  userCode?: string;
  user_code?: string;
  history?: { id: number; date: string; type: string; amount: number; description: string }[];
};

export type User = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  password: string;
  recoveryEmail: string;
  lastLogin: string;
  status: 'active' | 'inactive';
  currentSessionId?: string;
  permissions?: any;
  requires_password_change?: boolean;
  requiresPasswordChange?: boolean;
};

export type Notification = {
  id: number;
  title: string;
  message: string;
  date: string;
  read: boolean;
  type: 'activation' | 'sale' | 'alert' | 'info';
  fromApi?: boolean;
};

export type SystemSettings = {
  walletAlertThreshold: number;
  stockAlertThreshold: number;
  earthlinkThreshold: number;
  swigThreshold: number;
  qiThreshold: number;
  cardsThreshold: number;
  materialsThreshold: number;
  /** API snake_case aliases (optional) */
  wallet_alert_threshold?: number;
  stock_alert_threshold?: number;
  materials_threshold?: number;
  office_name?: string;
  office_phone?: string;
  office_address?: string;
  officeName?: string;
  officePhone?: string;
  officeAddress?: string;
  cardsReportName?: string;
  cards_report_name?: string;
  /** مسار حفظ النسخ الاحتياطية على خادم الـ API (PostgreSQL / pg_dump) */
  backupStoragePath?: string | null;
  backup_schedule?: string;
  backupSchedule?: 'none' | 'daily' | 'weekly' | 'monthly';
  backupScheduleTime?: string;
  backupScheduleWeekday?: number | null;
  backupScheduleMonthDay?: number | null;
  backupLastScheduledAt?: string | null;
};

export type OfficeMaterial = {
  id: number;
  name: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  selling_price?: number;
  purchase_price?: number;
};

export type OfficeCustomer = {
  id: number;
  name: string;
  phone: string;
  debt: number;
  history: {
    id: number;
    date: string;
    type: 'شراء آجل' | 'تسديد دين' | 'شراء أقساط' | 'تسديد قسط';
    amount: number;
    description: string;
    installments?: {
      id: number;
      date: string;
      amount: number;
      paid: boolean;
      paidDate?: string;
    }[];
  }[];
};

export type OfficeSale = {
  id: number;
  date: string;
  materialName: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  totalAmount: number;
  profit: number;
  paymentMethod: 'cash' | 'debt' | 'installments';
  customerName?: string;
};

export type CardWalletTransaction = {
  id: number;
  walletType: 'swig' | 'qi';
  type: 'topup_wallet' | 'topup_customer';
  amount: number;
  commission: number;
  total: number;
  date: string;
  status: string;
  description?: string;
  balanceAfter: number;
};

export type CardSale = {
  id: number;
  quantity: number;
  sellingPrice: number;
  total: number;
  profit: number;
  date: string;
  totalAmount?: number;
  total_amount?: number;
};

export type CardPurchase = {
  id: number;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  totalCost: number;
  date: string;
  totalAmount?: number;
  total_amount?: number;
};

export interface Partner {
  id: number;
  name: string;
  joinDate: string;
  percentage: number;
  department: 'internet' | 'office' | 'cards';
}

export interface PartnerTransaction {
  id: number;
  partnerId: number;
  date: string;
  department: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  partnerShare: number;
  partner_id?: number;
  net_profit?: number;
  partner_share?: number;
}

export interface Supplier {
  id: number;
  name: string;
  specialty: string;
  phone: string;
  outstandingDebt: number;
}

export interface SupplierTransaction {
  id: number;
  supplierId: number;
  date: string;
  type: 'purchase' | 'payment';
  amount: number;
  notes: string;
}

export type SimType = 'asia' | 'zain';

export interface SimPackage {
  id: number;
  type: SimType;
  name: string;
  topupAmount: number;
  companyCommission: number;
  jbReturn: number;
  cost: number;
  sellingPrice: number;
}

export interface SimInventoryTransaction {
  id: number;
  type: SimType;
  quantity: number;
  date: string;
  action: 'add' | 'sell';
}

export interface SimSale {
  id: number;
  packageId: number;
  type: SimType;
  date: string;
  sellingPrice: number;
  cost: number;
  profit: number;
  companyCommission: number;
  jbReturn: number;
  simNumberId?: number;
  package_id?: number;
  selling_price?: number;
  company_commission?: number;
  jb_return?: number;
}

export interface SimNumber {
  id: number;
  number: string;
  type: SimType;
  status: 'available' | 'sold';
  soldDate?: string;
  packageId?: number;
}

type AppContextType = {
  walletTransactions: Transaction[];
  setWalletTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  walletBalance: number;
  wirelessWalletBalance: number;
  subscribers: Subscriber[];
  setSubscribers: React.Dispatch<React.SetStateAction<Subscriber[]>>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  currentUser: User | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  materialSales: MaterialSale[];
  setMaterialSales: React.Dispatch<React.SetStateAction<MaterialSale[]>>;
  cashbackValue: number;
  setCashbackValue: React.Dispatch<React.SetStateAction<number>>;
  cashbackHistory: CashbackHistory[];
  setCashbackHistory: React.Dispatch<React.SetStateAction<CashbackHistory[]>>;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  addNotification: (title: string, message: string, type: Notification['type']) => void;
  markNotificationAsRead: (id: number) => void;
  markAllNotificationsAsRead: () => void;
  logActivity: (section: string, action: string, details?: string) => void;
  systemSettings: SystemSettings;
  setSystemSettings: React.Dispatch<React.SetStateAction<SystemSettings>>;
  officeMaterials: OfficeMaterial[];
  setOfficeMaterials: React.Dispatch<React.SetStateAction<OfficeMaterial[]>>;
  officeCustomers: OfficeCustomer[];
  setOfficeCustomers: React.Dispatch<React.SetStateAction<OfficeCustomer[]>>;
  officeSales: OfficeSale[];
  setOfficeSales: React.Dispatch<React.SetStateAction<OfficeSale[]>>;
  swigTransactions: CardWalletTransaction[];
  setSwigTransactions: React.Dispatch<React.SetStateAction<CardWalletTransaction[]>>;
  qiTransactions: CardWalletTransaction[];
  setQiTransactions: React.Dispatch<React.SetStateAction<CardWalletTransaction[]>>;
  cardSales: CardSale[];
  setCardSales: React.Dispatch<React.SetStateAction<CardSale[]>>;
  swigBalance: number;
  setSwigBalance: React.Dispatch<React.SetStateAction<number>>;
  qiBalance: number;
  setQiBalance: React.Dispatch<React.SetStateAction<number>>;
  cardPurchases: CardPurchase[];
  setCardPurchases: React.Dispatch<React.SetStateAction<CardPurchase[]>>;
  cardInventoryCount: number;
  setCardInventoryCount: React.Dispatch<React.SetStateAction<number>>;
  currentPurchasePrice: number;
  setCurrentPurchasePrice: React.Dispatch<React.SetStateAction<number>>;
  currentSellingPrice: number;
  setCurrentSellingPrice: React.Dispatch<React.SetStateAction<number>>;
  partners: Partner[];
  setPartners: React.Dispatch<React.SetStateAction<Partner[]>>;
  partnerTransactions: PartnerTransaction[];
  setPartnerTransactions: React.Dispatch<React.SetStateAction<PartnerTransaction[]>>;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  supplierTransactions: SupplierTransaction[];
  setSupplierTransactions: React.Dispatch<React.SetStateAction<SupplierTransaction[]>>;
  simPackages: SimPackage[];
  setSimPackages: React.Dispatch<React.SetStateAction<SimPackage[]>>;
  simInventoryTransactions: SimInventoryTransaction[];
  setSimInventoryTransactions: React.Dispatch<React.SetStateAction<SimInventoryTransaction[]>>;
  simSales: SimSale[];
  setSimSales: React.Dispatch<React.SetStateAction<SimSale[]>>;
  simNumbers: SimNumber[];
  setSimNumbers: React.Dispatch<React.SetStateAction<SimNumber[]>>;
  asiaBalance: number;
  zainBalance: number;
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  isInitialLoading: boolean;
  /** عند true لا يُطبَّق تسجيل الخروج التلقائي بعد الخمول (مثلاً أثناء استرجاع نسخة احتياطية طويل) */
  suspendIdleLogout: boolean;
  setSuspendIdleLogout: React.Dispatch<React.SetStateAction<boolean>>;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(() => authStorage.getUser());
  const [materialSales, setMaterialSales] = useState<MaterialSale[]>([]);
  const [cashbackValue, setCashbackValue] = useState<number>(0);
  const [cashbackHistory, setCashbackHistory] = useState<CashbackHistory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    walletAlertThreshold: 50000,
    stockAlertThreshold: 5,
    earthlinkThreshold: 50000,
    swigThreshold: 50000,
    qiThreshold: 50000,
    cardsThreshold: 5,
    materialsThreshold: 5,
  });
  const [officeMaterials, setOfficeMaterials] = useState<OfficeMaterial[]>([]);
  const [officeCustomers, setOfficeCustomers] = useState<OfficeCustomer[]>([]);
  const [officeSales, setOfficeSales] = useState<OfficeSale[]>([]);
  const [swigTransactions, setSwigTransactions] = useState<CardWalletTransaction[]>([]);
  const [qiTransactions, setQiTransactions] = useState<CardWalletTransaction[]>([]);
  const [cardSales, setCardSales] = useState<CardSale[]>([]);
  const [swigBalance, setSwigBalance] = useState(0);
  const [qiBalance, setQiBalance] = useState(0);
  const [cardPurchases, setCardPurchases] = useState<CardPurchase[]>([]);
  const [cardInventoryCount, setCardInventoryCount] = useState(0);
  const [currentPurchasePrice, setCurrentPurchasePrice] = useState(0);
  const [currentSellingPrice, setCurrentSellingPrice] = useState(0);
  
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerTransactions, setPartnerTransactions] = useState<PartnerTransaction[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierTransactions, setSupplierTransactions] = useState<SupplierTransaction[]>([]);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dark_mode') === 'true';
    } catch {
      return false;
    }
  });
  const [simPackages, setSimPackages] = useState<SimPackage[]>([]);
  const [simInventoryTransactions, setSimInventoryTransactions] = useState<SimInventoryTransaction[]>([]);
  const [simSales, setSimSales] = useState<SimSale[]>([]);
  const [simNumbers, setSimNumbers] = useState<SimNumber[]>([]);

  const asiaBalance = useMemo(() => {
    return simNumbers.filter(n => n.type === 'asia' && n.status === 'available').length;
  }, [simNumbers]);

  const zainBalance = useMemo(() => {
    return simNumbers.filter(n => n.type === 'zain' && n.status === 'available').length;
  }, [simNumbers]);

  const addNotification = useCallback((title: string, message: string, type: Notification['type']) => {
    const newNotification: Notification = {
      id: Date.now(),
      title,
      message,
      date: new Date().toISOString(),
      read: false,
      type
    };
    setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const markNotificationAsRead = (id: number) => {
    setNotifications(prev => {
      const n = prev.find(x => x.id === id);
      if ((n as any)?.fromApi) notificationsApi.markAsRead(id).catch(() => {});
      return prev.map(nn => nn.id === id ? { ...nn, read: true } : nn);
    });
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    notificationsApi.markAllAsRead().catch(() => {});
  };

  const logActivity = (section: string, action: string, details?: string) => {
    activityLogApi.create({ section, action, details }).catch(() => {});
  };

  const [walletTransactions, setWalletTransactions] = useState<Transaction[]>([]);

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);

  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [suspendIdleLogout, setSuspendIdleLogout] = useState(false);

  const walletBalance = useMemo(() => {
    const ftth = walletTransactions.filter(t => (t as any).walletType !== 'wireless' && (t as any).wallet_type !== 'wireless');
    const totalRecharge = ftth.filter(t => t.type === 'recharge').reduce((sum, t) => sum + Number((t as any).amount ?? 0), 0);
    const totalExpense = ftth.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number((t as any).amount ?? 0), 0);
    return totalRecharge - totalExpense;
  }, [walletTransactions]);

  const wirelessWalletBalance = useMemo(() => {
    const wireless = walletTransactions.filter(t => (t as any).walletType === 'wireless' || (t as any).wallet_type === 'wireless');
    const totalRecharge = wireless.filter(t => t.type === 'recharge').reduce((sum, t) => sum + Number((t as any).amount ?? 0), 0);
    const totalExpense = wireless.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number((t as any).amount ?? 0), 0);
    return totalRecharge - totalExpense;
  }, [walletTransactions]);

  useEffect(() => {
    if (!currentUser) return;
    const loadData = async () => {
      setIsInitialLoading(true);
      try {
        const [
          usersData,
          subscribersData,
          subscriberHistoryData,
          internetMaterialSalesData,
          cashbackHistoryData,
          materialsData,
          officeCustomersData,
          officeSalesData,
          walletData,
          expensesData,
          partnersData,
          partnerTransactionsData,
          suppliersData,
          simPackagesData,
          simInventoryData,
          simSalesData,
          simNumbersData,
          settingsData,
          cardWalletTransactionsData,
          cardPurchasesData,
          cardSalesData,
          notificationsData
        ] = await Promise.all([
          usersApi.getAll().catch(() => []),
          subscribersApi.getAll().catch(() => []),
          subscribersApi.getHistory().catch(() => []),
          internetApi.getMaterialSales().catch(() => []),
          expensesApi.getCashbackHistory().catch(() => []),
          materialsApi.getAll().catch(() => []),
          materialsApi.getCustomers(true).catch(() => []),
          materialsApi.getSales().catch(() => []),
          walletApi.getAll().catch(() => []),
          expensesApi.getAll().catch(() => []),
          partnersApi.getAll().catch(() => []),
          partnersApi.getTransactions().catch(() => []),
          suppliersApi.getSuppliers().catch(() => []),
          simCardsApi.getPackages().catch(() => []),
          simCardsApi.getInventory().catch(() => []),
          simCardsApi.getSales().catch(() => []),
          simCardsApi.getNumbers().catch(() => []),
          settingsApi.getAll().catch(() => []),
          cardsApi.getWalletTransactions().catch(() => []),
          cardsApi.getPurchases().catch(() => []),
          cardsApi.getSales().catch(() => []),
          notificationsApi.getAll().catch(() => [])
        ]);

        if (Array.isArray(notificationsData) && notificationsData.length > 0) {
          const mapped = notificationsData.map((n: any) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            date: n.date || new Date().toISOString(),
            read: !!n.read,
            type: (n.type || 'info') as Notification['type'],
            fromApi: true,
          }));
          setNotifications(prev => [...mapped, ...prev.filter(p => !(p as any).fromApi)]);
        }

        if (Array.isArray(usersData) && usersData.length > 0) setUsers(usersData as User[]);
        if (Array.isArray(subscribersData)) {
          setSubscribers(
            mergeSubscribersWithHistory(subscribersData, subscriberHistoryData) as Subscriber[],
          );
        }
        setMaterialSales(Array.isArray(internetMaterialSalesData) ? internetMaterialSalesData : []);
        const mappedCashbackHistory = Array.isArray(cashbackHistoryData)
          ? cashbackHistoryData.map((item: any) => ({
              id: item.id,
              date: item.date ? String(item.date).split('T')[0] : '',
              value: Number(item.value ?? item.amount ?? 0),
              user: item.user || item.description || 'النظام',
              description: item.description || '',
            }))
          : [];
        setCashbackHistory(mappedCashbackHistory);
        if (mappedCashbackHistory.length > 0) {
          setCashbackValue(Number(mappedCashbackHistory[0].value || 0));
        }
        if (Array.isArray(materialsData)) {
          setOfficeMaterials(
            materialsData.map((m: any) => ({
              id: m.id,
              name: m.name,
              purchasePrice: Number(m.purchasePrice ?? m.purchase_price ?? 0),
              sellingPrice: Number(m.sellingPrice ?? m.selling_price ?? 0),
              quantity: Number(m.quantity ?? 0),
              purchase_price: m.purchase_price,
              selling_price: m.selling_price,
            })) as OfficeMaterial[],
          );
        }
        if (Array.isArray(officeCustomersData)) {
          setOfficeCustomers(officeCustomersData as OfficeCustomer[]);
        }
        if (Array.isArray(officeSalesData)) {
          setOfficeSales(officeSalesData as OfficeSale[]);
        }
        if (Array.isArray(walletData) && walletData.length > 0) {
          const normalizedWallet = walletData.map((t: any) => ({
            ...t,
            amount: Number(t?.amount ?? 0),
            walletType: t?.walletType ?? t?.wallet_type ?? 'ftth',
          }));
          setWalletTransactions(normalizedWallet);
        }
        setExpenses(Array.isArray(expensesData) ? expensesData.map((item: any) => ({ id: item.id, date: item.date ? String(item.date).split('T')[0] : '', category: item.category || item.description || '', amount: Number(item.amount || 0), description: item.description || '' })) : []);
        if (Array.isArray(partnersData) && partnersData.length > 0) {
          setPartners(
            partnersData.map((p: any) => ({ ...p, joinDate: p.join_date ?? p.joinDate })) as Partner[],
          );
        }
        if (Array.isArray(partnerTransactionsData)) {
          setPartnerTransactions(partnerTransactionsData as PartnerTransaction[]);
        }
        if (Array.isArray(suppliersData)) {
          setSuppliers(
            suppliersData.map((s: any) => ({
              id: s.id,
              name: s.name,
              specialty: s.specialty ?? '',
              phone: s.phone ?? '',
              outstandingDebt: Number(s.outstanding_debt ?? s.outstandingDebt ?? 0),
            })),
          );
        }
        if (Array.isArray(simPackagesData) && simPackagesData.length > 0) {
          setSimPackages(
            simPackagesData.map((p: any) => ({
              ...p,
              topupAmount: Number(p?.topupAmount ?? p?.topup_amount ?? 0),
              companyCommission: Number(p?.companyCommission ?? p?.company_commission ?? 0),
              jbReturn: Number(p?.jbReturn ?? p?.jb_return ?? 0),
              cost: Number(p?.cost ?? 0),
              sellingPrice: Number(p?.sellingPrice ?? p?.selling_price ?? 0),
            })),
          );
        }
        if (Array.isArray(simInventoryData) && simInventoryData.length > 0) {
          setSimInventoryTransactions(
            simInventoryData.map((t: any) => ({
              ...t,
              date: t?.date ? String(t.date).split('T')[0] : t?.date,
            })),
          );
        }
        if (Array.isArray(simSalesData) && simSalesData.length > 0) {
          setSimSales(
            simSalesData.map((s: any) => ({
              ...s,
              packageId: s?.packageId ?? s?.package_id,
              simNumberId: s?.simNumberId ?? s?.sim_number_id,
              sellingPrice: Number(s?.sellingPrice ?? s?.selling_price ?? 0),
              cost: Number(s?.cost ?? 0),
              profit: Number(s?.profit ?? 0),
              companyCommission: Number(s?.companyCommission ?? s?.company_commission ?? 0),
              jbReturn: Number(s?.jbReturn ?? s?.jb_return ?? 0),
              date: s?.date ? String(s.date).split('T')[0] : s?.date,
            })),
          );
        }
        if (Array.isArray(simNumbersData) && simNumbersData.length > 0) {
          setSimNumbers(
            simNumbersData.map((n: any) => ({
              ...n,
              soldDate: n?.soldDate ?? n?.sold_date,
              packageId: n?.packageId ?? n?.package_id,
            })),
          );
        }
        const cardWalletData = Array.isArray(cardWalletTransactionsData) ? cardWalletTransactionsData : [];
        setSwigTransactions(cardWalletData.filter((t: any) => t.walletType === 'swig'));
        setQiTransactions(cardWalletData.filter((t: any) => t.walletType === 'qi'));
        const swigLast = cardWalletData.filter((t: any) => t.walletType === 'swig').sort((a: any, b: any) => b.id - a.id)[0];
        const qiLast = cardWalletData.filter((t: any) => t.walletType === 'qi').sort((a: any, b: any) => b.id - a.id)[0];
        setSwigBalance(swigLast ? Number(swigLast.balanceAfter || 0) : 0);
        setQiBalance(qiLast ? Number(qiLast.balanceAfter || 0) : 0);
        const purchases = Array.isArray(cardPurchasesData)
          ? cardPurchasesData.map((item: any) => ({
              ...item,
              totalCost: Number(item.totalCost ?? item.totalAmount ?? 0),
            }))
          : [];
        const sales = Array.isArray(cardSalesData)
          ? cardSalesData.map((item: any) => ({
              ...item,
              total: Number(item.total ?? item.totalAmount ?? 0),
            }))
          : [];
        setCardPurchases(purchases);
        setCardSales(sales);
        const inventory = purchases.reduce((sum: number, p: any) => sum + Number(p.quantity || 0), 0) - sales.reduce((sum: number, s: any) => sum + Number(s.quantity || 0), 0);
        setCardInventoryCount(Math.max(0, inventory));
        const latestPurchase = purchases[0];
        if (latestPurchase) {
          setCurrentPurchasePrice(Number(latestPurchase.purchasePrice || 0));
          setCurrentSellingPrice(Number(latestPurchase.sellingPrice || 0));
        }
        if (Array.isArray(settingsData) && settingsData.length > 0) {
          const s = settingsData[0] as any;
          setSystemSettings({
            ...s,
            walletAlertThreshold: Number(s?.walletAlertThreshold ?? s?.wallet_alert_threshold ?? 50000),
            stockAlertThreshold: Number(s?.stockAlertThreshold ?? s?.stock_alert_threshold ?? 5),
            earthlinkThreshold: Number(s?.earthlinkThreshold ?? s?.earthlink_threshold ?? 50000),
            swigThreshold: Number(s?.swigThreshold ?? s?.swig_threshold ?? 50000),
            qiThreshold: Number(s?.qiThreshold ?? s?.qi_threshold ?? 50000),
            cardsThreshold: Number(s?.cardsThreshold ?? s?.cards_threshold ?? 5),
            materialsThreshold: Number(s?.materialsThreshold ?? s?.materials_threshold ?? 5),
            officeName: s?.officeName ?? s?.office_name ?? "مكتب الملك",
            officePhone: s?.officePhone ?? s?.office_phone ?? "",
            officeAddress: s?.officeAddress ?? s?.office_address ?? "",
            cardsReportName: s?.cardsReportName ?? s?.cards_report_name ?? "قضاء علي الغربي SWG70",
            cards_report_name: s?.cards_report_name ?? s?.cardsReportName ?? "قضاء علي الغربي SWG70",
            backupStoragePath: s?.backupStoragePath ?? s?.backup_storage_path ?? null,
            backupSchedule: (s?.backupSchedule ?? s?.backup_schedule ?? "none") as SystemSettings["backupSchedule"],
            backupScheduleTime: s?.backupScheduleTime ?? s?.backup_schedule_time ?? "02:00",
            backupScheduleWeekday:
              s?.backupScheduleWeekday ?? s?.backup_schedule_weekday ?? null,
            backupScheduleMonthDay:
              s?.backupScheduleMonthDay ?? s?.backup_schedule_month_day ?? null,
            backupLastScheduledAt:
              s?.backupLastScheduledAt ?? s?.backup_last_scheduled_at ?? null,
          });
        }
      } catch (error) {
        console.error('Failed to load initial data', error);
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadData();
  }, [currentUser]);

  useEffect(() => {
    try {
      if (darkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('dark_mode', 'true');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('dark_mode', 'false');
      }
    } catch {}
  }, [darkMode]);

  return (
    <AppContext.Provider value={{ 
      walletTransactions, 
      setWalletTransactions, 
      walletBalance,
      wirelessWalletBalance, 
      subscribers, 
      setSubscribers,
      users,
      setUsers,
      currentUser,
      setCurrentUser,
      materialSales,
      setMaterialSales,
      cashbackValue,
      setCashbackValue,
      cashbackHistory,
      setCashbackHistory,
      expenses,
      setExpenses,
      notifications,
      setNotifications,
      addNotification,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      logActivity,
      systemSettings,
      setSystemSettings,
      officeMaterials,
      setOfficeMaterials,
      officeCustomers,
      setOfficeCustomers,
      officeSales,
      setOfficeSales,
      swigTransactions,
      setSwigTransactions,
      qiTransactions,
      setQiTransactions,
      cardSales,
      setCardSales,
      swigBalance,
      setSwigBalance,
      qiBalance,
      setQiBalance,
      cardPurchases,
      setCardPurchases,
      cardInventoryCount,
      setCardInventoryCount,
      currentPurchasePrice,
      setCurrentPurchasePrice,
      currentSellingPrice,
      setCurrentSellingPrice,
      partners,
      setPartners,
      partnerTransactions,
      setPartnerTransactions,
      suppliers,
      setSuppliers,
      supplierTransactions,
      setSupplierTransactions,
      simPackages,
      setSimPackages,
      simInventoryTransactions,
      setSimInventoryTransactions,
      simSales,
      setSimSales,
      simNumbers,
      setSimNumbers,
      asiaBalance,
      zainBalance,
      darkMode,
      setDarkMode,
      isInitialLoading,
      suspendIdleLogout,
      setSuspendIdleLogout
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
