import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Users, Map, Package, Wallet, Search, Plus, Filter, Download, Upload, MapPin, X, Tags, Trash2, Edit, Navigation, ShoppingCart, ArrowUpRight, ArrowDownRight, Calendar, Layers, BarChart3, History, DollarSign, CreditCard, TrendingUp, Printer, ExternalLink, ClipboardList, RefreshCcw } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { subscribersApi } from '@/api/subscribers';
import { walletApi } from '@/modules/internet/api/wallet.api';
import { internetApi, subscribersImportExportApi } from '@/api/internet';
import { ftthPortalApi } from '@/modules/internet/api/ftthPortal.api';
import { expensesApi } from '@/api/expenses';
import { ApiRequestError, fetchApi } from '@/api/client';
import { notifyPersistence } from '@/utils/persistence';
import { canAction } from '@/utils/permissions';
import {
  addLocalDays,
  calculateSubscriptionDates,
  computeRenewalExpirationDate,
  formatLocalDate,
  formatRemainingDaysLabel,
  parseLocalDate,
  remainingCalendarDaysUntil,
  startOfLocalDay,
  subscriberDisplayStatus,
  SUBSCRIPTION_PERIOD_CALENDAR_OFFSET,
} from '@/utils/subscriptionDates';
import {
  FTTH_DEFAULT_SPAN_DAYS,
  formatDateDDMMYYYY,
  syncFtthImportDateFields,
  type FtthDurationMode,
} from '@/utils/ftthDateCalculations';
import { mergeSubscribersWithHistory } from '@/utils/subscriberListMerge';
import { IRAQ_PHONE_HINT_AR, normalizeIraqMobile, requireIraqMobile } from '@/utils/iraqPhone';

import {
  parseCoordinates,
  MapBoundsUpdater,
  MapClickHandler,
  MapControls,
  createFatIcon,
  createSubscriberIcon,
  InternetTabBar,
  PhoneDirectoryTab,
  FTTHPortal,
  type InternetTab,
} from './components';
import AlertsPage from './AlertsPage';
import { useAppContext, type Subscriber, type MaterialSale, type Transaction } from '@/context/AppContext';

type SubscriberHistoryRow = NonNullable<Subscriber['history']>[number];

type SubscriberDebtSummary = {
  subscriberId: number;
  totalDebt: number;
  currentDebt: number;
  previousDebt: number;
  sumFromEntries: number;
  entriesSynced: boolean;
  entries: Array<{
    id: number;
    amount: number;
    remainingAmount: number;
    debtDate: string | null;
    description: string;
    debtScope: string;
    entrySource: string;
  }>;
};

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function Internet() {
  const { 
    walletTransactions, 
    setWalletTransactions, 
    walletBalance,
    wirelessWalletBalance,
    subscribers, 
    setSubscribers, 
    currentUser,
    materialSales,
    setMaterialSales,
    cashbackValue,
    setCashbackValue,
    cashbackHistory,
    setCashbackHistory,
    systemSettings,
    addNotification,
    logActivity
  } = useAppContext();
  const canInternet = (action: string) => canAction(currentUser, 'internet', action);
  const [activeTab, setActiveTab] = useState<InternetTab>('subscribers');
  const [isAddSubscriberOpen, setIsAddSubscriberOpen] = useState(false);
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [isEditMaterialOpen, setIsEditMaterialOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [isSellMaterialOpen, setIsSellMaterialOpen] = useState(false);
  const [sellMaterialId, setSellMaterialId] = useState<number | ''>('');
  const [sellQuantity, setSellQuantity] = useState<number>(1);
  const [sellSubscriberId, setSellSubscriberId] = useState<number | ''>('');
  const [sellPaymentMethod, setSellPaymentMethod] = useState<'cash' | 'debt'>('cash');
  const [isAddZoneOpen, setIsAddZoneOpen] = useState(false);
  const [isAddFatOpen, setIsAddFatOpen] = useState(false);
  const [isEditFatOpen, setIsEditFatOpen] = useState(false);
  const [selectedFat, setSelectedFat] = useState<any>(null);
  const [isRechargeWalletOpen, setIsRechargeWalletOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [isEditCategoryOpen, setIsEditCategoryOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [isSubscriberDetailsOpen, setIsSubscriberDetailsOpen] = useState(false);
  const [isEditSubscriberOpen, setIsEditSubscriberOpen] = useState(false);
  const [selectedSubscriber, setSelectedSubscriber] = useState<any>(null);
  const [isSubscribersMapVisible, setIsSubscribersMapVisible] = useState(false);
  /** تبويب المناطق والفاتات: إظهار/إخفاء الخريطة لاستغلال المساحة */
  const [isZonesMapVisible, setIsZonesMapVisible] = useState(true);
  const [isPayDebtOpen, setIsPayDebtOpen] = useState(false);
  const [payDebtAmount, setPayDebtAmount] = useState<number>(0);
  const [subscriberDebtSummary, setSubscriberDebtSummary] = useState<SubscriberDebtSummary | null>(null);
  const [subscriberDebtSummaryLoading, setSubscriberDebtSummaryLoading] = useState(false);
  const [isDebtManageOpen, setIsDebtManageOpen] = useState(false);
  const [newDebtFormAmount, setNewDebtFormAmount] = useState('');
  const [newDebtFormDate, setNewDebtFormDate] = useState('');
  const [newDebtFormDesc, setNewDebtFormDesc] = useState('');
  const [newDebtFormScope, setNewDebtFormScope] = useState<'current' | 'previous'>('current');
  const [newDebtSubmitting, setNewDebtSubmitting] = useState(false);
  // تسديد سجل دين محدد
  const [settleEntryId, setSettleEntryId] = useState<number | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDate, setSettleDate] = useState('');
  const [settleDesc, setSettleDesc] = useState('');
  const [settleSubmitting, setSettleSubmitting] = useState(false);

  const [isSubscribersImportModalOpen, setIsSubscribersImportModalOpen] = useState(false);
  const [subscribersImportFile, setSubscribersImportFile] = useState<File | null>(null);
  const [subscribersImportLoading, setSubscribersImportLoading] = useState(false);
  const [subscribersImportMessage, setSubscribersImportMessage] = useState('');
  const [subscribersExportLoading, setSubscribersExportLoading] = useState(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [renewFormData, setRenewFormData] = useState(() => ({
    subscriberId: 0,
    renewalDate: formatLocalDate(startOfLocalDay(new Date())),
    amountReceived: '',
    renewalMethod: 'page' as 'page' | 'master',
    renewalPaymentMethod: 'cash' as 'cash' | 'debt',
  }));

  const isAdmin = currentUser?.role === 'admin';
  /** بوابة FTTH ودليل الهواتف: مدير أو المفتاح المفعّل في permissions.internet فقط (لا يكفي «إضافة مشترك») */
  const showFtthPortalTab = isAdmin || canInternet('ftthPortal');
  const showPhoneDirectoryTab = isAdmin || canInternet('phoneDirectory');

  useEffect(() => {
    if (activeTab === 'phoneDirectory' && !showPhoneDirectoryTab) setActiveTab('subscribers');
    if (activeTab === 'ftthPortal' && !showFtthPortalTab) setActiveTab('subscribers');
  }, [activeTab, showPhoneDirectoryTab, showFtthPortalTab]);

  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    const prev = prevActiveTabRef.current;
    prevActiveTabRef.current = activeTab;
    if (prev === 'ftthPortal' && activeTab === 'subscribers') {
      void (async () => {
        const [fresh, hist] = await Promise.all([
          subscribersApi.getAll().catch(() => []),
          subscribersApi.getHistory().catch(() => []),
        ]);
        if (Array.isArray(fresh)) {
          setSubscribers(mergeSubscribersWithHistory(fresh, hist) as any[]);
        }
      })();
    }
  }, [activeTab, setSubscribers]);
  
  const [materialSearchQuery, setMaterialSearchQuery] = useState('');
  const [subscriberSearchQuery, setSubscriberSearchQuery] = useState('');
  const [debtsSearchQuery, setDebtsSearchQuery] = useState('');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [selectedSubscriptionTypeFilter, setSelectedSubscriptionTypeFilter] = useState<'all' | 'ftth' | 'wireless'>('all');
  const [subscribersPageSize, setSubscribersPageSize] = useState<number>(50);
  const [subscribersPage, setSubscribersPage] = useState(1);
  const [expirationDateFromFilter, setExpirationDateFromFilter] = useState('');
  const [expirationDateToFilter, setExpirationDateToFilter] = useState('');
  const [subscriberFtthDetailUrl, setSubscriberFtthDetailUrl] = useState<string | null>(null);
  const [subscriberDetailLoading, setSubscriberDetailLoading] = useState(false);
  const [subscriberDetailError, setSubscriberDetailError] = useState<string | null>(null);
  const [ftthSyncingId, setFtthSyncingId] = useState<number | null>(null);
  /** فتح صفحة FTTH بالمعرّف الخارجي من داخل نافذة المشترك — لا يعتمد على الترحيل */

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');

  useEffect(() => {
    if (!isSubscriberDetailsOpen || !selectedSubscriber?.id) {
      setSubscriberDebtSummary(null);
      return;
    }
    let cancelled = false;
    setSubscriberDebtSummaryLoading(true);
    void subscribersApi
      .getDebtSummary(selectedSubscriber.id)
      .then((data) => {
        if (!cancelled) setSubscriberDebtSummary(data as SubscriberDebtSummary);
      })
      .catch(() => {
        if (!cancelled) setSubscriberDebtSummary(null);
      })
      .finally(() => {
        if (!cancelled) setSubscriberDebtSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSubscriberDetailsOpen, selectedSubscriber?.id]);

  const [materials, setMaterials] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [fats, setFats] = useState<any[]>([]);

  // ── ملخص التقارير من API (مصدر الحقيقة: قاعدة البيانات) ─────────────────
  const [apiReportSummary, setApiReportSummary] = useState<{
    cashCollected: number;
    debtsCreated: number;
    totalProfits: number;
    wirelessProfits: number;
    materialProfit: number;
    materialCash: number;
    subscriptionCash: number;
    cashbackExpected: number;
    currentDebts: number;
    ftthSubscriberCount: number;
    subscriberCount: number;
  } | null>(null);
  const [reportSummaryLoading, setReportSummaryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReportSummaryLoading(true);
    internetApi
      .getReportSummary({ startDate: reportStartDate || undefined, endDate: reportEndDate || undefined })
      .then((data: any) => { if (!cancelled) setApiReportSummary(data); })
      .catch(() => { if (!cancelled) setApiReportSummary(null); })
      .finally(() => { if (!cancelled) setReportSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [reportStartDate, reportEndDate]);

  // isDateInRange لا يزال مستخدماً لتصفية جداول مبيعات المواد وكاش باك في الواجهة
  const isDateInRange = useCallback((dateStr: string) => {
    if (!reportStartDate && !reportEndDate) return true;
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    if (reportStartDate) {
      const start = new Date(reportStartDate);
      start.setHours(0, 0, 0, 0);
      if (d < start) return false;
    }
    if (reportEndDate) {
      const end = new Date(reportEndDate);
      end.setHours(23, 59, 59, 999);
      if (d > end) return false;
    }
    return true;
  }, [reportStartDate, reportEndDate]);

  const internetReportData = useMemo(() => ({
    cashCollected: apiReportSummary?.cashCollected ?? 0,
    debtsCreated: apiReportSummary?.debtsCreated ?? 0,
    totalProfits: apiReportSummary?.totalProfits ?? 0,
    wirelessProfits: apiReportSummary?.wirelessProfits ?? 0,
    ftthSubscribersCount: apiReportSummary?.ftthSubscriberCount ?? 0,
    currentDebts: apiReportSummary?.currentDebts ?? 0,
    isDateInRange,
  }), [apiReportSummary, isDateInRange]);

  const [newSubscriberName, setNewSubscriberName] = useState('');
  const [newSubscriberNationalName, setNewSubscriberNationalName] = useState('');
  const [newSubscriberPhone, setNewSubscriberPhone] = useState('');
  const [newSubscriberType, setNewSubscriberType] = useState<'ftth' | 'wireless'>('ftth');
  const [newSubscriberCategory, setNewSubscriberCategory] = useState('');
  const [newSubscriberZone, setNewSubscriberZone] = useState('');
  const [newSubscriberFat, setNewSubscriberFat] = useState('');
  const [newSubscriberLocation, setNewSubscriberLocation] = useState('');
  const [newSubscriberPaidAmount, setNewSubscriberPaidAmount] = useState('');
  const [newSubscriberSubscriptionDate, setNewSubscriberSubscriptionDate] = useState(new Date().toISOString().split('T')[0]);
  const [newSubscriberExpirationDate, setNewSubscriberExpirationDate] = useState('');
  const [newSubscriberSpanDaysStr, setNewSubscriberSpanDaysStr] = useState(String(FTTH_DEFAULT_SPAN_DAYS));
  const [newSubscriberDurationMode, setNewSubscriberDurationMode] = useState<FtthDurationMode>('calendar_days');
  const [newSubscriberPaymentMethod, setNewSubscriberPaymentMethod] = useState<'wallet' | 'cash'>('cash');

  const generatedUserCode = useMemo(() => {
    if (newSubscriberType === 'wireless') return '—';
    const name = (newSubscriberName || '').trim();
    const arabicToLatin: Record<string, string> = {
      'ا': 'A', 'أ': 'A', 'إ': 'A', 'آ': 'A',
      'ب': 'B', 'ت': 'T', 'ث': 'TH', 'ج': 'J', 'ح': 'H', 'خ': 'KH',
      'د': 'D', 'ذ': 'DH', 'ر': 'R', 'ز': 'Z', 'س': 'S', 'ش': 'SH',
      'ص': 'S', 'ض': 'D', 'ط': 'T', 'ظ': 'Z', 'ع': 'A', 'غ': 'GH',
      'ف': 'F', 'ق': 'Q', 'ك': 'K', 'ل': 'L', 'م': 'M', 'ن': 'N',
      'ه': 'H', 'و': 'W', 'ي': 'Y', 'ى': 'Y', 'ء': 'A', 'ؤ': 'W',
      'ئ': 'Y', 'ة': 'H',
    };
    const ch = name ? name.charAt(0) : '';
    const first = (arabicToLatin[ch] || (ch && /[a-z]/i.test(ch) ? ch.toUpperCase() : '') || 'X');
    
    // Resolve names from IDs for user_code generation
    const zoneName = zones.find(z => z.id.toString() === newSubscriberZone)?.name || '';
    const fatName = fats.find(f => f.id.toString() === newSubscriberFat)?.name || '';
    
    const phone = (newSubscriberPhone || '').trim();
    const lastTwoPhone = (phone.replace(/\D/g, '').slice(-2) || '').padStart(2, '0');
    const safeFat = (fatName || '').replace(/\s+/g, '').replace(/[^\w\-]/g, '') || 'FAT';
    const safeZone = (zoneName || '').replace(/\s+/g, '').replace(/[^\w\-]/g, '') || 'ZONE';
    return `${first}-${safeZone}-${safeFat}-${lastTwoPhone}`;
  }, [newSubscriberType, newSubscriberName, newSubscriberZone, newSubscriberFat, newSubscriberPhone, zones, fats]);

  const [newZoneName, setNewZoneName] = useState('');
  const [newFatZoneId, setNewFatZoneId] = useState('');
  const [newFatName, setNewFatName] = useState('');
  const [newFatCoordinates, setNewFatCoordinates] = useState('');

  const [newMaterialName, setNewMaterialName] = useState('');
  const [newMaterialPurchasePrice, setNewMaterialPurchasePrice] = useState('');
  const [newMaterialSellingPrice, setNewMaterialSellingPrice] = useState('');
  const [newMaterialQuantity, setNewMaterialQuantity] = useState('');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryPrice, setNewCategoryPrice] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<'ftth' | 'wireless'>('ftth');
  const [newCategoryCostPrice, setNewCategoryCostPrice] = useState('');

  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeDate, setRechargeDate] = useState(new Date().toISOString().split('T')[0]);
  const [rechargeNotes, setRechargeNotes] = useState('');
  const [rechargeWalletType, setRechargeWalletType] = useState<'ftth' | 'wireless'>('ftth');

  useEffect(() => {
    if (!isSubscriberDetailsOpen || !selectedSubscriber?.id) {
      setSubscriberFtthDetailUrl(null);
      return;
    }
    const subType = (
      selectedSubscriber.subscriptionType ??
      selectedSubscriber.subscription_type ??
      'ftth'
    )
      .toLowerCase()
      .trim();
    if (subType === 'wireless') {
      setSubscriberFtthDetailUrl(null);
      return;
    }
    const sid = selectedSubscriber.id;
    const cacheKey = `ftth_subscriber_detail_url_${sid}`;
    let cancelled = false;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { u?: string; t?: number };
        if (parsed?.u && typeof parsed.u === 'string' && parsed.u.startsWith('http')) {
          if (!cancelled) setSubscriberFtthDetailUrl(parsed.u);
        }
      }
    } catch {
      /* ignore */
    }
    ftthPortalApi
      .getImportedSubscriberLink(sid)
      .then((r) => {
        if (cancelled) return;
        const linked =
          typeof (r as { linked?: boolean }).linked === 'boolean'
            ? Boolean((r as { linked?: boolean }).linked)
            : !!(r as { detailUrl?: string }).detailUrl;
        const url =
          (r as { detailUrl?: string; detail_url?: string }).detailUrl ??
          (r as { detail_url?: string }).detail_url ??
          null;
        if (linked && url && typeof url === 'string') {
          setSubscriberFtthDetailUrl(url);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ u: url, t: Date.now() }));
          } catch {
            /* ignore */
          }
        } else {
          setSubscriberFtthDetailUrl(null);
          try {
            sessionStorage.removeItem(cacheKey);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSubscriberFtthDetailUrl(null);
        try {
          sessionStorage.removeItem(cacheKey);
        } catch {
          /* ignore */
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    isSubscriberDetailsOpen,
    selectedSubscriber?.id,
    selectedSubscriber?.subscriptionType,
    selectedSubscriber?.subscription_type,
  ]);

  /** ?ftthExternalId= → صفحة مستقلة /internet/ftth-customer/:id (يعمل مع refresh) */
  const ftthExternalIdParam = searchParams.get('ftthExternalId');
  useEffect(() => {
    const raw = ftthExternalIdParam?.trim();
    if (!raw || !/^\d+$/.test(raw)) return;
    navigate(`/internet/ftth-customer/${encodeURIComponent(raw)}`, { replace: true });
  }, [ftthExternalIdParam, navigate]);

  const refreshInternetPageData = useCallback(async () => {
    try {
      const ts = Date.now();
      const [
        fresh, 
        hist, 
        sales, 
        summary, 
        wallets,
        zonesData,
        fatsData,
        categoriesData,
        materialsData
      ] = await Promise.all([
        fetchApi(`/api/subscribers?_t=${ts}`).catch(() => []),
        fetchApi(`/api/subscriber-history?_t=${ts}`).catch(() => []),
        fetchApi(`/api/internet/material-sales?_t=${ts}`).catch(() => []),
        fetchApi(`/api/internet/reports/summary?startDate=${reportStartDate || ''}&endDate=${reportEndDate || ''}&_t=${ts}`).catch(() => null),
        fetchApi(`/api/wallet-transactions?_t=${ts}`).catch(() => []),
        fetchApi(`/api/internet/zones?_t=${ts}`).catch(() => []),
        fetchApi(`/api/internet/fats?_t=${ts}`).catch(() => []),
        fetchApi(`/api/internet/categories?_t=${ts}`).catch(() => []),
        fetchApi(`/api/internet/materials?_t=${ts}`).catch(() => []),
      ]);
      
      if (Array.isArray(fresh) && Array.isArray(hist)) {
        const merged = mergeSubscribersWithHistory(fresh, hist) as any[];
        setSubscribers(merged);
        
        if (selectedSubscriber && (isSubscriberDetailsOpen || isPayDebtOpen)) {
          const updated = merged.find((s: any) => s.id === selectedSubscriber.id);
          if (updated) setSelectedSubscriber(updated);
        }
      }
      
      if (Array.isArray(sales)) setMaterialSales(sales);
      if (summary) setApiReportSummary(summary);
      if (Array.isArray(zonesData)) setZones(zonesData);
      if (Array.isArray(fatsData)) setFats(fatsData.map((f: any) => ({ ...f, zoneId: f.zoneId ?? f.zone_id })));
      if (Array.isArray(categoriesData)) setCategories(categoriesData);
      if (Array.isArray(materialsData)) setMaterials(materialsData);

      if (Array.isArray(wallets)) {
        const normalizedWallet = wallets.map((t: any) => ({
          ...t,
          amount: Number(t?.amount ?? 0),
          walletType: t?.walletType ?? t?.wallet_type ?? 'ftth',
        }));
        setWalletTransactions(normalizedWallet);
      }
      
      if (isSubscriberDetailsOpen && selectedSubscriber) {
        subscribersApi.getDebtSummary(selectedSubscriber.id).then((data: any) => setSubscriberDebtSummary(data)).catch(() => {});
      }
      
    } catch (error) {
      console.error('Failed to auto-refresh data', error);
    }
  }, [
    setSubscribers,
    setMaterialSales,
    setWalletTransactions,
    reportStartDate,
    reportEndDate,
    selectedSubscriber,
    isSubscriberDetailsOpen,
    isPayDebtOpen,
  ]);

  const refreshInternetMeta = refreshInternetPageData;

  useEffect(() => {
    void refreshInternetMeta();
  }, [refreshInternetMeta]);

  const walletStats = useMemo(() => {
    const ftth = walletTransactions.filter(t => (t as any).walletType !== 'wireless' && (t as any).wallet_type !== 'wireless');
    const totalRecharge = ftth.filter(t => t.type === 'recharge').reduce((sum, t) => sum + Number((t as any).amount ?? 0), 0);
    const totalExpense = ftth.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number((t as any).amount ?? 0), 0);
    const balance = totalRecharge - totalExpense;
    return { balance, totalRecharge, totalExpense };
  }, [walletTransactions]);

  const wirelessWalletStats = useMemo(() => {
    const wireless = walletTransactions.filter(t => (t as any).walletType === 'wireless' || (t as any).wallet_type === 'wireless');
    const totalRecharge = wireless.filter(t => t.type === 'recharge').reduce((sum, t) => sum + Number((t as any).amount ?? 0), 0);
    const totalExpense = wireless.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number((t as any).amount ?? 0), 0);
    const balance = totalRecharge - totalExpense;
    return { balance, totalRecharge, totalExpense };
  }, [walletTransactions]);

  const filteredSubscribers = useMemo(() => {
    let result = subscribers;
    
    if (selectedZoneFilter !== 'all') {
      const zone = zones.find(z => z.id.toString() === selectedZoneFilter);
      if (zone) {
        result = result.filter(sub => sub.zone === zone.name);
      }
    }

    if (selectedCategoryFilter !== 'all') {
      result = result.filter(sub => sub.category === selectedCategoryFilter);
    }

    if (selectedStatusFilter !== 'all') {
      result = result.filter(sub => subscriberDisplayStatus(sub.expirationDate) === selectedStatusFilter);
    }

    if (selectedSubscriptionTypeFilter !== 'all') {
      result = result.filter(sub => (sub.subscriptionType ?? sub.subscription_type ?? 'ftth').toLowerCase() === selectedSubscriptionTypeFilter);
    }

    if (expirationDateFromFilter) {
      const fromLocal = startOfLocalDay(parseLocalDate(expirationDateFromFilter));
      result = result.filter(sub => {
        if (!sub.expirationDate) return false;
        return startOfLocalDay(parseLocalDate(sub.expirationDate)).getTime() >= fromLocal.getTime();
      });
    }

    if (expirationDateToFilter) {
      const toLocal = startOfLocalDay(parseLocalDate(expirationDateToFilter));
      result = result.filter(sub => {
        if (!sub.expirationDate) return false;
        return startOfLocalDay(parseLocalDate(sub.expirationDate)).getTime() <= toLocal.getTime();
      });
    }

    if (subscriberSearchQuery.trim()) {
      const query = subscriberSearchQuery.toLowerCase();
      result = result.filter(sub => 
        ((sub.realName ?? sub.real_name) || '').toLowerCase().includes(query) || 
        (sub.phone || '').includes(query) ||
        (sub.nationalIdName || '').toLowerCase().includes(query) ||
        String(sub.userCode || '').toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [subscribers, subscriberSearchQuery, selectedZoneFilter, selectedCategoryFilter, selectedStatusFilter, selectedSubscriptionTypeFilter, expirationDateFromFilter, expirationDateToFilter, zones]);

  useEffect(() => {
    setSubscribersPage(1);
  }, [subscriberSearchQuery, selectedZoneFilter, selectedCategoryFilter, selectedStatusFilter, selectedSubscriptionTypeFilter, expirationDateFromFilter, expirationDateToFilter]);

  const paginatedSubscribers = useMemo(() => {
    if (subscribersPageSize <= 0) return filteredSubscribers;
    const start = (subscribersPage - 1) * subscribersPageSize;
    return filteredSubscribers.slice(start, start + subscribersPageSize);
  }, [filteredSubscribers, subscribersPage, subscribersPageSize]);

  const totalSubscriberPages = useMemo(() => {
    if (subscribersPageSize <= 0) return 1;
    return Math.ceil(filteredSubscribers.length / subscribersPageSize) || 1;
  }, [filteredSubscribers.length, subscribersPageSize]);

  const categoriesForAddSubscriber = useMemo(() => {
    if (newSubscriberType === 'wireless') {
      return categories.filter(c => (c.subscriptionType ?? c.subscription_type ?? 'ftth').toLowerCase() === 'wireless');
    }
    return categories.filter(c => (c.subscriptionType ?? c.subscription_type ?? 'ftth').toLowerCase() !== 'wireless');
  }, [categories, newSubscriberType]);

  const subscribersWithDebt = useMemo(() => 
    subscribers.filter(s => Number(s.debt ?? 0) > 0),
    [subscribers]
  );

  const filteredSubscribersWithDebt = useMemo(() => {
    let result = subscribersWithDebt;
    if (debtsSearchQuery.trim()) {
      const q = debtsSearchQuery.toLowerCase();
      result = result.filter(s =>
        ((s.realName ?? s.real_name) || '').toLowerCase().includes(q) ||
        (s.phone || '').includes(q) ||
        (s.nationalIdName || '').toLowerCase().includes(q) ||
        (s.zone || '').toLowerCase().includes(q) ||
        (s.fat || '').toLowerCase().includes(q) ||
        String(s.userCode || '').toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => Number(b.debt ?? 0) - Number(a.debt ?? 0));
  }, [subscribersWithDebt, debtsSearchQuery]);

  const handleExportSubscribers = () => {
    const headers = ['الاسم الحقيقي', 'الاسم في الوطني', 'رقم الهاتف', 'المنطقة', 'FAT', 'الفئة', 'الديون', 'تاريخ الانتهاء', 'الحالة'];
    const csvContent = [
      headers.join(','),
      ...filteredSubscribers.map(sub => 
        `"${sub.realName ?? sub.real_name}","${sub.nationalIdName}","${sub.phone}","${sub.zone}","${sub.fat}","${sub.category}",${sub.debt},"${sub.expirationDate}","${subscriberDisplayStatus(sub.expirationDate)}"`
      )
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `subscribers_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportSubscribers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      alert(
        'هذا الزر يستورد ملفات CSV نصية فقط.\n\n' +
          'ملفات Excel (.xlsx / .xls) ثنائية وليست نصاً — لذلك تظهر رموزاً غريبة إذا استُوردت هنا.\n\n' +
          'استخدم زر «استيراد Excel» (أخضر) أعلى الصفحة لرفع الجدول وحفظه في الخادم.',
      );
      input.value = '';
      return;
    }
    if (!lower.endsWith('.csv')) {
      alert('يُقبل ملف .csv فقط هنا. لملفات Excel استخدم «استيراد Excel».');
      input.value = '';
      return;
    }

    void (async () => {
      try {
        const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        const isXlsxZip = head[0] === 0x50 && head[1] === 0x4b;
        const isOldXls = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
        if (isXlsxZip || isOldXls) {
          alert(
            'الملف يبدو ملف Excel وليس CSV.\n\n' +
              'استخدم زر «استيراد Excel» أعلى الصفحة.',
          );
          input.value = '';
          return;
        }
      } catch {
        /* ignore peek errors */
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          let text = String(event.target?.result ?? '');
          if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
          const lines = text.split(/\r?\n/);
          const newSubs = lines.slice(1).filter(line => line.trim()).map((line, index) => {
            const values = line.split(',').map(val => val.replace(/^"|"$/g, '').trim());
            const rawPhone = (values[2] || '').trim();
            return {
              id: Date.now() + index,
              realName: values[0] || 'بدون اسم',
              nationalIdName: values[1] || '',
              phone: normalizeIraqMobile(rawPhone) ?? rawPhone,
              zone: values[3] || '',
              fat: values[4] || '',
              category: values[5] || '',
              categoryPrice: 0,
              debt: parseFloat(values[6]) || 0,
              subscriptionDate: new Date().toISOString().split('T')[0],
              expirationDate: values[7] || new Date().toISOString().split('T')[0],
              status: values[8] || 'نشط',
              location: '32.467278, 46.689583',
            };
          });

          if (newSubs.length > 0) {
            setSubscribers([...newSubs, ...subscribers]);
            alert(
              `تمت قراءة ${newSubs.length} صف محلياً من CSV.\n\n` +
                'ملاحظة: هذا الزر لا يرسل البيانات للخادم. للحفظ الدائم استخدم «استيراد Excel».',
            );
          }
        } catch (error) {
          console.error('Error parsing CSV:', error);
          alert('حدث خطأ أثناء قراءة الملف. تأكد أنه CSV نصي مُصدَّر من Excel (حفظ باسم CSV UTF-8).');
        } finally {
          input.value = '';
        }
      };
      reader.onerror = () => {
        alert('تعذر قراءة الملف.');
        input.value = '';
      };
      reader.readAsText(file, 'UTF-8');
    })();
  };

  const handleAddSubscriber = async () => {
    if (!newSubscriberCategory || !newSubscriberName.trim()) {
      alert('يرجى إدخال اسم المشترك واختيار فئة الاشتراك');
      return;
    }

    let phone: string;
    try {
      phone = requireIraqMobile(newSubscriberPhone);
    } catch {
      alert(IRAQ_PHONE_HINT_AR);
      return;
    }

    const category = categories.find(c => c.id.toString() === newSubscriberCategory);
    if (!category) {
      alert('فئة الاشتراك غير موجودة');
      return;
    }

    const subType = newSubscriberType || (category.subscriptionType ?? 'ftth');
    const paid = parseFloat(newSubscriberPaidAmount) || 0;
    const debt = Math.max(0, category.price - paid);

    const zone = zones.find(z => z.id.toString() === newSubscriberZone);
    const fat = fats.find(f => f.id.toString() === newSubscriberFat);
    
    // Business Rule: Wallet activation deducts full package price (or cost price for Wireless)
    const walletDeduction = subType === 'wireless' && category.costPrice != null && !isNaN(Number(category.costPrice)) ? Number(category.costPrice) : Number(category.price);
    const walletBal = subType === 'wireless' ? wirelessWalletStats.balance : walletStats.balance;
    const walletHasEnough = (Number(walletBal) || 0) >= walletDeduction;

    if (newSubscriberPaymentMethod === 'wallet' && !walletHasEnough) {
      alert(`الرصيد غير كافٍ في محفظة ${subType === 'wireless' ? 'Wireless' : 'FTTH'}. يرجى التعبئة أولاً.`);
      return;
    }

    try {
      addNotification(
        'تفعيل اشتراك جديد',
        `تم تفعيل اشتراك للمشترك ${newSubscriberName} بفئة ${category.name}${subType === 'wireless' ? ' (Wireless)' : ''}`,
        'activation'
      );
      logActivity?.('internet', 'add_subscriber', `إضافة مشترك ${newSubscriberName} بفئة ${category.name} [طريقة الدفع: ${newSubscriberPaymentMethod === 'wallet' ? 'تم استقطاع المحفظة' : 'نقد/بطاقة'}]`);

      const newSub = {
        realName: newSubscriberName.trim(),
        nationalIdName: subType === 'wireless' ? '' : newSubscriberNationalName.trim(),
        phone,
        zone: zone ? zone.name : '',
        fat: fat ? fat.name : '',
        zoneId: zone ? zone.id : null,
        fatId: fat ? fat.id : null,
        category: category.name,
        categoryPrice: category.price,
        debt,
        subscriptionDate: newSubscriberSubscriptionDate,
        expirationDate: formatLocalDate(
          addLocalDays(parseLocalDate(newSubscriberSubscriptionDate), SUBSCRIPTION_PERIOD_CALENDAR_OFFSET),
        ),
        status: 'نشط',
        location: newSubscriberLocation || '32.467278, 46.689583',
        subscriptionType: subType,
      };

      const subResult = await subscribersApi.createTracked(newSub);
      if (!subResult.ok || !subResult.data) {
        notifyPersistence(subResult);
        return;
      }

      await refreshInternetPageData();

      // Only create wallet transaction if payment method is 'wallet'
      if (newSubscriberPaymentMethod === 'wallet') {
        const expenseAmount = walletDeduction;
        const txResult = await walletApi.createTracked({
          type: 'expense',
          amount: expenseAmount,
          description: `تفعيل اشتراك - ${newSubscriberName}${subType === 'wireless' ? ' (Wireless)' : ''}`,
          walletType: subType === 'wireless' ? 'wireless' : 'ftth',
        });
        if (!txResult.ok || !txResult.data) {
          notifyPersistence(txResult);
        } else {
          const txData = txResult.data as Record<string, unknown>;
          const newTx: Transaction = {
            ...(txData as unknown as Transaction),
            walletType: subType === 'wireless' ? 'wireless' : 'ftth',
            amount: Number(txData?.amount ?? expenseAmount),
          };
          setWalletTransactions([newTx, ...walletTransactions]);
        }
      }

      setIsAddSubscriberOpen(false);
      setNewSubscriberName('');
      setNewSubscriberNationalName('');
      setNewSubscriberPhone('');
      setNewSubscriberType('ftth');
      setNewSubscriberCategory('');
      setNewSubscriberZone('');
      setNewSubscriberFat('');
      setNewSubscriberLocation('');
      setNewSubscriberPaidAmount('');
      setNewSubscriberPaymentMethod('cash');
      setNewSubscriberSubscriptionDate(new Date().toISOString().split('T')[0]);

      alert(newSubscriberPaymentMethod === 'wallet' 
        ? 'تم حفظ المشترك وتم استقطاع المبلغ من المحفظة بنجاح.' 
        : 'تم حفظ المشترك بنجاح (طريقة الدفع: واصل نقدي/بطاقة).');
    } catch (error) {
      console.error('Failed to create subscriber', error);
      alert('حدث خطأ أثناء إضافة المشترك');
    }
  };

  const handleAddZone = async () => {
    if (!newZoneName.trim()) return;
    try {
      const result = await internetApi.createZoneTracked({ name: newZoneName.trim() });
      if (!result.ok || !result.data) {
        notifyPersistence(result);
        return;
      }
      setZones([...zones, result.data]);
      addNotification('إضافة منطقة', `تم إضافة المنطقة ${newZoneName.trim()} بنجاح`, 'info');
      logActivity?.('internet', 'add_zone', `إضافة منطقة ${newZoneName.trim()}`);
      notifyPersistence(result);
      setNewZoneName('');
      setIsAddZoneOpen(false);
    } catch (error) {
      console.error('Failed to add zone', error);
      alert('حدث خطأ أثناء إضافة المنطقة');
    }
  };

  const handleAddFat = async () => {
    if (!newFatZoneId || !newFatName.trim()) {
      alert('يرجى اختيار المنطقة وإدخال اسم FAT');
      return;
    }
    try {
      const result = await internetApi.createFatTracked({
        zoneId: parseInt(newFatZoneId),
        name: newFatName.trim(),
        coordinates: newFatCoordinates || '32.467278, 46.689583'
      });
      if (!result.ok || !result.data) {
        notifyPersistence(result);
        return;
      }
      setFats([...fats, result.data]);
      addNotification('إضافة FAT', `تم إضافة FAT ${newFatName.trim()} بنجاح`, 'info');
      notifyPersistence(result);
      setNewFatZoneId('');
      setNewFatName('');
      setNewFatCoordinates('');
      setIsAddFatOpen(false);
    } catch (error) {
      console.error('Failed to add FAT', error);
      alert('حدث خطأ أثناء إضافة FAT');
    }
  };

  const handleEditFat = async () => {
    if (!selectedFat || !newFatZoneId || !newFatName.trim()) {
      alert('يرجى اختيار المنطقة وإدخال اسم FAT');
      return;
    }
    try {
      const saved = await internetApi.updateFat(selectedFat.id, {
        zoneId: parseInt(newFatZoneId),
        name: newFatName.trim(),
        coordinates: newFatCoordinates || '32.467278, 46.689583'
      });
      setFats(fats.map(fat => (fat.id === selectedFat.id ? saved : fat)));
      addNotification('تعديل FAT', `تم تعديل FAT ${newFatName.trim()} بنجاح`, 'info');
      logActivity?.('internet', 'edit_fat', `تعديل FAT ${newFatName.trim()}`);
      setIsEditFatOpen(false);
      setSelectedFat(null);
    } catch (error) {
      console.error('Failed to edit FAT', error);
      alert('حدث خطأ أثناء تعديل FAT');
    }
  };

  const handleDeleteFat = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الـ FAT؟')) return;
    try {
      const fatName = fats.find(f => f.id === id)?.name || '';
      await internetApi.deleteFat(id);
      setFats(fats.filter(fat => fat.id !== id));
      addNotification('حذف FAT', `تم حذف FAT ${fatName} من النظام`, 'info');
      logActivity?.('internet', 'delete_fat', `حذف FAT ${fatName}`);
    } catch (error) {
      console.error('Failed to delete FAT', error);
      alert('حدث خطأ أثناء حذف FAT');
    }
  };

  const handleDebtFormSubmit = async () => {
    if (!selectedSubscriber) return;
    const amt = parseFloat(newDebtFormAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }
    if (!newDebtFormDate?.trim()) {
      alert('يرجى اختيار تاريخ الدين');
      return;
    }
    setNewDebtSubmitting(true);
    try {
      const summary = (await subscribersApi.addDebtEntry(selectedSubscriber.id, {
        amount: amt,
        debtDate: newDebtFormDate,
        description: newDebtFormDesc,
        debtScope: newDebtFormScope,
      })) as SubscriberDebtSummary;
      await refreshInternetPageData();
      addNotification('إضافة دين', `تم تسجيل دين ${amt.toLocaleString()} د.ع للمشترك`, 'info');
      logActivity?.(
        'internet',
        'add_subscriber_debt_detail',
        `إضافة دين تفصيلي ${amt.toLocaleString()} د.ع — ${selectedSubscriber.realName ?? selectedSubscriber.real_name ?? ''}`,
      );
      setNewDebtFormAmount('');
      setNewDebtFormDesc('');
      setIsDebtManageOpen(false);
    } catch (error) {
      console.error('Failed to add debt entry', error);
      alert('تعذر إضافة الدين. تحقق من البيانات أو الاتصال.');
    } finally {
      setNewDebtSubmitting(false);
    }
  };

  const handleRollDebtEntry = async (entryId: number) => {
    if (!selectedSubscriber) return;
    if (!window.confirm('ترحيل هذا السجل إلى «ديون سابقة»؟')) return;
    try {
      const summary = (await subscribersApi.patchDebtEntry(selectedSubscriber.id, entryId, {}, true)) as SubscriberDebtSummary;
      await refreshInternetPageData();
      logActivity?.('internet', 'roll_subscriber_debt_previous', `ترحيل دين إلى سابق — ${selectedSubscriber.realName ?? selectedSubscriber.real_name ?? ''}`);
    } catch (error) {
      console.error('Failed to roll debt entry', error);
      alert('تعذر ترحيل السجل.');
    }
  };

  const handleFtthSyncSubscriber = async (subscriberId: number) => {
    setFtthSyncingId(subscriberId);
    try {
      const result = await ftthPortalApi.syncSubscriber(subscriberId);
      const updatedCount = Object.keys(result.updated_fields).length;
      const detail = updatedCount > 0
        ? Object.entries(result.updated_fields).map(([k, v]) => `${k}: ${v}`).join(' | ')
        : 'البيانات محدَّثة مسبقاً';
      addNotification?.('مزامنة FTTH', `${result.message} — ${detail}`, 'activation');
      const [fresh, hist] = await Promise.all([
        subscribersApi.getAll().catch(() => []),
        subscribersApi.getHistory().catch(() => []),
      ]);
      if (Array.isArray(fresh)) {
        const merged = mergeSubscribersWithHistory(fresh, hist) as any[];
        setSubscribers(merged);
        const refreshed = merged.find((s: any) => s.id === subscriberId);
        if (refreshed) setSelectedSubscriber(refreshed);
      }
    } catch (e: unknown) {
      const msg = e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : 'فشلت المزامنة';
      addNotification?.('مزامنة FTTH', msg, 'alert');
    } finally {
      setFtthSyncingId(null);
    }
  };

  const handleDeleteSubscriber = async (id: number) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المشترك؟')) {
      try {
        const subName = subscribers.find(s => s.id === id)?.realName || '';
        await subscribersApi.delete(id);
        await refreshInternetPageData();
        addNotification('حذف مشترك', `تم حذف المشترك ${subName} من النظام`, 'info');
        logActivity?.('internet', 'delete_subscriber', `حذف مشترك ${subName}`);
        setIsSubscriberDetailsOpen(false);
      } catch (error) {
        console.error('Failed to delete subscriber', error);
        alert('حدث خطأ أثناء حذف المشترك');
      }
    }
  };

  const [payDebtSubmitting, setPayDebtSubmitting] = useState(false);

  const handleSettleDebt = async () => {
    if (!selectedSubscriber || payDebtAmount <= 0 || payDebtAmount > selectedSubscriber.debt) {
      alert('الرجاء إدخال مبلغ صحيح لا يتجاوز قيمة الدين');
      return;
    }
    if (payDebtSubmitting) return;
    setPayDebtSubmitting(true);
    try {
      const todayStr = formatLocalDate(startOfLocalDay(new Date()));
      const summary = (await subscribersApi.payDebt(selectedSubscriber.id, {
        amount: payDebtAmount,
        paymentDate: todayStr,
        description: `تسديد دين للمشترك ${selectedSubscriber.realName ?? selectedSubscriber.real_name ?? selectedSubscriber.real_name}`,
      })) as SubscriberDebtSummary;

      // تحديث فوري لحقل الدين من استجابة الـ API (totalDebt هو المصدر الموثوق
      // بعد التخصيص في الخادم). هذا يضمن تحديث قائمة الديون فوراً بدلاً من
      // الانتظار حتى اكتمال إعادة التحميل الكاملة، وهو ما يحل مشكلة عدم اختفاء
      // المشترك من تبويب الديون عند الدفع من هذا التبويب مباشرةً.
      const newDebt = (summary as any).totalDebt ?? 0;
      setSubscribers((prev: any[]) =>
        prev.map((s: any) =>
          s.id === selectedSubscriber.id ? { ...s, debt: newDebt } : s
        )
      );
      setSelectedSubscriber((prev: any) =>
        prev ? { ...prev, debt: newDebt } : prev
      );

      await refreshInternetPageData();

      const walletTx = (await walletApi.create({
        type: 'recharge',
        amount: payDebtAmount,
        description: `تحصيل دين - تسديد من المشترك ${selectedSubscriber.realName ?? selectedSubscriber.real_name ?? selectedSubscriber.real_name}`
      })) as Transaction;
      setWalletTransactions([walletTx, ...walletTransactions]);

      addNotification('تسديد دين مشترك', `تم تسديد ${payDebtAmount.toLocaleString()} د.ع من دين المشترك ${selectedSubscriber.realName ?? selectedSubscriber.real_name ?? selectedSubscriber.real_name}`, 'info');
      logActivity?.('internet', 'pay_subscriber_debt', `تسديد دين ${payDebtAmount.toLocaleString()} د.ع للمشترك ${selectedSubscriber.realName ?? selectedSubscriber.real_name ?? selectedSubscriber.real_name}`);

      setIsPayDebtOpen(false);
      setPayDebtAmount(0);
    } catch (error) {
      console.error('Failed to settle debt', error);
      alert('حدث خطأ أثناء تسديد الديون');
    } finally {
      setPayDebtSubmitting(false);
    }
  };

  const handleSettleEntry = async () => {
    if (!selectedSubscriber?.id || settleEntryId === null) return;
    const amt = parseFloat(settleAmount);
    if (isNaN(amt) || amt <= 0) { alert('أدخل مبلغاً صحيحاً أكبر من صفر'); return; }
    if (!settleDate) { alert('أدخل تاريخ التسديد'); return; }
    setSettleSubmitting(true);
    try {
      const summary = (await subscribersApi.settleDebtEntry(selectedSubscriber.id, settleEntryId, {
        amount: amt,
        paymentDate: settleDate,
        description: settleDesc.trim() || 'تسديد دين',
      })) as SubscriberDebtSummary;

      // تحديث فوري من الاستجابة (نفس نمط handleSettleDebt)
      const newDebt = (summary as any).totalDebt ?? 0;
      setSubscribers((prev: any[]) =>
        prev.map((s: any) =>
          s.id === selectedSubscriber.id ? { ...s, debt: newDebt } : s
        )
      );
      setSelectedSubscriber((prev: any) =>
        prev ? { ...prev, debt: newDebt } : prev
      );

      await refreshInternetPageData();
      setSettleEntryId(null);
      setSettleAmount('');
      setSettleDate('');
      setSettleDesc('');
      addNotification('تسديد دين', `تم تسديد ${amt.toLocaleString()} د.ع من سجل الدين`, 'info');
    } catch (err: any) {
      alert(err?.message ?? 'حدث خطأ أثناء تسديد الدين');
    } finally {
      setSettleSubmitting(false);
    }
  };

  const handleDeleteZone = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المنطقة؟ سيتم حذف جميع الـ FAT المرتبطة بها.')) return;
    try {
      const zoneName = zones.find(z => z.id === id)?.name || '';
      await internetApi.deleteZone(id);
      setZones(zones.filter(zone => zone.id !== id));
      setFats(fats.filter(fat => fat.zoneId !== id));
      addNotification('حذف منطقة', `تم حذف المنطقة ${zoneName} من النظام`, 'info');
      logActivity?.('internet', 'delete_zone', `حذف منطقة ${zoneName}`);
    } catch (error) {
      console.error('Failed to delete zone', error);
      alert('حدث خطأ أثناء حذف المنطقة');
    }
  };

  const handleSellMaterial = async () => {
    if (!sellMaterialId || sellQuantity <= 0) return;

    const material = materials.find(m => m.id === sellMaterialId);
    if (!material) return;
    if (material.quantity < sellQuantity) {
      alert('الكمية المطلوبة غير متوفرة في المخزن');
      return;
    }

    try {
      const result = await internetApi.createMaterialSaleTracked({
        materialId: sellMaterialId,
        subscriberId: sellPaymentMethod === 'debt' && sellSubscriberId ? sellSubscriberId : null,
        quantity: sellQuantity,
        paymentMethod: sellPaymentMethod,
      });
      if (!result.ok || !result.data) {
        notifyPersistence(result);
        return;
      }

      await refreshInternetPageData();

      const sale = result.data as MaterialSale;
      addNotification('عملية بيع جديدة', `تم بيع ${sellQuantity} من ${sale.materialName} بقيمة ${sale.totalAmount} د.ع`, 'sale');
      logActivity?.('internet', 'sell_material', `بيع ${sellQuantity} من ${sale.materialName} بقيمة ${sale.totalAmount} د.ع`);

      const remainingQty = Math.max(0, material.quantity - sellQuantity);
      if (remainingQty <= systemSettings.stockAlertThreshold) {
        addNotification('تنبيه مخزون', `مخزون ${sale.materialName} منخفض (المتبقي ${remainingQty})`, 'alert');
      }

      setIsSellMaterialOpen(false);
      setSellMaterialId('');
      setSellQuantity(1);
      setSellSubscriberId('');
      setSellPaymentMethod('cash');
      notifyPersistence(result);
    } catch (error) {
      console.error('Failed to sell material', error);
      alert('حدث خطأ أثناء بيع المادة');
    }
  };

  const handleEditSubscriber = async () => {
    if (!selectedSubscriber || !newSubscriberName?.trim()) {
      alert('يرجى إدخال الاسم الحقيقي');
      return;
    }
    const category = categories.find(c => c.id.toString() === newSubscriberCategory)
      ?? categories.find(c => c.name === selectedSubscriber.category);
    if (!category) {
      alert('يرجى اختيار فئة الاشتراك');
      return;
    }
    const zone = zones.find(z => z.id.toString() === newSubscriberZone);
    const fat = fats.find(f => f.id.toString() === newSubscriberFat);
    const paid = parseFloat(newSubscriberPaidAmount) || 0;
    const debt = Math.max(0, category.price - paid);

    let phoneNorm: string;
    try {
      phoneNorm = requireIraqMobile(newSubscriberPhone);
    } catch {
      alert(IRAQ_PHONE_HINT_AR);
      return;
    }

    try {
      const subType = newSubscriberType || (selectedSubscriber.subscriptionType ?? selectedSubscriber.subscription_type ?? 'ftth');
      const updatedSubData = {
        ...selectedSubscriber,
        realName: newSubscriberName,
        nationalIdName: subType === 'wireless' ? '' : newSubscriberNationalName,
        phone: phoneNorm,
        zone: zone ? zone.name : selectedSubscriber.zone,
        fat: fat ? fat.name : selectedSubscriber.fat,
        category: category.name,
        categoryPrice: category.price,
        debt: debt,
        location: newSubscriberLocation || selectedSubscriber.location,
        subscriptionType: subType,
        subscriptionDate: newSubscriberSubscriptionDate,
        expirationDate: newSubscriberExpirationDate,
      };

      const savedRaw = await subscribersApi.update(selectedSubscriber.id, updatedSubData);
      
      await refreshInternetPageData();

      addNotification('تعديل مشترك', `تم تعديل بيانات المشترك ${newSubscriberName} بنجاح`, 'info');
      logActivity?.('internet', 'edit_subscriber', `تعديل مشترك ${newSubscriberName}`);
    } catch (error) {
      console.error('Failed to update subscriber', error);
      alert('حدث خطأ أثناء تعديل المشترك');
      return;
    }
    setIsEditSubscriberOpen(false);
    setSelectedSubscriber(null);
    setIsSubscriberDetailsOpen(false);
    setNewSubscriberPaidAmount('');
    setNewSubscriberSubscriptionDate(new Date().toISOString().split('T')[0]);
  };

  const handleRenewSubscriptionClick = (subscriberId: number) => {
    const subscriber = subscribers.find(s => s.id === subscriberId);
    if (!subscriber) return;

    const category = categories.find(c => c.name === subscriber.category);
    if (!category) {
      alert('فئة الاشتراك غير موجودة');
      return;
    }

    const todayLocal = formatLocalDate(startOfLocalDay(new Date()));
    setRenewFormData({
      subscriberId,
      renewalDate: todayLocal,
      amountReceived: String(category?.price ?? 0),
      renewalMethod: 'page',
      renewalPaymentMethod: 'cash',
    });
    setIsRenewModalOpen(true);
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const subscriber = subscribers.find(s => s.id === renewFormData.subscriberId);
    if (!subscriber) return;

    const category = categories.find(c => c.name === subscriber.category);
    if (!category) return;

    const todayLocal = formatLocalDate(startOfLocalDay(new Date()));
    if (renewFormData.renewalDate < todayLocal) {
      alert('تاريخ التجديد لا يمكن أن يكون قبل تاريخ اليوم الحالي');
      setRenewFormData((prev) => ({ ...prev, renewalDate: todayLocal }));
      return;
    }

    const isPage = renewFormData.renewalMethod === 'page';
    const isCash = renewFormData.renewalPaymentMethod === 'cash';
    const isDebt = renewFormData.renewalPaymentMethod === 'debt';

    const subType = (subscriber.subscriptionType ?? subscriber.subscription_type ?? 'ftth').toLowerCase();
    const renewalExpense = subType === 'wireless' && category.costPrice != null ? Number(category.costPrice) : category.price;
    const walletBal = subType === 'wireless' ? wirelessWalletBalance : walletBalance;
    if (isPage && walletBal < renewalExpense) {
      alert('رصيد المحفظة غير كافٍ لتجديد الاشتراك');
      return;
    }

    const formattedNewExpDate = computeRenewalExpirationDate(renewFormData.renewalDate, subscriber);
    const displayStatusAfterRenew = subscriberDisplayStatus(formattedNewExpDate);

    const amountReceived = isDebt ? 0 : (parseFloat(renewFormData.amountReceived) || 0);
    
    let newDebt = subscriber.debt || 0;
    let historyType = 'تجديد اشتراك';
    let historyAmount = amountReceived;
    let historyDesc = `تجديد اشتراك (${renewFormData.renewalMethod === 'master' ? 'ماستر' : isCash ? 'نقد' : 'آجل'}) - تمديد حتى ${formattedNewExpDate}`;

    if (renewFormData.renewalMethod === 'master') {
      historyAmount = 0;
    } else if (isDebt) {
      newDebt += category.price;
      historyType = 'تجديد اشتراك بالآجل';
      historyAmount = category.price;
      historyDesc = `تجديد اشتراك بالآجل - دين ${category.price.toLocaleString()} د.ع - تمديد حتى ${formattedNewExpDate}`;
    } else {
      if (amountReceived > category.price) {
        const excess = amountReceived - category.price;
        const debtPaid = Math.min(excess, newDebt);
        newDebt -= debtPaid;
      } else if (amountReceived < category.price) {
        newDebt += category.price - amountReceived;
      }
    }

    try {
      const updatePayload = {
        debt: newDebt,
        subscriptionDate: renewFormData.renewalDate,
        expirationDate: formattedNewExpDate,
        status: displayStatusAfterRenew,
      };

      const savedSub = (await subscribersApi.update(subscriber.id, updatePayload)) as Subscriber;
      const renewalHistory = (await subscribersApi.createHistory({
        subscriberId: subscriber.id,
        date: new Date().toISOString(),
        type: historyType,
        amount: historyAmount,
        description: historyDesc
      })) as { id: number; date?: string; type?: string; amount?: number; description?: string };

      await refreshInternetPageData();

      if (renewFormData.renewalMethod === 'page') {
        const expenseTx = (await walletApi.create({
          type: 'expense',
          amount: subType === 'wireless' && category.costPrice != null ? category.costPrice : category.price,
          description: `تجديد اشتراك - ${subscriber.realName ?? subscriber.real_name} (${category.name})${subType === 'wireless' ? ' [Wireless]' : ''}`,
          walletType: subType === 'wireless' ? 'wireless' : 'ftth',
        })) as Transaction;
        setWalletTransactions([expenseTx, ...walletTransactions]);

        if (isCash && amountReceived > 0) {
          const rechargeTx = (await walletApi.create({
            type: 'recharge',
            amount: amountReceived,
            description: `تحصيل تجديد اشتراك نقد - ${subscriber.realName ?? subscriber.real_name} (${category.name})`
          })) as Transaction;
          setWalletTransactions([rechargeTx, ...walletTransactions]);
        }
      } else {
        const newTx = (await walletApi.create({
          type: 'expense',
          amount: 0,
          description: `تجديد ماستر - ${subscriber.realName ?? subscriber.real_name} (${category.name})`
        })) as Transaction;
        setWalletTransactions([newTx, ...walletTransactions]);
      }

      addNotification(
        'تجديد اشتراك',
        `تم تجديد اشتراك ${subscriber.realName ?? subscriber.real_name} بنجاح (${renewFormData.renewalMethod === 'master' ? 'ماستر' : isCash ? 'نقد' : 'آجل'}). تاريخ الانتهاء: ${formattedNewExpDate}${isDebt ? ` - تم إضافة دين ${category.price.toLocaleString()} د.ع` : ''}`,
        'activation'
      );
      logActivity?.('internet', 'renew_subscription', `تجديد اشتراك ${subscriber.realName ?? subscriber.real_name} - ${isCash ? 'نقد' : 'آجل'} - تاريخ انتهاء ${formattedNewExpDate}${isDebt ? ` - دين ${category.price.toLocaleString()} د.ع` : ''}`);

      if (isDebt) {
        addNotification('إضافة دين', `تم تجديد اشتراك ${subscriber.realName ?? subscriber.real_name} بالآجل - دين جديد ${category.price.toLocaleString()} د.ع`, 'info');
        logActivity?.('internet', 'renew_debt', `تجديد بالآجل - ${subscriber.realName ?? subscriber.real_name} - دين ${category.price.toLocaleString()} د.ع`);
      }

      if (renewFormData.renewalMethod === 'page') {
        const expenseAmt = subType === 'wireless' && category.costPrice != null ? category.costPrice : category.price;
        const newBalance = (subType === 'wireless' ? wirelessWalletBalance : walletBalance) - expenseAmt + (isCash ? amountReceived : 0);
        const walletName = subType === 'wireless' ? 'محفظة Wireless' : 'المحفظة';
        if (newBalance <= systemSettings.walletAlertThreshold) {
          addNotification(
            'تنبيه رصيد',
            `رصيد ${walletName} منخفض (${Number(newBalance ?? 0).toLocaleString()} د.ع)`,
            'alert'
          );
        }
      }

      if (selectedSubscriber && selectedSubscriber.id === subscriber.id && (!refreshedSubs || refreshedSubs.length === 0)) {
        setSelectedSubscriber(mergedSubscriber);
      }

      setIsRenewModalOpen(false);
    } catch (error) {
      console.error('Failed to renew subscriber', error);
      alert('حدث خطأ أثناء تجديد المشترك');
    }
  };

  const editSubscriberDateBase = useMemo(
    () => ({
      subscriptionIso: newSubscriberSubscriptionDate,
      expirationIso: newSubscriberExpirationDate,
      spanDaysStr: newSubscriberSpanDaysStr,
      durationMode: newSubscriberDurationMode,
    }),
    [newSubscriberSubscriptionDate, newSubscriberExpirationDate, newSubscriberSpanDaysStr, newSubscriberDurationMode],
  );

  const editSubscriberDateSummary = useMemo(
    () =>
      calculateSubscriptionDates({
        subscriptionIso: newSubscriberSubscriptionDate,
        expirationIso: newSubscriberExpirationDate,
      }),
    [newSubscriberSubscriptionDate, newSubscriberExpirationDate],
  );

  const applyEditSubscriptionDate = (value: string) => {
    const n = syncFtthImportDateFields(editSubscriberDateBase, 'subscription', { subscriptionIso: value });
    setNewSubscriberSubscriptionDate(n.subscriptionIso);
    setNewSubscriberExpirationDate(n.expirationIso);
    setNewSubscriberSpanDaysStr(n.spanDaysStr);
    setNewSubscriberDurationMode(n.durationMode);
  };
  const applyEditExpirationDate = (value: string) => {
    const n = syncFtthImportDateFields(editSubscriberDateBase, 'expiration', { expirationIso: value });
    setNewSubscriberSubscriptionDate(n.subscriptionIso);
    setNewSubscriberExpirationDate(n.expirationIso);
    setNewSubscriberSpanDaysStr(n.spanDaysStr);
    setNewSubscriberDurationMode(n.durationMode);
  };
  const applyEditSpan = (value: string) => {
    const n = syncFtthImportDateFields(editSubscriberDateBase, 'span', { spanDaysStr: value });
    setNewSubscriberSubscriptionDate(n.subscriptionIso);
    setNewSubscriberExpirationDate(n.expirationIso);
    setNewSubscriberSpanDaysStr(n.spanDaysStr);
    setNewSubscriberDurationMode(n.durationMode);
  };
  const applyEditDurationMode = (mode: FtthDurationMode) => {
    const n = syncFtthImportDateFields(editSubscriberDateBase, 'mode', { durationMode: mode });
    setNewSubscriberSubscriptionDate(n.subscriptionIso);
    setNewSubscriberExpirationDate(n.expirationIso);
    setNewSubscriberSpanDaysStr(n.spanDaysStr);
    setNewSubscriberDurationMode(n.durationMode);
  };

  /** فتح تفاصيل المشترك من القائمة: يعتمد على المعرّف المحلي ويجلب السجل من الـ API ثم يحمّل رابط FTTH اختياريًا */
  const openSubscriberDetailsPanel = (sub: { id: number }) => {
    setSubscriberDetailError(null);
    setIsSubscriberDetailsOpen(true);
    setSelectedSubscriber(sub as any);
    setSubscriberDetailLoading(true);
    void subscribersApi
      .getById(Number(sub.id))
      .then((fresh) => {
        setSelectedSubscriber(fresh);
      })
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 404) {
          setSubscriberDetailError('المشترك غير موجود في النظام.');
        } else {
          setSubscriberDetailError(
            err instanceof ApiRequestError ? err.message : 'تعذر تحميل بيانات المشترك من الخادم.',
          );
        }
      })
      .finally(() => {
        setSubscriberDetailLoading(false);
      });
  };

  const openSubscriberParam = searchParams.get('openSubscriber');
  useEffect(() => {
    const raw = openSubscriberParam?.trim();
    if (!raw || !/^\d+$/.test(raw)) return;
    const sid = parseInt(raw, 10);
    openSubscriberDetailsPanel({ id: sid });
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('openSubscriber');
      return p;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- فتح لمرة واحدة عند وجود المعامل
  }, [openSubscriberParam, setSearchParams]);

  const openEditSubscriber = (sub: any) => {
    setSelectedSubscriber(sub);
    setNewSubscriberName(sub.realName ?? sub.real_name);
    setNewSubscriberNationalName(sub.nationalIdName ?? '');
    setNewSubscriberPhone(String(sub.phone || '').replace(/\D/g, '').slice(0, 15));
    setNewSubscriberType((sub.subscriptionType ?? sub.subscription_type ?? 'ftth').toLowerCase() as 'ftth' | 'wireless');
    
    const category = categories.find(c => c.name === sub.category);
    setNewSubscriberCategory(category ? category.id.toString() : '');
    setNewSubscriberPaidAmount(String(Math.max(0, (Number(sub.categoryPrice ?? sub.category_price ?? 0) - Number(sub.debt ?? 0)))));
    
    const zone = zones.find(z => z.name === sub.zone);
    setNewSubscriberZone(zone ? zone.id.toString() : '');
    
    const fat = fats.find(f => f.name === sub.fat && (f.zoneId ?? f.zone_id) === zone?.id);
    setNewSubscriberFat(fat ? fat.id.toString() : '');
    
    setNewSubscriberLocation(sub.location);

    const subD = sub.subscriptionDate ?? sub.subscription_date;
    const expD = sub.expirationDate ?? sub.expiration_date;
    const subIso = subD ? String(subD).trim().slice(0, 10) : formatLocalDate(startOfLocalDay(new Date()));
    const expIso = expD ? String(expD).trim().slice(0, 10) : '';
    const initDates = syncFtthImportDateFields(
      {
        subscriptionIso: '',
        expirationIso: '',
        spanDaysStr: String(FTTH_DEFAULT_SPAN_DAYS),
        durationMode: 'calendar_days',
      },
      'reset',
      { subscriptionIso: subIso, expirationIso: expIso, defaultSpanDays: FTTH_DEFAULT_SPAN_DAYS },
    );
    setNewSubscriberSubscriptionDate(initDates.subscriptionIso);
    setNewSubscriberExpirationDate(initDates.expirationIso);
    setNewSubscriberSpanDaysStr(initDates.spanDaysStr);
    setNewSubscriberDurationMode(initDates.durationMode);

    setIsEditSubscriberOpen(true);
  };

  const openEditFat = (fat: any) => {
    setSelectedFat(fat);
    setNewFatZoneId(String(fat.zoneId ?? fat.zone_id ?? ''));
    setNewFatName(fat.name ?? '');
    setNewFatCoordinates(fat.coordinates ?? '');
    setIsEditFatOpen(true);
  };

  const handleRechargeWallet = async () => {
    if (rechargeAmount) {
      const walletType = rechargeWalletType || 'ftth';
      const result = await walletApi.createTracked({
        type: 'recharge',
        amount: parseFloat(rechargeAmount),
        date: rechargeDate,
        description: rechargeNotes || (walletType === 'wireless' ? 'تعبئة محفظة Wireless' : 'تعبئة رصيد'),
        walletType,
      });
      if (!result.ok || !result.data) {
        notifyPersistence(result);
        return;
      }
      const newTx = result.data as Transaction;
      setWalletTransactions([newTx, ...walletTransactions]);
      const walletLabel = walletType === 'wireless' ? 'محفظة Wireless' : 'المحفظة';
      addNotification('شحن المحفظة', `تم شحن ${walletLabel} بمبلغ ${parseFloat(rechargeAmount).toLocaleString()} د.ع`, 'info');
      logActivity?.('internet', 'recharge_wallet', `شحن ${walletLabel} ${parseFloat(rechargeAmount).toLocaleString()} د.ع`);
      notifyPersistence(result);
      setRechargeAmount('');
      setRechargeDate(new Date().toISOString().split('T')[0]);
      setRechargeNotes('');
      setRechargeWalletType('ftth');
      setIsRechargeWalletOpen(false);
    }
  };

  const handleAddMaterial = async () => {
    if (!newMaterialName || !newMaterialPurchasePrice || !newMaterialSellingPrice || !newMaterialQuantity) return;

    try {
      const result = await internetApi.createMaterialTracked({
        name: newMaterialName.trim(),
        purchasePrice: parseFloat(newMaterialPurchasePrice),
        sellingPrice: parseFloat(newMaterialSellingPrice),
        quantity: parseInt(newMaterialQuantity, 10)
      });
      if (!result.ok || !result.data) {
        notifyPersistence(result);
        return;
      }
      
      await refreshInternetPageData();
      
      addNotification('إضافة مادة إنترنت', `تم إضافة المادة ${newMaterialName.trim()} بكمية ${newMaterialQuantity}`, 'info');
      logActivity?.('internet', 'add_material', `إضافة مادة ${newMaterialName.trim()} بكمية ${newMaterialQuantity}`);
      notifyPersistence(result);
      setNewMaterialName('');
      setNewMaterialPurchasePrice('');
      setNewMaterialSellingPrice('');
      setNewMaterialQuantity('');
      setIsAddMaterialOpen(false);
    } catch (error) {
      console.error('Failed to add material', error);
      alert('حدث خطأ أثناء إضافة المادة');
    }
  };

  const handleEditMaterial = async () => {
    if (!selectedMaterial || !newMaterialName || !newMaterialPurchasePrice || !newMaterialSellingPrice || !newMaterialQuantity) return;
    try {
      const saved = await internetApi.updateMaterial(selectedMaterial.id, {
        name: newMaterialName.trim(),
        purchasePrice: parseFloat(newMaterialPurchasePrice),
        sellingPrice: parseFloat(newMaterialSellingPrice),
        quantity: parseInt(newMaterialQuantity, 10)
      });
      await refreshInternetPageData();
      addNotification('تعديل مادة إنترنت', `تم تعديل المادة ${newMaterialName.trim()} بنجاح`, 'info');
      logActivity?.('internet', 'edit_material', `تعديل مادة ${newMaterialName.trim()}`);
      setIsEditMaterialOpen(false);
      setSelectedMaterial(null);
    } catch (error) {
      console.error('Failed to edit material', error);
      alert('حدث خطأ أثناء تعديل المادة');
    }
  };

  const handleDeleteMaterial = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المادة؟')) return;
    try {
      const matName = materials.find(m => m.id === id)?.name || '';
      await internetApi.deleteMaterial(id);
      await refreshInternetPageData();
      addNotification('حذف مادة إنترنت', `تم حذف المادة ${matName} من المخزون`, 'info');
      logActivity?.('internet', 'delete_material', `حذف مادة ${matName}`);
    } catch (error) {
      console.error('Failed to delete material', error);
      alert('حدث خطأ أثناء حذف المادة');
    }
  };

  const openEditMaterial = (mat: any) => {
    setSelectedMaterial(mat);
    setNewMaterialName(mat.name);
    setNewMaterialPurchasePrice(String(mat?.purchasePrice ?? 0));
    setNewMaterialSellingPrice(String(mat?.sellingPrice ?? 0));
    setNewMaterialQuantity(String(mat?.quantity ?? 0));
    setIsEditMaterialOpen(true);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      alert('يرجى إدخال اسم الفئة');
      return;
    }
    const priceStr = String(newCategoryPrice ?? '').trim();
    const costStr = String(newCategoryCostPrice ?? '').trim();
    if (newCategoryType === 'ftth') {
      if (!priceStr) {
        alert('يرجى إدخال السعر (د.ع)');
        return;
      }
      if (!Number.isFinite(parseFloat(priceStr)) || parseFloat(priceStr) < 0) {
        alert('يرجى إدخال سعر صحيح (رقم ≥ 0)');
        return;
      }
    } else {
      if (!costStr || !priceStr) {
        alert('يرجى إدخال سعر التكلفة وسعر البيع للـ Wireless');
        return;
      }
      if (!Number.isFinite(parseFloat(costStr)) || !Number.isFinite(parseFloat(priceStr))) {
        alert('يرجى إدخال أرقام صحيحة للتكلفة والبيع');
        return;
      }
    }
    try {
      const result = await internetApi.createCategoryTracked({
        name: newCategoryName.trim(),
        price: parseFloat(priceStr),
        subscriptionType: newCategoryType,
        costPrice: newCategoryType === 'wireless' ? parseFloat(costStr) : null,
      });
      if (!result.ok || !result.data) {
        notifyPersistence(result);
        return;
      }
      setCategories([...categories, result.data]);
      const msg = newCategoryType === 'wireless'
        ? `تم إضافة فئة ${newCategoryName.trim()} (Wireless) تكلفة ${costStr} د.ع، بيع ${priceStr} د.ع`
        : `تم إضافة فئة الاشتراك ${newCategoryName.trim()} بسعر ${priceStr} د.ع`;
      addNotification('إضافة فئة', msg, 'info');
      logActivity?.('internet', 'add_category', msg);
      setNewCategoryName('');
      setNewCategoryPrice('');
      setNewCategoryType('ftth');
      setNewCategoryCostPrice('');
      setIsAddCategoryOpen(false);
    } catch (error) {
      console.error('Failed to add category', error);
      alert('حدث خطأ أثناء إضافة الفئة');
    }
  };

  const handleEditCategory = async () => {
    if (!selectedCategory || !newCategoryName.trim()) {
      alert('يرجى إدخال اسم الفئة');
      return;
    }
    const priceStr = String(newCategoryPrice ?? '').trim();
    const costStr = String(newCategoryCostPrice ?? '').trim();
    if (newCategoryType === 'ftth') {
      if (!priceStr) {
        alert('يرجى إدخال السعر (د.ع)');
        return;
      }
      if (!Number.isFinite(parseFloat(priceStr)) || parseFloat(priceStr) < 0) {
        alert('يرجى إدخال سعر صحيح (رقم ≥ 0)');
        return;
      }
    } else {
      if (!costStr || !priceStr) {
        alert('يرجى إدخال سعر التكلفة وسعر البيع للـ Wireless');
        return;
      }
      if (!Number.isFinite(parseFloat(costStr)) || !Number.isFinite(parseFloat(priceStr))) {
        alert('يرجى إدخال أرقام صحيحة للتكلفة والبيع');
        return;
      }
    }
    try {
      const saved = await internetApi.updateCategory(selectedCategory.id, {
        name: newCategoryName.trim(),
        price: parseFloat(priceStr),
        subscriptionType: newCategoryType,
        costPrice: newCategoryType === 'wireless' ? parseFloat(costStr) : null,
      });
      setCategories(categories.map(cat => (cat.id === selectedCategory.id ? saved : cat)));
      addNotification('تعديل فئة', `تم تعديل فئة ${newCategoryName.trim()} بنجاح`, 'info');
      logActivity?.('internet', 'edit_category', `تعديل فئة ${newCategoryName.trim()}`);
      setIsEditCategoryOpen(false);
      setSelectedCategory(null);
    } catch (error) {
      console.error('Failed to edit category', error);
      alert('حدث خطأ أثناء تعديل الفئة');
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الفئة؟')) return;
    try {
      const catName = categories.find(c => c.id === id)?.name || '';
      await internetApi.deleteCategory(id);
      setCategories(categories.filter(cat => cat.id !== id));
      addNotification('حذف فئة', `تم حذف فئة ${catName} من النظام`, 'info');
      logActivity?.('internet', 'delete_category', `حذف فئة ${catName}`);
    } catch (error) {
      console.error('Failed to delete category', error);
      alert('حدث خطأ أثناء حذف الفئة');
    }
  };

  const openEditCategory = (cat: any) => {
    setSelectedCategory(cat);
    setNewCategoryName(cat.name);
    setNewCategoryPrice(String(cat?.price ?? 0));
    setNewCategoryType((cat.subscriptionType ?? cat.subscription_type ?? 'ftth').toLowerCase());
    setNewCategoryCostPrice(cat.costPrice != null ? String(cat.costPrice) : '');
    setIsEditCategoryOpen(true);
  };

  const filteredMaterials = useMemo(() => {
    return materials.filter(mat => mat.name.includes(materialSearchQuery));
  }, [materials, materialSearchQuery]);

  const filteredFats = useMemo(() => {
    if (selectedZoneFilter === 'all') return fats;
    return fats.filter(fat => fat.zoneId.toString() === selectedZoneFilter);
  }, [fats, selectedZoneFilter]);

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col">
      {/* ثابتة (العنوان + أزرار الإجراءات + التبويبات) */}
      <div className="shrink-0 space-y-2 sm:space-y-3">
        <div className="px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">قسم الإنترنت</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">إدارة المشتركين، المناطق، والمواد</p>
          </div>
          <div className="flex gap-2">
            {activeTab === 'subscribers' && (
              <>
                <button
                  onClick={() => setIsSubscribersMapVisible(v => !v)}
                  className="bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center gap-2"
                >
                  <Map size={16} />
                  <span>{isSubscribersMapVisible ? 'إخفاء الخريطة' : 'عرض الخريطة'}</span>
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => { setIsSubscribersImportModalOpen(true); setSubscribersImportMessage(''); setSubscribersImportFile(null); }}
                      className="bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors flex items-center gap-2"
                    >
                      <Upload size={16} />
                      <span>استيراد Excel</span>
                    </button>
                    <button
                      onClick={async () => {
                        setSubscribersExportLoading(true);
                        try {
                          const blob = await subscribersImportExportApi.exportExcel();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'subscribers.xlsx';
                          a.click();
                          URL.revokeObjectURL(url);
                          addNotification?.('تصدير المشتركين', 'تم تصدير المشتركين بنجاح', 'info');
                        } catch (e) {
                          addNotification?.('خطأ', 'فشل تصدير المشتركين', 'alert');
                        } finally {
                          setSubscribersExportLoading(false);
                        }
                      }}
                      disabled={subscribersExportLoading}
                      className="bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <Download size={16} />
                      <span>{subscribersExportLoading ? 'جاري التصدير...' : 'تصدير Excel'}</span>
                    </button>
                  </>
                )}
                {canInternet('addSubscriber') && (
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const status = await ftthPortalApi.getStatus();
                        if (!status.configured) {
                          alert('يرجى تسجيل الدخول إلى بوابة FTTH أولاً لتتمكن من المزامنة.');
                          setActiveTab('ftthPortal');
                          return;
                        }
                        
                        addNotification?.('مزامنة FTTH', 'جاري بدء عملية المزامنة من بوابة FTTH...', 'info');
                        const result = await ftthPortalApi.sync();
                        
                        addNotification?.('مزامنة FTTH', result.message || 'تمت عملية المزامنة بنجاح وجاري تحديث القائمة', 'activation');
                        // Refresh subscribers
                        const [fresh, hist] = await Promise.all([
                          subscribersApi.getAll().catch(() => []),
                          subscribersApi.getHistory().catch(() => []),
                        ]);
                        if (Array.isArray(fresh)) {
                          setSubscribers(mergeSubscribersWithHistory(fresh, hist) as any[]);
                        }
                      } catch (error: any) {
                        console.error('FTTH Sync Error:', error);
                        alert('حدث خطأ أثناء محاولة المزامنة: ' + (error?.message || 'خطأ غير معروف'));
                      }
                    }}
                    className="bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center gap-2"
                  >
                    <RefreshCcw size={16} />
                    <span>مزامنة FTTH</span>
                  </button>
                  <button onClick={() => setIsAddSubscriberOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                    <Plus size={16} />
                    <span>إضافة مشترك</span>
                  </button>
                </div>
                )}
              </>
            )}
            {activeTab === 'materials' && canInternet('addMaterial') && (
              <button onClick={() => setIsAddMaterialOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                <Plus size={16} />
                <span>إضافة مادة</span>
              </button>
            )}
            {activeTab === 'zones' && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsZonesMapVisible((v) => !v)}
                  className="bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center gap-2"
                >
                  <Map size={16} />
                  <span>{isZonesMapVisible ? 'إخفاء الخريطة' : 'عرض الخريطة'}</span>
                </button>
                {canInternet('addFat') && (
                <button onClick={() => setIsAddFatOpen(true)} className="bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-indigo-600 dark:border-indigo-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center gap-2">
                  <Plus size={16} />
                  <span>إضافة FAT</span>
                </button>
                )}
                {canInternet('addZone') && (
                <button onClick={() => setIsAddZoneOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                  <Plus size={16} />
                  <span>إضافة منطقة</span>
                </button>
                )}
              </div>
            )}
            {activeTab === 'wallet' && canInternet('rechargeWallet') && (
              <button onClick={() => setIsRechargeWalletOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                <Plus size={16} />
                <span>تعبئة المحفظة</span>
              </button>
            )}
          </div>
        </div>

        <InternetTabBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          subscribersWithDebtCount={subscribersWithDebt.length}
          showFtthPortal={showFtthPortalTab}
          showPhoneDirectory={showPhoneDirectoryTab}
        />
      </div>

      {/* التمرير فقط هنا */}
      <div className="flex-1 min-h-0 overflow-y-auto px-1 pt-3 sm:pt-4 custom-scrollbar">

      {activeTab === 'subscribers' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {isSubscribersMapVisible && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 dark:text-white">خريطة المشتركين</h3>
                <button
                  onClick={() => setIsSubscribersMapVisible(false)}
                  className="text-xs text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100"
                >
                  إخفاء
                </button>
              </div>
              <div className="relative w-full h-96 bg-slate-100 overflow-hidden z-0">
                <MapContainer 
                  center={[33.3152, 44.3661]} 
                  zoom={14} 
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapControls />
                  <MapBoundsUpdater items={filteredSubscribers} coordKey="location" />
                  {fats.map((fat) => {
                    const zone = zones.find(z => z.id === fat.zoneId);
                    const coords = parseCoordinates(fat.coordinates);
                    if (!coords) return null;
                    return (
                      <Marker key={`fat-${fat.id}`} position={coords} icon={createFatIcon(fat.name, zone?.name || '', fat.zoneId)}>
                        <Tooltip direction="top" offset={[0, -40]} opacity={1}>
                          <div className="font-bold text-sm">{zone?.name} - {fat.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400" dir="ltr">{fat.coordinates}</div>
                        </Tooltip>
                      </Marker>
                    );
                  })}
                  {filteredSubscribers.map((sub) => {
                    const coords = parseCoordinates(sub.location);
                    if (!coords) return null;
                    const zone = zones.find(z => z.name === sub.zone);
                    const zoneId = zone ? zone.id : 0;
                    return (
                      <Marker key={`sub-${sub.id}`} position={coords} icon={createSubscriberIcon(subscriberDisplayStatus(sub.expirationDate), zoneId)}>
                        <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                          <div className="font-bold text-sm">{sub.realName ?? sub.real_name ?? sub.real_name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400" dir="ltr">{sub.phone}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{sub.zone} / {sub.fat}</div>
                          <div className="text-xs mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              subscriberDisplayStatus(sub.expirationDate) === 'منتهي' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                            }`}>
                              {subscriberDisplayStatus(sub.expirationDate)}
                            </span>
                          </div>
                        </Tooltip>
                      </Marker>
                    );
                  })}
                </MapContainer>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white">قائمة المشتركين</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    عرض، بحث، وتصفية المشتركين المسجلين في النظام
                  </p>
                </div>
                <div className="relative w-full sm:w-72 shrink-0">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="بحث بالاسم أو الرقم..."
                    value={subscriberSearchQuery}
                    onChange={(e) => setSubscriberSearchQuery(e.target.value)}
                    className="w-full pl-3 pr-10 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {subscribersPageSize > 0 && filteredSubscribers.length > subscribersPageSize ? (
                    <>
                      عرض {((subscribersPage - 1) * subscribersPageSize) + 1} -{' '}
                      {Math.min(subscribersPage * subscribersPageSize, filteredSubscribers.length)} من{' '}
                      {filteredSubscribers.length}
                    </>
                  ) : (
                    <span>إجمالي المطابقة: {filteredSubscribers.length} مشترك</span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">لكل صفحة:</span>
                    <select
                      value={subscribersPageSize}
                      onChange={(e) => {
                        setSubscribersPageSize(Number(e.target.value));
                        setSubscribersPage(1);
                      }}
                      className="p-2 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={150}>150</option>
                      <option value={0}>الكل</option>
                    </select>
                  </div>
                  {subscribersPageSize > 0 && filteredSubscribers.length > subscribersPageSize && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSubscribersPage((p) => Math.max(1, p - 1))}
                        disabled={subscribersPage <= 1}
                        className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-600"
                      >
                        السابق
                      </button>
                      <span className="text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        صفحة {subscribersPage} من {totalSubscriberPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSubscribersPage((p) => Math.min(totalSubscriberPages, p + 1))}
                        disabled={subscribersPage >= totalSubscriberPages}
                        className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-600"
                      >
                        التالي
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <select
                      className="appearance-none p-2 pl-8 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={selectedZoneFilter}
                      onChange={(e) => setSelectedZoneFilter(e.target.value)}
                      title="تصفية حسب المنطقة"
                    >
                      <option value="all">كل المناطق</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name}
                        </option>
                      ))}
                    </select>
                    <Filter size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select
                      className="appearance-none p-2 pl-8 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={selectedCategoryFilter}
                      onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                      title="تصفية حسب الفئة"
                    >
                      <option value="all">كل الفئات</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <Filter size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select
                      className="appearance-none p-2 pl-8 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={selectedStatusFilter}
                      onChange={(e) => setSelectedStatusFilter(e.target.value)}
                      title="تصفية حسب الحالة"
                    >
                      <option value="all">كل الحالات</option>
                      <option value="نشط">نشط</option>
                      <option value="منتهي">منتهي</option>
                    </select>
                    <Filter size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select
                      className="appearance-none p-2 pl-8 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={selectedSubscriptionTypeFilter}
                      onChange={(e) =>
                        setSelectedSubscriptionTypeFilter(e.target.value as 'all' | 'ftth' | 'wireless')
                      }
                      title="تصفية حسب نوعية الاشتراك"
                    >
                      <option value="all">كل الأنواع</option>
                      <option value="ftth">FTTH</option>
                      <option value="wireless">Wireless</option>
                    </select>
                    <Filter size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={expirationDateFromFilter}
                      onChange={(e) => setExpirationDateFromFilter(e.target.value)}
                      className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      title="تاريخ الانتهاء من"
                    />
                    <span className="text-slate-500 text-sm">-</span>
                    <input
                      type="date"
                      value={expirationDateToFilter}
                      onChange={(e) => setExpirationDateToFilter(e.target.value)}
                      className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      title="تاريخ الانتهاء إلى"
                    />
                  </div>
                  <label
                    className="p-2 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer inline-flex"
                    title="استيراد CSV نصي فقط (محلي). لملف Excel استخدم زر «استيراد Excel» أعلاه."
                  >
                    <Upload size={18} />
                    <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportSubscribers} />
                  </label>
                  <button
                    type="button"
                    onClick={handleExportSubscribers}
                    className="p-2 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600"
                    title="تصدير"
                  >
                    <Download size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-white dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                <tr>
                  <th className="px-4 py-3 font-medium">USER CODE</th>
                  <th className="px-4 py-3 font-medium">الاسم الحقيقي</th>
                  <th className="px-4 py-3 font-medium">الاسم في الوطني</th>
                  <th className="px-4 py-3 font-medium">رقم الهاتف</th>
                  <th className="px-4 py-3 font-medium">المنطقة / FAT</th>
                  <th className="px-4 py-3 font-medium">الفئة</th>
                  <th className="px-4 py-3 font-medium">نوعية الاشتراك</th>
                  <th className="px-4 py-3 font-medium">تاريخ الاشتراك</th>
                  <th className="px-4 py-3 font-medium">الديون</th>
                  <th className="px-4 py-3 font-medium">تاريخ الانتهاء</th>
                  <th className="px-4 py-3 font-medium">الأيام المتبقية</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-600 text-sm">
                {paginatedSubscribers.length > 0 ? (
                  paginatedSubscribers.map((sub) => (
                    <tr 
                      key={sub.id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      onClick={() => openSubscriberDetailsPanel(sub)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400" dir="ltr">{sub.userCode || ''}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {(sub.realName ?? sub.real_name ?? sub.real_name ?? '').toString().trim() || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{sub.nationalIdName}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{sub.phone}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <MapPin size={14} className="text-indigo-400" />
                          <span>{sub.zone} / {sub.fat}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{Number(sub.categoryPrice ?? 0).toLocaleString()} د.ع</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${(sub.subscriptionType ?? sub.subscription_type ?? 'ftth').toLowerCase() === 'wireless' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                          {(sub.subscriptionType ?? sub.subscription_type ?? 'FTTH').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400" dir="ltr" title={String(sub.subscriptionDate ?? sub.subscription_date ?? '')}>
                        {formatDateDDMMYYYY(sub.subscriptionDate ?? sub.subscription_date) ||
                          (sub.subscriptionDate ?? sub.subscription_date) ||
                          '—'}
                      </td>
                      <td className="px-4 py-3 font-bold text-rose-600" dir="ltr">{sub.debt > 0 ? Number(sub.debt ?? 0).toLocaleString() : '0'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400" dir="ltr" title={String(sub.expirationDate ?? sub.expiration_date ?? '')}>
                        {formatDateDDMMYYYY(sub.expirationDate ?? sub.expiration_date) ||
                          (sub.expirationDate ?? sub.expiration_date) ||
                          '—'}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const exp = sub.expirationDate ?? sub.expiration_date;
                          const rem = remainingCalendarDaysUntil(exp);
                          const cls =
                            rem === null || rem < 0
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200'
                              : rem <= 5
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200';
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${cls}`}>
                              {formatRemainingDaysLabel(exp)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          subscriberDisplayStatus(sub.expirationDate) === 'منتهي' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                        }`}>
                          {subscriberDisplayStatus(sub.expirationDate)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                      لا يوجد مشتركين مطابقين للبحث.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'debts' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white">ديون المشتركين</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">المشتركين الذين عليهم ديون (قيمة اشتراك أو شراء مواد إنترنت)</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="بحث بالاسم، الهاتف، المنطقة..."
                value={debtsSearchQuery}
                onChange={(e) => setDebtsSearchQuery(e.target.value)}
                className="w-full pl-3 pr-10 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-white dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                <tr>
                  <th className="px-4 py-3 font-medium">كود</th>
                  <th className="px-4 py-3 font-medium">الاسم</th>
                  <th className="px-4 py-3 font-medium">الهاتف</th>
                  <th className="px-4 py-3 font-medium">المنطقة / FAT</th>
                  <th className="px-4 py-3 font-medium">الفئة</th>
                  <th className="px-4 py-3 font-medium">الدين (د.ع)</th>
                  <th className="px-4 py-3 font-medium text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-600 text-sm">
                {filteredSubscribersWithDebt.length > 0 ? (
                  filteredSubscribersWithDebt.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400" dir="ltr">{sub.userCode || '-'}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {(sub.realName ?? sub.real_name ?? sub.real_name ?? '').toString().trim() || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{sub.phone || '-'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{sub.zone} / {sub.fat}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{sub.category}</td>
                      <td className="px-4 py-3 font-bold text-rose-600 dark:text-rose-400" dir="ltr">{Number(sub.debt ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedSubscriber(sub);
                            setPayDebtAmount(Number(sub.debt ?? 0));
                            setIsPayDebtOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                        >
                          <DollarSign size={16} />
                          تسديد
                        </button>
                        <button
                          type="button"
                          onClick={() => openSubscriberDetailsPanel(sub)}
                          className="mr-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 rounded-lg transition-colors"
                        >
                          <History size={16} />
                          تفاصيل
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                      {subscribersWithDebt.length === 0
                        ? 'لا يوجد مشتركين عليهم ديون حالياً'
                        : 'لا توجد نتائج مطابقة للبحث'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredSubscribersWithDebt.length > 0 && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 text-sm">
              <span className="font-bold text-rose-600 dark:text-rose-400">
                إجمالي الديون: {filteredSubscribersWithDebt.reduce((sum, s) => sum + Number(s.debt ?? 0), 0).toLocaleString()} د.ع
              </span>
            </div>
          )}
        </div>
      )}

      {activeTab === 'materials' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-700/50">
            <h3 className="font-bold text-slate-800 dark:text-white">مواد الإنترنت</h3>
            <div className="relative w-full sm:w-72">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="بحث عن مادة..." 
                value={materialSearchQuery}
                onChange={(e) => setMaterialSearchQuery(e.target.value)}
                className="w-full pl-3 pr-10 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                <tr>
                  <th className="px-4 py-3 font-medium">اسم المادة</th>
                  <th className="px-4 py-3 font-medium">سعر الشراء (د.ع)</th>
                  <th className="px-4 py-3 font-medium">سعر البيع (د.ع)</th>
                  <th className="px-4 py-3 font-medium">الكمية المتوفرة</th>
                  <th className="px-4 py-3 font-medium text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredMaterials.map(mat => (
                  <tr key={mat.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{mat.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{Number(mat.purchasePrice ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold text-indigo-600" dir="ltr">{Number(mat.sellingPrice ?? 0).toLocaleString()}</td>
                    <td className={`px-4 py-3 font-bold ${Number(mat.quantity ?? 0) <= Number(systemSettings?.stockAlertThreshold ?? systemSettings?.stock_alert_threshold ?? 5) ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}>{mat.quantity}</td>
                    <td className="px-4 py-3 text-center flex justify-center gap-2">
                      <button 
                        onClick={() => {
                          setSellMaterialId(mat.id);
                          setSellQuantity(1);
                          setIsSellMaterialOpen(true);
                        }} 
                        className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                      >
                        <ShoppingCart size={14} /> بيع
                      </button>
                      <button onClick={() => openEditMaterial(mat)} className="text-slate-400 hover:text-indigo-600 p-1" title="تعديل"><Edit size={16} /></button>
                      <button onClick={() => handleDeleteMaterial(mat.id)} className="text-slate-400 hover:text-rose-600 p-1" title="حذف"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredMaterials.length === 0 && (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                لا توجد مواد مطابقة للبحث.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'zones' && (
        <div className="space-y-6">
          {isZonesMapVisible && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-700/50">
                <h3 className="font-bold text-slate-800 dark:text-white">خريطة المناطق و FAT</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsZonesMapVisible(false)}
                    className="text-xs text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 whitespace-nowrap"
                  >
                    إخفاء الخريطة
                  </button>
                  <div className="flex items-center gap-2">
                    <Filter size={18} className="text-slate-400 shrink-0" />
                    <select
                      value={selectedZoneFilter}
                      onChange={(e) => setSelectedZoneFilter(e.target.value)}
                      className="border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 min-w-[10rem]"
                    >
                      <option value="all">جميع المناطق</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="relative w-full h-96 bg-slate-100 overflow-hidden z-0">
                <MapContainer center={[33.3152, 44.3661]} zoom={14} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapControls />
                  <MapBoundsUpdater items={filteredFats} coordKey="coordinates" />
                  {filteredFats.map((fat) => {
                    const zone = zones.find((z) => z.id === fat.zoneId);
                    const coords = parseCoordinates(fat.coordinates);

                    if (!coords) return null;

                    return (
                      <Marker key={fat.id} position={coords} icon={createFatIcon(fat.name, zone?.name || '', fat.zoneId)}>
                        <Tooltip direction="top" offset={[0, -40]} opacity={1}>
                          <div className="font-bold text-sm">
                            {zone?.name} - {fat.name}
                          </div>
                          <div className="text-xs text-slate-500" dir="ltr">
                            {fat.coordinates}
                          </div>
                        </Tooltip>
                      </Marker>
                    );
                  })}
                </MapContainer>
              </div>
            </div>
          )}

          {!isZonesMapVisible && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 dark:bg-slate-700/50">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                الخريطة مخفية — مساحة أكبر لقوائم المناطق و FAT. استخدم «عرض الخريطة» أعلاه لإظهار المواقع.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Filter size={18} className="text-slate-400" />
                <select
                  value={selectedZoneFilter}
                  onChange={(e) => setSelectedZoneFilter(e.target.value)}
                  className="border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 min-w-[10rem]"
                >
                  <option value="all">جميع المناطق</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div
            className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${!isZonesMapVisible ? 'min-h-[min(70vh,42rem)]' : ''}`}
          >
            <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                <h3 className="font-bold text-slate-800 dark:text-white">المناطق</h3>
              </div>
              <ul className="divide-y divide-slate-100">
                {zones.map(zone => {
                  const fatCount = fats.filter(f => f.zoneId === zone.id).length;
                  const userCount = subscribers.filter(s => s.zone === zone.name).length;
                  return (
                    <li key={zone.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700 flex justify-between items-center group">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{zone.name}</span>
                        <div className="flex gap-2">
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            {fatCount} FAT
                          </span>
                          <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                            {userCount} مشترك
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleDeleteZone(zone.id)} className="p-1 text-slate-400 hover:text-rose-600 transition-colors" title="حذف">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                <h3 className="font-bold text-slate-800 dark:text-white">قائمة FAT</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                    <tr>
                      <th className="px-4 py-3 font-medium">الاسم</th>
                      <th className="px-4 py-3 font-medium">المنطقة</th>
                      <th className="px-4 py-3 font-medium">المشتركين</th>
                      <th className="px-4 py-3 font-medium">الإحداثيات</th>
                      <th className="px-4 py-3 font-medium text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredFats.map(fat => {
                      const zone = zones.find(z => z.id === fat.zoneId);
                      const userCount = subscribers.filter(s => s.fat === fat.name && s.zone === zone?.name).length;
                      return (
                        <tr key={fat.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{fat.name}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{zone?.name}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">
                              {userCount} مشترك
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs" dir="ltr">{fat.coordinates}</td>
                          <td className="px-4 py-3 text-center flex justify-center gap-2">
                            <button onClick={() => openEditFat(fat)} className="text-slate-400 hover:text-indigo-600 p-1" title="تعديل"><Edit size={16} /></button>
                            <button onClick={() => handleDeleteFat(fat.id)} className="text-slate-400 hover:text-rose-600 p-1" title="حذف"><Trash2 size={16} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'wallet' && (
        <div className="space-y-6">
          {/* Wallet Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`rounded-xl p-6 text-white shadow-sm ${walletStats.balance <= systemSettings.earthlinkThreshold ? 'bg-red-600' : 'bg-indigo-600'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className={`${walletStats.balance <= systemSettings.earthlinkThreshold ? 'text-red-100' : 'text-indigo-100'} text-sm font-medium mb-1`}>محفظة FTTH - الرصيد</p>
                  <h3 className="text-3xl font-bold" dir="ltr">{Number(walletStats.balance ?? 0).toLocaleString()} د.ع</h3>
                </div>
                <div className="p-3 bg-white/10 rounded-lg">
                  <Wallet size={24} className="text-white" />
                </div>
              </div>
              <p className={`${walletStats.balance <= systemSettings.earthlinkThreshold ? 'text-red-200' : 'text-indigo-200'} text-xs`}>آخر تحديث: اليوم</p>
            </div>
            <div className={`rounded-xl p-6 text-white shadow-sm ${wirelessWalletStats.balance <= systemSettings.earthlinkThreshold ? 'bg-red-600' : 'bg-amber-600'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className={`${wirelessWalletStats.balance <= systemSettings.earthlinkThreshold ? 'text-red-100' : 'text-amber-100'} text-sm font-medium mb-1`}>محفظة Wireless - الرصيد</p>
                  <h3 className="text-3xl font-bold" dir="ltr">{Number(wirelessWalletStats.balance ?? 0).toLocaleString()} د.ع</h3>
                </div>
                <div className="p-3 bg-white/10 rounded-lg">
                  <Wallet size={24} className="text-white" />
                </div>
              </div>
              <p className={`${wirelessWalletStats.balance <= systemSettings.earthlinkThreshold ? 'text-red-200' : 'text-amber-200'} text-xs`}>تُستقطع منها اشتراكات Wireless</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-slate-500 text-sm font-medium mb-1">إجمالي التعبئة (من الوكيل)</p>
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white" dir="ltr">{Number(walletStats.totalRecharge ?? 0).toLocaleString()} د.ع</h3>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg">
                  <ArrowDownRight size={24} className="text-emerald-600" />
                </div>
              </div>
              <p className="text-emerald-600 text-xs font-medium flex items-center gap-1">
                <ArrowUpRight size={12} /> +12% عن الشهر الماضي
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-slate-500 text-sm font-medium mb-1">إجمالي الاستقطاعات (للاشتراكات)</p>
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white" dir="ltr">{Number(walletStats.totalExpense ?? 0).toLocaleString()} د.ع</h3>
                </div>
                <div className="p-3 bg-rose-50 rounded-lg">
                  <ArrowUpRight size={24} className="text-rose-600" />
                </div>
              </div>
              <p className="text-rose-600 text-xs font-medium flex items-center gap-1">
                <ArrowDownRight size={12} /> -5% عن الشهر الماضي
              </p>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">حركة المحفظة</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">التاريخ</th>
                    <th className="px-4 py-3 font-medium">المحفظة</th>
                    <th className="px-4 py-3 font-medium">نوع الحركة</th>
                    <th className="px-4 py-3 font-medium">الوصف</th>
                    <th className="px-4 py-3 font-medium">المبلغ (د.ع)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {walletTransactions.map(tx => {
                    const wType = (tx as any).walletType ?? (tx as any).wallet_type ?? 'ftth';
                    return (
                    <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-400" />
                          <span dir="ltr">{typeof tx.date === 'string' ? tx.date.split('T')[0] : tx.date}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${wType === 'wireless' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                          {wType === 'wireless' ? 'Wireless' : 'FTTH'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {tx.type === 'recharge' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">تعبئة محفظة</span>}
                        {tx.type === 'expense' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800">استقطاع اشتراك</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{tx.description}</td>
                      <td className={`px-4 py-3 font-bold ${tx.type === 'expense' ? 'text-rose-600' : 'text-emerald-600'}`} dir="ltr">
                        {tx.type === 'expense' ? '-' : '+'}{Number(tx.amount ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
            <h3 className="font-bold text-slate-800 dark:text-white">فئات الاشتراك</h3>
            {canInternet('addCategory') && (
            <button onClick={() => setIsAddCategoryOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
              <Plus size={16} /> إضافة فئة
            </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                <tr>
                  <th className="px-4 py-3 font-medium">اسم الفئة</th>
                  <th className="px-4 py-3 font-medium">النوع</th>
                  <th className="px-4 py-3 font-medium">السعر (د.ع)</th>
                  <th className="px-4 py-3 font-medium text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {categories.map(cat => (
                  <tr key={cat.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{cat.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${(cat.subscriptionType ?? cat.subscription_type ?? 'ftth').toLowerCase() === 'wireless' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                        {(cat.subscriptionType ?? cat.subscription_type ?? 'FTTH').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-indigo-600" dir="ltr">
                      {(cat.subscriptionType ?? cat.subscription_type ?? 'ftth').toLowerCase() === 'wireless' && cat.costPrice != null && !isNaN(Number(cat.costPrice))
                        ? `${Number(cat.costPrice).toLocaleString()} (تكلفة) / ${Number(cat.price ?? 0).toLocaleString()} (بيع)`
                        : Number(cat.price ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center flex justify-center gap-2">
                      <button onClick={() => openEditCategory(cat)} className="text-slate-400 hover:text-indigo-600 p-1" title="تعديل"><Edit size={16} /></button>
                      <button onClick={() => handleDeleteCategory(cat.id)} className="text-slate-400 hover:text-rose-600 p-1" title="حذف"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'phoneDirectory' && showPhoneDirectoryTab && <PhoneDirectoryTab />}

      {activeTab === 'alerts' && <AlertsPage />}

      {activeTab === 'ftthPortal' && showFtthPortalTab && (
        <FTTHPortal onInternetMetaRefresh={refreshInternetMeta} />
      )}

      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Date Filter */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap gap-4 items-end print:hidden">
            <div className="w-full sm:w-auto flex-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">من تاريخ</label>
              <input 
                type="date" 
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
              />
            </div>
            <div className="w-full sm:w-auto flex-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">إلى تاريخ</label>
              <input 
                type="date" 
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
              />
            </div>
            <button 
              onClick={() => { setReportStartDate(''); setReportEndDate(''); }}
              className="w-full sm:w-auto bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-6 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              مسح الفلاتر
            </button>
            <button 
              onClick={() => window.print()}
              className="w-full sm:w-auto bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-6 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <Printer size={16} />
              طباعة التقرير
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-6">
            <div className="bg-emerald-50 dark:bg-emerald-900/30 print:bg-white p-6 rounded-xl border border-emerald-100 dark:border-emerald-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-emerald-600 print:text-slate-700">
                <DollarSign size={28} />
              </div>
              <p className="text-sm font-bold text-emerald-800 print:text-slate-800 mb-2">المبالغ المستحصلة نقداً</p>
              <p className="text-2xl font-black text-emerald-600 print:text-slate-900" dir="ltr">{Number(internetReportData.cashCollected ?? 0).toLocaleString()}</p>
              <p className="text-xs text-emerald-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>
            
            <div className="bg-rose-50 dark:bg-rose-900/30 print:bg-white p-6 rounded-xl border border-rose-100 dark:border-rose-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-rose-600 print:text-slate-700">
                <CreditCard size={28} />
              </div>
              <p className="text-sm font-bold text-rose-800 print:text-slate-800 mb-2">الديون المسجلة (آجل)</p>
              <p className="text-2xl font-black text-rose-600 print:text-slate-900" dir="ltr">{(Number(internetReportData.debtsCreated) || 0).toLocaleString()}</p>
              <p className="text-xs text-rose-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-900/30 print:bg-white p-6 rounded-xl border border-indigo-100 dark:border-indigo-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-indigo-600 print:text-slate-700">
                <TrendingUp size={28} />
              </div>
              <p className="text-sm font-bold text-indigo-800 print:text-slate-800 mb-2">إجمالي الأرباح (المواد + الكاش باك + Wireless)</p>
              <p className="text-2xl font-black text-indigo-600 print:text-slate-900" dir="ltr">{Number(internetReportData.totalProfits ?? 0).toLocaleString()}</p>
              <p className="text-xs text-indigo-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/30 print:bg-white p-6 rounded-xl border border-amber-100 dark:border-amber-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-amber-600 print:text-slate-700">
                <TrendingUp size={28} />
              </div>
              <p className="text-sm font-bold text-amber-800 print:text-slate-800 mb-2">أرباح Wireless</p>
              <p className="text-2xl font-black text-amber-600 print:text-slate-900" dir="ltr">{Number(internetReportData.wirelessProfits ?? 0).toLocaleString()}</p>
              <p className="text-xs text-amber-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>
          </div>

          {/* Cashback Settings */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden p-6">
            <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Wallet size={20} className="text-indigo-600" />
              إعدادات الكاش باك (مبلغ الراجع)
            </h3>
            <div className="flex flex-col sm:flex-row items-end gap-4">
              <div className="w-full sm:w-1/3">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">قيمة الكاش باك لكل مشترك (د.ع)</label>
                <input 
                  type="number" 
                  value={cashbackValue}
                  onChange={(e) => setCashbackValue(Number(e.target.value))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  min="0"
                />
              </div>
              <button 
                onClick={async () => {
                  try {
                    const saved = (await expensesApi.createCashbackHistory({
                      amount: cashbackValue,
                      description: currentUser?.name || 'مجهول'
                    })) as { id: number; date?: string; amount?: number; description?: string };
                    const newHistory = {
                      id: saved.id,
                      date: saved.date ? String(saved.date).split('T')[0] : new Date().toISOString().split('T')[0],
                      value: Number(saved.amount ?? cashbackValue),
                      user: saved.description || currentUser?.name || 'مجهول',
                      description: saved.description || ''
                    };
                    setCashbackHistory([newHistory, ...cashbackHistory]);
                    setCashbackValue(Number(saved.amount ?? cashbackValue));
                    alert('تم حفظ قيمة الكاش باك في قاعدة البيانات بنجاح');
                  } catch (error) {
                    console.error('Failed to save cashback value', error);
                    alert('حدث خطأ أثناء حفظ الكاش باك');
                  }
                }}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors h-[38px]"
              >
                حفظ القيمة
              </button>
            </div>
            
            <div className="mt-6 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg p-4 border border-indigo-100 dark:border-indigo-800 flex justify-between items-center">
              <div>
                <p className="text-indigo-800 dark:text-indigo-300 font-medium">إجمالي الكاش باك المتوقع</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">يتم ضرب القيمة في عدد مشتركي FTTH فقط ({internetReportData.ftthSubscribersCount ?? 0}) - Wireless لا يحسب كاش باك</p>
              </div>
              <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300" dir="ltr">
                {Number((cashbackValue ?? 0) * (internetReportData.ftthSubscribersCount ?? 0)).toLocaleString()} د.ع
              </div>
            </div>
          </div>

          {/* Material Sales Reports */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <BarChart3 size={20} className="text-emerald-600" />
                تفاصيل بيع مواد الإنترنت
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-b border-slate-100 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/30">
              <div className="bg-white dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">إجمالي المبالغ المستحصلة (مواد)</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white" dir="ltr">
                  {materialSales.filter(sale => internetReportData.isDateInRange(sale.date)).reduce((sum, sale) => sum + Number(sale.totalAmount ?? 0), 0).toLocaleString()} د.ع
                </p>
              </div>
              <div className="bg-white dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">إجمالي الأرباح (مواد)</p>
                <p className="text-2xl font-bold text-emerald-600" dir="ltr">
                  {materialSales.filter(sale => internetReportData.isDateInRange(sale.date)).reduce((sum, sale) => sum + Number(sale.profit ?? 0), 0).toLocaleString()} د.ع
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">التاريخ</th>
                    <th className="px-4 py-3 font-medium">المادة</th>
                    <th className="px-4 py-3 font-medium">الكمية</th>
                    <th className="px-4 py-3 font-medium">السعر الإجمالي (د.ع)</th>
                    <th className="px-4 py-3 font-medium">الربح (د.ع)</th>
                    <th className="px-4 py-3 font-medium">طريقة الدفع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {materialSales.filter(sale => internetReportData.isDateInRange(sale.date)).length > 0 ? (
                    materialSales.filter(sale => internetReportData.isDateInRange(sale.date)).map(sale => (
                      <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{sale.date}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{sale.materialName}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{sale.quantity}</td>
                        <td className="px-4 py-3 font-bold text-indigo-600" dir="ltr">{Number(sale.totalAmount ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 font-bold text-emerald-600" dir="ltr">{Number(sale.profit ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          {sale.paymentMethod === 'cash' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">نقداً</span>
                          ) : (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 w-fit">آجل</span>
                              <span className="text-xs text-slate-500 mt-1">{sale.subscriberName}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        لا توجد عمليات بيع مسجلة في هذه الفترة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cashback History */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <History size={20} className="text-slate-600" />
                سجل حركات الكاش باك
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">التاريخ</th>
                    <th className="px-4 py-3 font-medium">القيمة (د.ع)</th>
                    <th className="px-4 py-3 font-medium">بواسطة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {cashbackHistory.filter(h => internetReportData.isDateInRange(h.date)).length > 0 ? (
                    cashbackHistory.filter(h => internetReportData.isDateInRange(h.date)).map(history => (
                      <tr key={history.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-600">{history.date}</td>
                        <td className="px-4 py-3 font-bold text-indigo-600" dir="ltr">{Number(history.value ?? history.amount ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-600">{history.user}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                        لا توجد حركات مسجلة في هذه الفترة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Material Modal */}
      {isAddMaterialOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">إضافة مادة جديدة</h3>
              <button type="button" onClick={() => setIsAddMaterialOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleAddMaterial(); }}>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">اسم المادة</label>
                <input 
                  type="text" 
                  value={newMaterialName}
                  onChange={(e) => setNewMaterialName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="أدخل اسم المادة" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">سعر الشراء (د.ع)</label>
                  <input 
                    type="number" 
                    value={newMaterialPurchasePrice}
                    onChange={(e) => setNewMaterialPurchasePrice(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                    dir="ltr" 
                    placeholder="0" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">سعر البيع (د.ع)</label>
                  <input 
                    type="number" 
                    value={newMaterialSellingPrice}
                    onChange={(e) => setNewMaterialSellingPrice(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                    dir="ltr" 
                    placeholder="0" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الكمية</label>
                <input 
                  type="number" 
                  value={newMaterialQuantity}
                  onChange={(e) => setNewMaterialQuantity(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  placeholder="0" 
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button type="button" onClick={() => setIsAddMaterialOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">حفظ المادة</button>
            </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Material Modal */}
      {isEditMaterialOpen && selectedMaterial && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">تعديل المادة</h3>
              <button type="button" onClick={() => setIsEditMaterialOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleEditMaterial(); }}>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">اسم المادة</label>
                <input 
                  type="text" 
                  value={newMaterialName}
                  onChange={(e) => setNewMaterialName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="أدخل اسم المادة" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">سعر الشراء (د.ع)</label>
                  <input 
                    type="number" 
                    value={newMaterialPurchasePrice}
                    onChange={(e) => setNewMaterialPurchasePrice(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                    dir="ltr" 
                    placeholder="0" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">سعر البيع (د.ع)</label>
                  <input 
                    type="number" 
                    value={newMaterialSellingPrice}
                    onChange={(e) => setNewMaterialSellingPrice(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                    dir="ltr" 
                    placeholder="0" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">الكمية</label>
                <input 
                  type="number" 
                  value={newMaterialQuantity}
                  onChange={(e) => setNewMaterialQuantity(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  placeholder="0" 
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button type="button" onClick={() => setIsEditMaterialOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">حفظ التعديلات</button>
            </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {isEditCategoryOpen && selectedCategory && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800">تعديل الفئة</h3>
              <button type="button" onClick={() => setIsEditCategoryOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">نوع الاشتراك</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="editCatType" checked={newCategoryType === 'ftth'} onChange={() => setNewCategoryType('ftth')} className="rounded" />
                    <span>FTTH</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="editCatType" checked={newCategoryType === 'wireless'} onChange={() => setNewCategoryType('wireless')} className="rounded" />
                    <span>Wireless</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">اسم الفئة</label>
                <input 
                  type="text" 
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="مثال: اشتراك عادي" 
                />
              </div>
              {newCategoryType === 'ftth' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">السعر (د.ع)</label>
                  <input 
                    type="number" 
                    value={newCategoryPrice}
                    onChange={(e) => setNewCategoryPrice(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                    dir="ltr" 
                    placeholder="0" 
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">سعر التكلفة (د.ع)</label>
                    <input 
                      type="number" 
                      value={newCategoryCostPrice}
                      onChange={(e) => setNewCategoryCostPrice(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                      dir="ltr" 
                      placeholder="0" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">سعر البيع (د.ع)</label>
                    <input 
                      type="number" 
                      value={newCategoryPrice}
                      onChange={(e) => setNewCategoryPrice(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                      dir="ltr" 
                      placeholder="0" 
                    />
                    {newCategoryCostPrice && newCategoryPrice && (
                      <p className="text-[11px] text-emerald-600 mt-1">الربح: {(parseFloat(newCategoryPrice) - parseFloat(newCategoryCostPrice)).toLocaleString()} د.ع</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button type="button" onClick={() => setIsEditCategoryOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">إلغاء</button>
              <button type="button" onClick={handleEditCategory} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">حفظ التعديلات</button>
            </div>
          </div>
        </div>
      )}

      {/* Sell Material Modal */}
      {isSellMaterialOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800">بيع مادة</h3>
              <button onClick={() => setIsSellMaterialOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">المادة</label>
                <select 
                  value={sellMaterialId}
                  onChange={(e) => setSellMaterialId(e.target.value ? Number(e.target.value) : '')}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                >
                  <option value="">اختر مادة</option>
                  {materials.map(mat => (
                    <option key={mat.id} value={mat.id} disabled={mat.quantity === 0}>
                      {mat.name} - المتوفر: {mat.quantity}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الكمية المباعة</label>
                <input 
                  type="number" 
                  value={sellQuantity}
                  onChange={(e) => setSellQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  min="1" 
                  max={sellMaterialId ? materials.find(m => m.id === sellMaterialId)?.quantity || 1 : 1}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">طريقة الدفع</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="cash" 
                      checked={sellPaymentMethod === 'cash'} 
                      onChange={() => setSellPaymentMethod('cash')}
                      className="text-indigo-600 focus:ring-indigo-500" 
                    />
                    <span className="text-sm text-slate-700">نقداً</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="debt" 
                      checked={sellPaymentMethod === 'debt'} 
                      onChange={() => setSellPaymentMethod('debt')}
                      className="text-indigo-600 focus:ring-indigo-500" 
                    />
                    <span className="text-sm text-slate-700">آجل (دين على مشترك)</span>
                  </label>
                </div>
              </div>
              {sellPaymentMethod === 'debt' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">المشترك</label>
                  <select 
                    value={sellSubscriberId}
                    onChange={(e) => setSellSubscriberId(e.target.value ? Number(e.target.value) : '')}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  >
                    <option value="">اختر المشترك</option>
                    {subscribers.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.realName ?? sub.real_name} - {sub.phone}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">السعر الإجمالي:</span>
                  <span className="text-lg font-bold text-indigo-600" dir="ltr">
                    {sellMaterialId 
                      ? ((materials.find(m => m.id === sellMaterialId)?.sellingPrice || 0) * sellQuantity).toLocaleString() 
                      : '0'} د.ع
                  </span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button onClick={() => setIsSellMaterialOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">إلغاء</button>
              <button 
                onClick={handleSellMaterial} 
                disabled={!sellMaterialId || sellQuantity <= 0 || sellQuantity > (materials.find(m => m.id === sellMaterialId)?.quantity || 0) || (sellPaymentMethod === 'debt' && !sellSubscriberId)}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                تأكيد البيع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Zone Modal */}
      {isAddZoneOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">إضافة منطقة جديدة</h3>
              <button onClick={() => setIsAddZoneOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">اسم المنطقة</label>
                <input 
                  type="text" 
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="مثال: F198" 
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button onClick={() => setIsAddZoneOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button onClick={handleAddZone} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">حفظ المنطقة</button>
            </div>
          </div>
        </div>
      )}

      {/* Add FAT Modal */}
      {isAddFatOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">إضافة FAT جديد</h3>
              <button onClick={() => setIsAddFatOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">المنطقة</label>
                <select 
                  value={newFatZoneId}
                  onChange={(e) => setNewFatZoneId(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                >
                  <option value="">اختر المنطقة...</option>
                  {zones.map(zone => (
                    <option key={zone.id} value={zone.id}>{zone.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">اسم FAT</label>
                <input 
                  type="text" 
                  value={newFatName}
                  onChange={(e) => setNewFatName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="مثال: T3" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الإحداثيات (خرائط جوجل)</label>
                <div className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      value={newFatCoordinates}
                      onChange={(e) => setNewFatCoordinates(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                      dir="ltr" 
                      placeholder="32°28'02.2&quot;N 46°41'22.5&quot;E أو 32.467278, 46.689583" 
                    />
                  </div>
                  <button 
                    onClick={() => {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            setNewFatCoordinates(`${position.coords.latitude}, ${position.coords.longitude}`);
                          },
                          (error) => {
                            console.error("Error getting location:", error);
                            alert("تعذر الحصول على الموقع الحالي. يرجى التأكد من تفعيل خدمات الموقع.");
                          }
                        );
                      } else {
                        alert("متصفحك لا يدعم تحديد الموقع الجغرافي.");
                      }
                    }}
                    className="bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-500 transition-colors flex items-center gap-2 border border-slate-200 dark:border-slate-600" 
                    title="تحديد الموقع الحالي"
                  >
                    <Navigation size={16} />
                  </button>
                </div>
                <div className="h-48 w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 z-0 relative mb-1">
                  <MapContainer 
                    center={parseCoordinates(newFatCoordinates) || [32.467278, 46.689583]} 
                    zoom={14} 
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapControls />
                    <MapClickHandler onLocationSelect={(lat, lng) => setNewFatCoordinates(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)} />
                    {parseCoordinates(newFatCoordinates) && (
                      <Marker position={parseCoordinates(newFatCoordinates) as L.LatLngExpression} />
                    )}
                  </MapContainer>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">يمكنك لصق الإحداثيات، أو النقر على الخريطة لتحديد الموقع، أو استخدام زر الموقع الحالي.</p>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button type="button" onClick={() => setIsAddFatOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button type="button" onClick={handleAddFat} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">حفظ FAT</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit FAT Modal */}
      {isEditFatOpen && selectedFat && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">تعديل FAT</h3>
              <button onClick={() => setIsEditFatOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">المنطقة</label>
                <select 
                  value={newFatZoneId}
                  onChange={(e) => setNewFatZoneId(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                >
                  <option value="">اختر المنطقة...</option>
                  {zones.map(zone => (
                    <option key={zone.id} value={zone.id}>{zone.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">اسم FAT</label>
                <input 
                  type="text" 
                  value={newFatName}
                  onChange={(e) => setNewFatName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="مثال: T3" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الإحداثيات (خرائط جوجل)</label>
                <div className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      value={newFatCoordinates}
                      onChange={(e) => setNewFatCoordinates(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                      dir="ltr" 
                      placeholder="32°28'02.2&quot;N 46°41'22.5&quot;E أو 32.467278, 46.689583" 
                    />
                  </div>
                  <button 
                    onClick={() => {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            setNewFatCoordinates(`${position.coords.latitude}, ${position.coords.longitude}`);
                          },
                          (error) => {
                            console.error("Error getting location:", error);
                            alert("تعذر الحصول على الموقع الحالي. يرجى التأكد من تفعيل خدمات الموقع.");
                          }
                        );
                      } else {
                        alert("متصفحك لا يدعم تحديد الموقع الجغرافي.");
                      }
                    }}
                    className="bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-500 transition-colors flex items-center gap-2 border border-slate-200 dark:border-slate-600" 
                    title="تحديد الموقع الحالي"
                  >
                    <Navigation size={16} />
                  </button>
                </div>
                <div className="h-48 w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 z-0 relative mb-1">
                  <MapContainer 
                    center={parseCoordinates(newFatCoordinates) || [32.467278, 46.689583]} 
                    zoom={14} 
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapControls />
                    <MapClickHandler onLocationSelect={(lat, lng) => setNewFatCoordinates(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)} />
                    {parseCoordinates(newFatCoordinates) && (
                      <Marker position={parseCoordinates(newFatCoordinates) as L.LatLngExpression} />
                    )}
                  </MapContainer>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">يمكنك لصق الإحداثيات، أو النقر على الخريطة لتحديد الموقع، أو استخدام زر الموقع الحالي.</p>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button type="button" onClick={() => setIsEditFatOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">إلغاء</button>
              <button type="button" onClick={handleEditFat} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">حفظ التعديلات</button>
            </div>
          </div>
        </div>
      )}

      {/* Recharge Wallet Modal */}
      {isRechargeWalletOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">تعبئة المحفظة</h3>
              <button onClick={() => setIsRechargeWalletOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">نوع المحفظة</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-200">
                    <input type="radio" name="rechargeWalletType" checked={rechargeWalletType === 'ftth'} onChange={() => setRechargeWalletType('ftth')} className="rounded" />
                    <span>FTTH</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-200">
                    <input type="radio" name="rechargeWalletType" checked={rechargeWalletType === 'wireless'} onChange={() => setRechargeWalletType('wireless')} className="rounded" />
                    <span>Wireless</span>
                  </label>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{rechargeWalletType === 'ftth' ? 'تعبئة المحفظة الحالية (FTTH)' : 'تعبئة محفظة Wireless (تُستقطع منها اشتراكات Wireless)'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">المبلغ (د.ع)</label>
                <input 
                  type="number" 
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  placeholder="0" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">تاريخ التعبئة</label>
                <input 
                  type="date" 
                  value={rechargeDate}
                  onChange={(e) => setRechargeDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">ملاحظات</label>
                <textarea 
                  value={rechargeNotes}
                  onChange={(e) => setRechargeNotes(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  rows={3} 
                  placeholder="تفاصيل التعبئة..."
                ></textarea>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button onClick={() => setIsRechargeWalletOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button onClick={handleRechargeWallet} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">تأكيد التعبئة</button>
            </div>
          </div>
        </div>
      )}

      {/* Subscribers Import Modal */}
      {isSubscribersImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-white">استيراد المشتركين من Excel</h3>
              <button onClick={() => setIsSubscribersImportModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                ارفع ملف <strong className="text-slate-800 dark:text-slate-100">.xlsx</strong> أو <strong className="text-slate-800 dark:text-slate-100">.xls</strong> فقط من هنا.
                لا تستخدم زر رفع CSV الصغير بجانب الجدول — ذلك للملفات النصية فقط وليس لـ Excel.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                تاريخ البداية أو النهاية مطلوب واحد على الأقل. إن وُجد تاريخ النهاية فقط، يُحسب تاريخ البداية تلقائياً (النهاية − 29 يوماً تقويمياً = 30 يوم خدمة شاملة للبداية والنهاية).
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setSubscribersImportFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate-600 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 dark:file:bg-indigo-900/30 dark:file:text-indigo-300"
              />
              {subscribersImportMessage && (
                <div className={`p-3 rounded-lg text-sm ${subscribersImportMessage.includes('فشل') ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'}`}>
                  {subscribersImportMessage}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
              <button onClick={() => setIsSubscribersImportModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200">
                إلغاء
              </button>
              <button
                onClick={async () => {
                  if (!subscribersImportFile) { setSubscribersImportMessage('يرجى اختيار ملف'); return; }
                  setSubscribersImportLoading(true);
                  setSubscribersImportMessage('');
                  try {
                    const result = await subscribersImportExportApi.importExcel(subscribersImportFile);
                    setSubscribersImportMessage(result?.message ?? `تم استيراد ${result?.inserted ?? 0} مشترك`);
                    setSubscribersImportFile(null);
                    if (result?.inserted) {
                      const [fresh, histRaw] = await Promise.all([subscribersApi.getAll(), subscribersApi.getHistory()]);
                      const histList = Array.isArray(histRaw) ? histRaw : [];
                      const merged: Subscriber[] = (Array.isArray(fresh) ? fresh : []).map((s: Record<string, unknown>) => ({
                        ...s,
                        history: histList
                          .filter((h: Record<string, unknown>) => Number(h.subscriberId ?? h.subscriber_id) === Number(s.id))
                          .map((h: Record<string, unknown>) => ({
                            id: h.id as number,
                            date: h.date ? String(h.date).split('T')[0] : '',
                            type: String(h.type || ''),
                            amount: Number(h.amount || 0),
                            description: String(h.description || ''),
                          })),
                      })) as Subscriber[];
                      setSubscribers(merged);
                    }
                  } catch (err: any) {
                    setSubscribersImportMessage(err?.message ?? 'فشل الاستيراد');
                  } finally {
                    setSubscribersImportLoading(false);
                  }
                }}
                disabled={subscribersImportLoading || !subscribersImportFile}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {subscribersImportLoading ? 'جاري الاستيراد...' : 'استيراد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Subscriber Modal */}
      {isAddSubscriberOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 shrink-0">
              <h3 className="font-bold text-slate-800 dark:text-white">إضافة مشترك جديد</h3>
              <button onClick={() => setIsAddSubscriberOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">نوع الاشتراك</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-200">
                    <input type="radio" name="subType" checked={newSubscriberType === 'ftth'} onChange={() => { setNewSubscriberType('ftth'); setNewSubscriberCategory(''); }} className="rounded" />
                    <span>FTTH</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-200">
                    <input type="radio" name="subType" checked={newSubscriberType === 'wireless'} onChange={() => { setNewSubscriberType('wireless'); setNewSubscriberCategory(''); }} className="rounded" />
                    <span>Wireless</span>
                  </label>
                </div>
              </div>
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800">
                <label className="block text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-2">طريقة الدفع للتفعيل</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-200">
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      checked={newSubscriberPaymentMethod === 'cash'} 
                      onChange={() => setNewSubscriberPaymentMethod('cash')} 
                      className="rounded text-indigo-600 focus:ring-indigo-500" 
                    />
                    <span className="text-sm font-medium">نقد / بطاقة (دفع خارجي)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-200">
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      checked={newSubscriberPaymentMethod === 'wallet'} 
                      onChange={() => setNewSubscriberPaymentMethod('wallet')} 
                      className="rounded text-indigo-600 focus:ring-indigo-500" 
                    />
                    <span className="text-sm font-medium">المحفظة (استقطاع تلقائي)</span>
                  </label>
                </div>
                <p className="mt-1 text-[10px] text-indigo-600/70 dark:text-indigo-400/70">
                  {newSubscriberPaymentMethod === 'wallet' 
                    ? `سيتم استقطاع كامل مبلغ الاشتراك من محفظة ${newSubscriberType === 'wireless' ? 'Wireless' : 'FTTH'}.`
                    : 'لن يتم لمس المحفظة. يتم تسجيل المبلغ الواصل في السجل والديون فقط.'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">الاسم الحقيقي</label>
                <input 
                  type="text" 
                  value={newSubscriberName}
                  onChange={(e) => setNewSubscriberName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="أدخل الاسم الحقيقي" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الاسم في البطاقة الوطنية</label>
                <input 
                  type="text" 
                  value={newSubscriberNationalName}
                  onChange={(e) => setNewSubscriberNationalName(e.target.value)}
                  disabled={newSubscriberType === 'wireless'}
                  className={`w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none ${newSubscriberType === 'wireless' ? 'bg-slate-100 dark:bg-slate-600/50 text-slate-500 cursor-not-allowed' : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100'}`}
                  placeholder={newSubscriberType === 'wireless' ? 'غير مطلوب للـ Wireless' : 'أدخل الاسم كما في البطاقة الوطنية'} 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">رقم الهاتف</label>
                <input 
                  type="text" 
                  value={newSubscriberPhone}
                  onChange={(e) => setNewSubscriberPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  maxLength={15}
                  placeholder="077… أو 78… أو 964…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">USER CODE</label>
                <input
                  type="text"
                  value={generatedUserCode}
                  readOnly
                  className={`w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm font-mono focus:ring-0 outline-none ${newSubscriberType === 'wireless' ? 'bg-slate-100 dark:bg-slate-600/50 text-slate-500' : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}
                  dir="ltr"
                />
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{newSubscriberType === 'wireless' ? 'غير مطلوب للاشتراك Wireless.' : 'يتم توليده تلقائيًا ويُحفظ في قاعدة البيانات. إذا تكرر، النظام يضيف لاحقة تلقائية مثل -01.'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{newSubscriberType === 'wireless' ? 'الباقة' : 'فئة الاشتراك'}</label>
                  <select 
                    value={newSubscriberCategory}
                    onChange={(e) => {
                      const catId = e.target.value;
                      setNewSubscriberCategory(catId);
                      const cat = categoriesForAddSubscriber.find(c => c.id.toString() === catId);
                      if (cat && (cat.subscriptionType ?? cat.subscription_type)) {
                        setNewSubscriberType((cat.subscriptionType ?? cat.subscription_type).toLowerCase() as 'ftth' | 'wireless');
                      }
                    }}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  >
                    <option value="">{newSubscriberType === 'wireless' ? 'اختر الباقة...' : 'اختر الفئة...'}</option>
                    {categoriesForAddSubscriber.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} - {newSubscriberType === 'wireless' && cat.costPrice != null ? `${Number(cat.costPrice).toLocaleString()} (تكلفة) / ` : ''}{Number(cat.price ?? 0).toLocaleString()} د.ع
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">تاريخ الاشتراك</label>
                  <input 
                    type="date" 
                    value={newSubscriberSubscriptionDate}
                    onChange={(e) => setNewSubscriberSubscriptionDate(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">المبلغ المستلم (د.ع)</label>
                  <input 
                    type="number" 
                    value={newSubscriberPaidAmount}
                    onChange={(e) => setNewSubscriberPaidAmount(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                    dir="ltr" 
                    placeholder="0" 
                  />
                  {newSubscriberCategory && (
                    <div className="mt-1 text-[10px] font-bold text-rose-600">
                      الديون المتبقية: {((categoriesForAddSubscriber.find(c => c.id.toString() === newSubscriberCategory)?.price || 0) - (parseFloat(newSubscriberPaidAmount) || 0)).toLocaleString()} د.ع
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">المنطقة</label>
                  <select 
                    value={String(newSubscriberZone || '')}
                    onChange={(e) => {
                      setNewSubscriberZone(e.target.value);
                      setNewSubscriberFat('');
                    }}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  >
                    <option value="">اختر المنطقة...</option>
                    {zones.map(zone => (
                      <option key={zone.id} value={zone.id}>{zone.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">FAT</label>
                  <select 
                    value={String(newSubscriberFat || '')}
                    onChange={(e) => setNewSubscriberFat(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                    disabled={!newSubscriberZone}
                  >
                    <option value="">اختر FAT...</option>
                    {fats.filter(f => String(f.zoneId ?? f.zone_id) === String(newSubscriberZone)).map(fat => (
                      <option key={fat.id} value={fat.id}>{fat.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الموقع الجغرافي (إحداثيات جوجل ماب)</label>
                <div className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      value={newSubscriberLocation}
                      onChange={(e) => setNewSubscriberLocation(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                      dir="ltr" 
                      placeholder="مثال: 32.467278, 46.689583" 
                    />
                  </div>
                  <button 
                    onClick={() => {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            setNewSubscriberLocation(`${position.coords.latitude}, ${position.coords.longitude}`);
                          },
                          (error) => {
                            console.error("Error getting location:", error);
                            alert("تعذر الحصول على الموقع الحالي. يرجى التأكد من تفعيل خدمات الموقع.");
                          }
                        );
                      } else {
                        alert("متصفحك لا يدعم تحديد الموقع الجغرافي.");
                      }
                    }}
                    className="bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-500 transition-colors flex items-center gap-2 border border-slate-200 dark:border-slate-600" 
                    title="تحديد الموقع الحالي"
                  >
                    <Navigation size={16} />
                  </button>
                </div>
                <div className="h-48 w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 z-0 relative mb-1">
                  <MapContainer 
                    center={parseCoordinates(newSubscriberLocation) || [32.467278, 46.689583]} 
                    zoom={14} 
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapControls />
                    <MapClickHandler onLocationSelect={(lat, lng) => setNewSubscriberLocation(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)} />
                    {parseCoordinates(newSubscriberLocation) && (
                      <Marker position={parseCoordinates(newSubscriberLocation) as L.LatLngExpression} />
                    )}
                  </MapContainer>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">يمكنك لصق الإحداثيات، أو النقر على الخريطة لتحديد الموقع، أو استخدام زر الموقع الحالي.</p>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50 shrink-0">
              <button onClick={() => setIsAddSubscriberOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button onClick={handleAddSubscriber} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">حفظ المشترك</button>
            </div>
          </div>
        </div>
      )}

      {/* Renew Subscription Modal */}
      {isRenewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 shrink-0">
              <h3 className="font-bold text-slate-800 dark:text-white">تجديد الاشتراك</h3>
              <button onClick={() => setIsRenewModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRenewSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">تاريخ التجديد</label>
                <input 
                  type="date" 
                  value={renewFormData.renewalDate}
                  min={formatLocalDate(startOfLocalDay(new Date()))}
                  onChange={(e) => {
                    const v = e.target.value;
                    const minD = formatLocalDate(startOfLocalDay(new Date()));
                    if (v && v < minD) {
                      setRenewFormData({ ...renewFormData, renewalDate: minD });
                      return;
                    }
                    setRenewFormData({ ...renewFormData, renewalDate: v });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  required
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">لا يُسمح بتاريخ قبل اليوم (حسب تاريخ الجهاز).</p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  تاريخ الانتهاء (تاريخ التجديد + 29 يوماً تقويمياً = 30 يوم خدمة + الأيام المتبقية إن كان الاشتراك غير منتهٍ)
                </label>
                <input 
                  type="date" 
                  value={
                    renewFormData.renewalDate && renewFormData.subscriberId
                      ? computeRenewalExpirationDate(
                          renewFormData.renewalDate,
                          subscribers.find(s => s.id === renewFormData.subscriberId) ?? { expirationDate: undefined },
                        )
                      : ''
                  }
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200"
                  disabled
                  readOnly
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">طريقة التجديد</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const category = categories.find(c => c.name === subscribers.find(s => s.id === renewFormData.subscriberId)?.category);
                      setRenewFormData({
                        ...renewFormData, 
                        renewalMethod: 'page',
                        amountReceived: category?.price.toString() || '',
                        renewalPaymentMethod: 'cash',
                      });
                    }}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      renewFormData.renewalMethod === 'page'
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                        : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                    }`}
                  >
                    من خلال الصفحة
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenewFormData({...renewFormData, renewalMethod: 'master', amountReceived: '0', renewalPaymentMethod: 'cash'})}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      renewFormData.renewalMethod === 'master'
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                        : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                    }`}
                  >
                    عن طريق الماستر
                  </button>
                </div>
              </div>

              {renewFormData.renewalMethod === 'page' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">طريقة الدفع</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const category = categories.find(c => c.name === subscribers.find(s => s.id === renewFormData.subscriberId)?.category);
                        setRenewFormData({
                          ...renewFormData,
                          renewalPaymentMethod: 'cash',
                          amountReceived: category?.price.toString() || '',
                        });
                      }}
                      className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        renewFormData.renewalPaymentMethod === 'cash'
                          ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                      }`}
                    >
                      نقد (المبالغ المستحصلة)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenewFormData({...renewFormData, renewalPaymentMethod: 'debt', amountReceived: '0'})}
                      className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        renewFormData.renewalPaymentMethod === 'debt'
                          ? 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-600 text-rose-700 dark:text-rose-300'
                          : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                      }`}
                    >
                      آجل (إضافة للديون)
                    </button>
                  </div>
                </div>
              )}

              {renewFormData.renewalMethod === 'page' && renewFormData.renewalPaymentMethod === 'cash' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">المبلغ الواصل من التجديد (د.ع)</label>
                  <input 
                    type="number" 
                    value={renewFormData.amountReceived}
                    onChange={(e) => setRenewFormData({...renewFormData, amountReceived: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="أدخل المبلغ الواصل"
                    required
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    سعر الاشتراك: {Number(categories.find(c => c.name === subscribers.find(s => s.id === renewFormData.subscriberId)?.category)?.price ?? 0).toLocaleString()} د.ع
                  </p>
                </div>
              )}

              {renewFormData.renewalMethod === 'page' && renewFormData.renewalPaymentMethod === 'debt' && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                  <p className="text-sm font-medium text-rose-800 dark:text-rose-200">تجديد بالآجل</p>
                  <p className="text-xs text-rose-600 dark:text-rose-300 mt-1">
                    سيتم إضافة {Number(categories.find(c => c.name === subscribers.find(s => s.id === renewFormData.subscriberId)?.category)?.price ?? 0).toLocaleString()} د.ع إلى دين المشترك
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button type="button" onClick={() => setIsRenewModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">إلغاء</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">تأكيد التجديد</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Subscriber Modal */}
      {isEditSubscriberOpen && selectedSubscriber && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 shrink-0">
              <h3 className="font-bold text-slate-800">تعديل بيانات المشترك</h3>
              <button onClick={() => setIsEditSubscriberOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">نوع الاشتراك</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="editSubType" checked={newSubscriberType === 'ftth'} onChange={() => setNewSubscriberType('ftth')} className="rounded" />
                    <span>FTTH</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="editSubType" checked={newSubscriberType === 'wireless'} onChange={() => setNewSubscriberType('wireless')} className="rounded" />
                    <span>Wireless</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الاسم الحقيقي</label>
                <input 
                  type="text" 
                  value={newSubscriberName}
                  onChange={(e) => setNewSubscriberName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="أدخل الاسم الحقيقي" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الاسم في البطاقة الوطنية</label>
                <input 
                  type="text" 
                  value={newSubscriberNationalName}
                  onChange={(e) => setNewSubscriberNationalName(e.target.value)}
                  disabled={newSubscriberType === 'wireless'}
                  className={`w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none ${newSubscriberType === 'wireless' ? 'bg-slate-100 dark:bg-slate-600/50 text-slate-500 cursor-not-allowed' : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100'}`}
                  placeholder={newSubscriberType === 'wireless' ? 'غير مطلوب للـ Wireless' : 'أدخل الاسم كما في البطاقة الوطنية'} 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">رقم الهاتف</label>
                <input 
                  type="text" 
                  value={newSubscriberPhone}
                  onChange={(e) => setNewSubscriberPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  maxLength={15}
                  placeholder="077… أو 78… أو 964…"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">فئة الاشتراك</label>
                  <select 
                    value={newSubscriberCategory}
                    onChange={(e) => setNewSubscriberCategory(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  >
                    <option value="">اختر الفئة...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name} - {Number(cat.price ?? 0).toLocaleString()} د.ع</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">المبلغ المستلم (د.ع)</label>
                  <input 
                    type="number" 
                    value={newSubscriberPaidAmount}
                    onChange={(e) => setNewSubscriberPaidAmount(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                    dir="ltr" 
                    placeholder="0" 
                  />
                  {newSubscriberCategory && (
                    <div className="mt-1 text-[10px] font-bold text-rose-600">
                      الديون المتبقية: {((categoriesForAddSubscriber.find(c => c.id.toString() === newSubscriberCategory)?.price || 0) - (parseFloat(newSubscriberPaidAmount) || 0)).toLocaleString()} د.ع
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 p-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/20">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">تواريخ الاشتراك والانتهاء</div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  تغيير أي حقل يحدّث البقية فوراً. العرض DD/MM/YYYY. المتبقي = انتهاء − اليوم (بداية اليوم).
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">تاريخ الاشتراك</label>
                    <input
                      type="date"
                      value={newSubscriberSubscriptionDate}
                      onChange={(e) => applyEditSubscriptionDate(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                      dir="ltr"
                    />
                    <div className="text-[10px] text-slate-500 mt-0.5 font-mono" dir="ltr">
                      {formatDateDDMMYYYY(newSubscriberSubscriptionDate) || '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">تاريخ الانتهاء</label>
                    <input
                      type="date"
                      value={newSubscriberExpirationDate}
                      onChange={(e) => applyEditExpirationDate(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                      dir="ltr"
                    />
                    <div className="text-[10px] text-slate-500 mt-0.5 font-mono" dir="ltr">
                      {formatDateDDMMYYYY(newSubscriberExpirationDate) || '—'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">مدة (أيام تقويمية)</label>
                    <input
                      type="number"
                      min={1}
                      max={3660}
                      dir="ltr"
                      value={newSubscriberSpanDaysStr}
                      onChange={(e) => applyEditSpan(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">نوع المدة</span>
                    <div className="flex flex-wrap gap-3 text-[11px] text-slate-700 dark:text-slate-200">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="editSubDurationMode"
                          checked={newSubscriberDurationMode === 'calendar_days'}
                          onChange={() => applyEditDurationMode('calendar_days')}
                        />
                        حسب الأيام
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="editSubDurationMode"
                          checked={newSubscriberDurationMode === 'one_calendar_month'}
                          onChange={() => applyEditDurationMode('one_calendar_month')}
                        />
                        شهر تقويمي
                      </label>
                    </div>
                  </div>
                </div>
                <div className="rounded-md bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 p-2 text-[11px] text-slate-700 dark:text-slate-200 space-y-1">
                  <div className="font-semibold">ملخص</div>
                  <div dir="ltr" className="font-mono">
                    متبقٍ:{' '}
                    {editSubscriberDateSummary.remainingCalendarDays === null
                      ? '—'
                      : editSubscriberDateSummary.remainingCalendarDays < 0
                        ? `${editSubscriberDateSummary.remainingCalendarDays} (منتهٍ)`
                        : editSubscriberDateSummary.remainingCalendarDays === 0
                          ? 'اليوم (0)'
                          : editSubscriberDateSummary.remainingCalendarDays}
                  </div>
                  <div dir="ltr" className="font-mono">
                    أيام شاملة (بداية+نهاية): {editSubscriberDateSummary.inclusiveTotalDays ?? '—'} | فرق تقويمي:{' '}
                    {editSubscriberDateSummary.spanCalendarDays ?? '—'}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">المنطقة</label>
                  <select 
                    value={String(newSubscriberZone || '')}
                    onChange={(e) => {
                      setNewSubscriberZone(e.target.value);
                      setNewSubscriberFat('');
                    }}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  >
                    <option value="">اختر المنطقة...</option>
                    {zones.map(zone => (
                      <option key={zone.id} value={zone.id}>{zone.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">FAT</label>
                  <select 
                    value={String(newSubscriberFat || '')}
                    onChange={(e) => setNewSubscriberFat(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                    disabled={!newSubscriberZone}
                  >
                    <option value="">اختر FAT...</option>
                    {fats.filter(f => String(f.zoneId ?? f.zone_id) === String(newSubscriberZone)).map(fat => (
                      <option key={fat.id} value={fat.id}>{fat.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الموقع الجغرافي (إحداثيات جوجل ماب)</label>
                <div className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      value={newSubscriberLocation}
                      onChange={(e) => setNewSubscriberLocation(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                      dir="ltr" 
                      placeholder="مثال: 32.467278, 46.689583" 
                    />
                  </div>
                  <button 
                    onClick={() => {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            setNewSubscriberLocation(`${position.coords.latitude}, ${position.coords.longitude}`);
                          },
                          (error) => {
                            console.error("Error getting location:", error);
                            alert("تعذر الحصول على الموقع الحالي. يرجى التأكد من تفعيل خدمات الموقع.");
                          }
                        );
                      } else {
                        alert("متصفحك لا يدعم تحديد الموقع الجغرافي.");
                      }
                    }}
                    className="bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-500 transition-colors flex items-center gap-2 border border-slate-200 dark:border-slate-600" 
                    title="تحديد الموقع الحالي"
                  >
                    <Navigation size={16} />
                  </button>
                </div>
                <div className="h-48 w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 z-0 relative mb-1">
                  <MapContainer 
                    center={parseCoordinates(newSubscriberLocation) || [32.467278, 46.689583]} 
                    zoom={14} 
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapControls />
                    <MapClickHandler onLocationSelect={(lat, lng) => setNewSubscriberLocation(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)} />
                    {parseCoordinates(newSubscriberLocation) && (
                      <Marker position={parseCoordinates(newSubscriberLocation) as L.LatLngExpression} />
                    )}
                  </MapContainer>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">يمكنك لصق الإحداثيات، أو النقر على الخريطة لتحديد الموقع، أو استخدام زر الموقع الحالي.</p>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50 shrink-0">
              <button type="button" onClick={() => setIsEditSubscriberOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">إلغاء</button>
              <button type="button" onClick={handleEditSubscriber} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">حفظ التعديلات</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {isAddCategoryOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">إضافة فئة جديدة</h3>
              <button type="button" onClick={() => setIsAddCategoryOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">نوع الاشتراك</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-200">
                    <input type="radio" name="catType" checked={newCategoryType === 'ftth'} onChange={() => setNewCategoryType('ftth')} className="rounded" />
                    <span>FTTH</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-200">
                    <input type="radio" name="catType" checked={newCategoryType === 'wireless'} onChange={() => setNewCategoryType('wireless')} className="rounded" />
                    <span>Wireless</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">اسم الفئة</label>
                <input 
                  type="text" 
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="مثال: اشتراك سوبر" 
                />
              </div>
              {newCategoryType === 'ftth' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">السعر (د.ع)</label>
                  <input 
                    type="number" 
                    value={newCategoryPrice}
                    onChange={(e) => setNewCategoryPrice(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                    dir="ltr" 
                    placeholder="0" 
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">سعر التكلفة (د.ع)</label>
                    <input 
                      type="number" 
                      value={newCategoryCostPrice}
                      onChange={(e) => setNewCategoryCostPrice(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                      dir="ltr" 
                      placeholder="0" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">سعر البيع (د.ع)</label>
                    <input 
                      type="number" 
                      value={newCategoryPrice}
                      onChange={(e) => setNewCategoryPrice(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                      dir="ltr" 
                      placeholder="0" 
                    />
                    {newCategoryCostPrice && newCategoryPrice && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">الربح: {(parseFloat(newCategoryPrice) - parseFloat(newCategoryCostPrice)).toLocaleString()} د.ع</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button type="button" onClick={() => setIsAddCategoryOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button type="button" onClick={handleAddCategory} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">حفظ الفئة</button>
            </div>
          </div>
        </div>
      )}

      {/* Subscriber Details Modal */}
      {isSubscriberDetailsOpen && selectedSubscriber && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-row justify-between items-center bg-slate-50 dark:bg-slate-700/50 gap-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 min-w-0">
                <Users size={20} className="text-indigo-600 shrink-0" />
                <span className="truncate">
                  تفاصيل المشترك: {selectedSubscriber.realName ?? selectedSubscriber.real_name}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsSubscriberDetailsOpen(false);
                  setSubscriberDetailError(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 shrink-0"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {subscriberDetailError && (
                <div
                  className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-800 dark:text-rose-200"
                  role="alert"
                >
                  {subscriberDetailError}
                </div>
              )}
              {subscriberDetailLoading && (
                <p className="text-sm text-slate-500 dark:text-slate-400">جاري تحديث بيانات المشترك من الخادم…</p>
              )}
              {(selectedSubscriber.subscriptionType ?? selectedSubscriber.subscription_type ?? 'ftth')
                  .toLowerCase()
                  .trim() !== 'wireless' && (subscriberFtthDetailUrl || showFtthPortalTab) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {subscriberFtthDetailUrl && (
                      <a
                        href={subscriberFtthDetailUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-500"
                        title="يفتح في تبويب جديد"
                      >
                        <ExternalLink size={14} />
                        فتح صفحة FTTH
                      </a>
                    )}
                    {showFtthPortalTab && (
                      <button
                        type="button"
                        onClick={() => handleFtthSyncSubscriber(selectedSubscriber.id)}
                        disabled={ftthSyncingId === selectedSubscriber.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
                        title="تحديث بيانات المشترك من بوابة FTTH"
                      >
                        <RefreshCcw size={14} className={ftthSyncingId === selectedSubscriber.id ? 'animate-spin' : ''} />
                        {ftthSyncingId === selectedSubscriber.id ? 'جاري المزامنة...' : 'مزامنة من البوابة'}
                      </button>
                    )}
                  </div>
                )}
              {/* Personal Info */}
              <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                  المعلومات الشخصية
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 border-b border-slate-100 pb-1">الاسم الحقيقي</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {(selectedSubscriber.realName ?? selectedSubscriber.real_name ?? '').toString().trim() || '— (يُكمل من التعديل)'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 border-b border-slate-100 pb-1">الاسم في البطاقة الوطنية</span>
                    <span className="text-sm font-semibold text-slate-800">{selectedSubscriber.nationalIdName}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 border-b border-slate-100 pb-1">رقم الهاتف</span>
                    <span className="text-sm font-semibold text-slate-800 font-mono" dir="ltr">{selectedSubscriber.phone}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 border-b border-slate-100 pb-1">الحالة</span>
                    <div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold ${
                        subscriberDisplayStatus(selectedSubscriber.expirationDate) === 'منتهي' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                      }`}>
                        {subscriberDisplayStatus(selectedSubscriber.expirationDate)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Subscription Info */}
              <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                  تفاصيل الاشتراك
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 border-b border-slate-100 pb-1">نوعية الاشتراك</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium w-fit ${(selectedSubscriber.subscriptionType ?? selectedSubscriber.subscription_type ?? 'ftth').toLowerCase() === 'wireless' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                      {(selectedSubscriber.subscriptionType ?? selectedSubscriber.subscription_type ?? 'FTTH').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 border-b border-slate-100 pb-1">فئة الاشتراك</span>
                    <span className="text-sm font-semibold text-slate-800">{selectedSubscriber.category}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 border-b border-slate-100 pb-1">سعر الاشتراك</span>
                    <span className="text-base font-bold text-indigo-600" dir="ltr">{Number(selectedSubscriber.categoryPrice ?? 0).toLocaleString()} د.ع</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 border-b border-slate-100 pb-1">تاريخ الاشتراك</span>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                      <Calendar size={14} className="text-slate-400" />
                      {formatDateDDMMYYYY(selectedSubscriber.subscriptionDate ?? selectedSubscriber.subscription_date) ||
                        selectedSubscriber.subscriptionDate ||
                        selectedSubscriber.subscription_date ||
                        '—'}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 border-b border-slate-100 pb-1">تاريخ الانتهاء</span>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                          <Calendar size={14} className="text-slate-400" />
                          {formatDateDDMMYYYY(selectedSubscriber.expirationDate ?? selectedSubscriber.expiration_date) ||
                            selectedSubscriber.expirationDate ||
                            selectedSubscriber.expiration_date ||
                            '—'}
                        </div>
                        <span className={`text-xs font-bold ${
                          (() => {
                            const r = remainingCalendarDaysUntil(selectedSubscriber.expirationDate ?? selectedSubscriber.expiration_date);
                            if (r === null || r < 0) return 'text-rose-600';
                            if (r <= 5) return 'text-amber-600';
                            return 'text-emerald-600';
                          })()
                        }`}>
                          (
                          {formatRemainingDaysLabel(selectedSubscriber.expirationDate ?? selectedSubscriber.expiration_date)}
                          )
                        </span>
                      </div>
                      <button 
                        onClick={() => handleRenewSubscriptionClick(selectedSubscriber.id)}
                        className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold hover:bg-indigo-200 transition-colors shadow-sm"
                      >
                        تجديد الاشتراك
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location Info */}
              <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                  الموقع الجغرافي
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8 mb-4">
                  <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 border-b border-slate-100 pb-1">المنطقة</span>
                    <span className="text-sm font-semibold text-slate-800">{selectedSubscriber.zone}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 border-b border-slate-100 pb-1">FAT</span>
                    <span className="text-sm font-semibold text-slate-800">{selectedSubscriber.fat}</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mb-3 bg-white p-2 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-indigo-600" />
                    <span className="text-xs font-mono text-slate-600" dir="ltr">{selectedSubscriber.location}</span>
                  </div>
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedSubscriber.location}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-1 rounded transition-colors"
                  >
                    خرائط جوجل
                  </a>
                </div>

                {parseCoordinates(selectedSubscriber.location) && (
                  <div className="h-48 w-full rounded-lg overflow-hidden border border-slate-200 z-0 relative">
                  <MapContainer 
                    center={parseCoordinates(selectedSubscriber.location) as L.LatLngExpression} 
                    zoom={16} 
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapControls />
                    <Marker position={parseCoordinates(selectedSubscriber.location) as L.LatLngExpression} icon={createSubscriberIcon(subscriberDisplayStatus(selectedSubscriber.expirationDate), zones.find(z => z.name === selectedSubscriber.zone)?.id || 0)}>
                        <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                          <div className="font-bold text-sm">{selectedSubscriber.realName ?? selectedSubscriber.real_name}</div>
                          <div className="text-xs text-slate-500">{selectedSubscriber.zone} / {selectedSubscriber.fat}</div>
                        </Tooltip>
                      </Marker>
                    </MapContainer>
                  </div>
                )}
              </div>

              {/* Financial Info — إجمالي + حالي/سابق + تفاصيل */}
              <div className="bg-rose-50 dark:bg-rose-950/30 p-4 rounded-xl border border-rose-100 dark:border-rose-900/50 space-y-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                  <div className="flex items-center gap-2">
                    <Wallet size={18} className="text-rose-600 dark:text-rose-400" />
                    <span className="text-sm font-bold text-rose-800 dark:text-rose-200">الديون</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewDebtFormDate(formatLocalDate(startOfLocalDay(new Date())));
                          setNewDebtFormAmount('');
                          setNewDebtFormDesc('');
                          setNewDebtFormScope('current');
                          setIsDebtManageOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                      >
                        <ClipboardList size={14} />
                        إدارة الدين
                      </button>
                    )}
                    {Number(selectedSubscriber.debt ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayDebtAmount(Number(selectedSubscriber.debt ?? 0));
                          setIsPayDebtOpen(true);
                        }}
                        className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        تسديد الديون
                      </button>
                    )}
                  </div>
                </div>

                {subscriberDebtSummaryLoading && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">جاري تحميل تفاصيل الديون…</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-white/80 dark:bg-slate-900/40 border border-rose-100 dark:border-rose-900/40 p-3">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">إجمالي الدين</div>
                    <div className="text-lg font-black text-rose-600 dark:text-rose-300" dir="ltr">
                      {Number(
                        subscriberDebtSummary?.totalDebt ?? selectedSubscriber.debt ?? 0,
                      ).toLocaleString()}{' '}
                      د.ع
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/80 dark:bg-slate-900/40 border border-emerald-100 dark:border-emerald-900/40 p-3">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">الدين الحالي</div>
                    <div className="text-lg font-black text-emerald-700 dark:text-emerald-300" dir="ltr">
                      {Number(subscriberDebtSummary?.currentDebt ?? 0).toLocaleString()} د.ع
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/80 dark:bg-slate-900/40 border border-amber-100 dark:border-amber-900/40 p-3">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">الديون السابقة</div>
                    <div className="text-lg font-black text-amber-800 dark:text-amber-200" dir="ltr">
                      {Number(subscriberDebtSummary?.previousDebt ?? 0).toLocaleString()} د.ع
                    </div>
                  </div>
                </div>

                {subscriberDebtSummary && !subscriberDebtSummary.entriesSynced && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-2 py-1.5">
                    تنبيه: مجموع تفاصيل الديون لا يطابق إجمالي الحقل المخزّن. قد تحتاج مزامنة أو مراجعة يدوية.
                  </p>
                )}

                {subscriberDebtSummary && subscriberDebtSummary.entries.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-rose-100 dark:border-rose-900/50 bg-white/90 dark:bg-slate-900/50">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-rose-100/80 dark:bg-rose-950/50 text-rose-900 dark:text-rose-100">
                          <th className="px-3 py-2 text-right font-bold">المبلغ</th>
                          <th className="px-3 py-2 text-right font-bold">المتبقي</th>
                          <th className="px-3 py-2 text-right font-bold">التاريخ</th>
                          <th className="px-3 py-2 text-right font-bold">النوع</th>
                          <th className="px-3 py-2 text-right font-bold">التفاصيل</th>
                          {isAdmin && <th className="px-3 py-2 text-center font-bold w-24">إجراء</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {subscriberDebtSummary.entries.map((row) => (
                          <React.Fragment key={row.id}>
                          <tr
                            className="border-t border-rose-50 dark:border-slate-700/80 text-slate-800 dark:text-slate-100"
                          >
                            <td className="px-3 py-2 font-mono" dir="ltr">
                              {Number(row.amount).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-rose-600 dark:text-rose-300" dir="ltr">
                              {Number(row.remainingAmount).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap" dir="ltr">
                              {row.debtDate ? row.debtDate.slice(0, 10) : '—'}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                  row.debtScope === 'previous'
                                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100'
                                    : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100'
                                }`}
                              >
                                {row.debtScope === 'previous' ? 'سابق' : 'حالي'}
                              </span>
                            </td>
                            <td className="px-3 py-2 max-w-[14rem] truncate" title={row.description}>
                              {row.description || '—'}
                            </td>
                            {isAdmin && (
                              <td className="px-3 py-2 text-center">
                                <div className="flex flex-col gap-1 items-center">
                                  {row.debtScope === 'current' && Number(row.remainingAmount) > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRollDebtEntry(row.id)}
                                      className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                    >
                                      ترحيل لسابق
                                    </button>
                                  )}
                                  {Number(row.remainingAmount) > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (settleEntryId === row.id) {
                                          setSettleEntryId(null);
                                        } else {
                                          setSettleEntryId(row.id);
                                          setSettleAmount(String(row.remainingAmount));
                                          setSettleDate(new Date().toISOString().split('T')[0]);
                                          setSettleDesc('');
                                        }
                                      }}
                                      className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                                    >
                                      {settleEntryId === row.id ? 'إلغاء' : 'تسديد'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                          {isAdmin && settleEntryId === row.id && (
                            <tr className="bg-emerald-50 dark:bg-emerald-950/30">
                              <td colSpan={6} className="px-3 py-3">
                                <div className="flex flex-wrap gap-2 items-end">
                                  <div className="flex flex-col gap-0.5">
                                    <label className="text-[10px] text-slate-500 font-medium">المبلغ المسدَّد</label>
                                    <input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      dir="ltr"
                                      value={settleAmount}
                                      onChange={e => setSettleAmount(e.target.value)}
                                      className="w-28 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <label className="text-[10px] text-slate-500 font-medium">تاريخ السداد</label>
                                    <input
                                      type="date"
                                      dir="ltr"
                                      value={settleDate}
                                      onChange={e => setSettleDate(e.target.value)}
                                      className="border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-0.5 flex-1 min-w-[8rem]">
                                    <label className="text-[10px] text-slate-500 font-medium">ملاحظة (اختياري)</label>
                                    <input
                                      type="text"
                                      value={settleDesc}
                                      onChange={e => setSettleDesc(e.target.value)}
                                      placeholder="تسديد دين"
                                      className="border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    disabled={settleSubmitting}
                                    onClick={handleSettleEntry}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    {settleSubmitting ? 'جاري...' : 'تأكيد التسديد'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* History Info */}
              <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                    سجل الحركات (الاشتراكات والديون)
                  </h4>
                  <button 
                    onClick={() => {
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html dir="rtl">
                            <head>
                              <title>سجل المشترك - ${selectedSubscriber.realName ?? selectedSubscriber.real_name}</title>
                              <style>
                                body { font-family: Arial, sans-serif; padding: 20px; }
                                h1 { font-size: 24px; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
                                .info { margin-bottom: 20px; }
                                .info p { margin: 5px 0; font-size: 14px; }
                                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                                th, td { border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 14px; }
                                th { background-color: #f5f5f5; }
                              </style>
                            </head>
                            <body>
                              <h1>سجل المشترك</h1>
                              <div class="info">
                                <p><strong>الاسم:</strong> ${selectedSubscriber.realName ?? selectedSubscriber.real_name}</p>
                                <p><strong>رقم الهاتف:</strong> ${selectedSubscriber.phone}</p>
                                <p><strong>المنطقة:</strong> ${selectedSubscriber.zone}</p>
                                <p><strong>الفئة:</strong> ${selectedSubscriber.category}</p>
                                <p><strong>إجمالي الدين:</strong> ${Number(selectedSubscriber.debt ?? 0).toLocaleString()} د.ع</p>
                                ${
                                  subscriberDebtSummary
                                    ? `<p><strong>الدين الحالي (تفاصيل):</strong> ${Number(subscriberDebtSummary.currentDebt).toLocaleString()} د.ع — <strong>الديون السابقة:</strong> ${Number(subscriberDebtSummary.previousDebt).toLocaleString()} د.ع</p>`
                                    : ''
                                }
                              </div>
                              ${
                                subscriberDebtSummary && subscriberDebtSummary.entries.length > 0
                                  ? `
                              <h2>تفاصيل الديون</h2>
                              <table>
                                <thead>
                                  <tr>
                                    <th>المبلغ</th>
                                    <th>المتبقي</th>
                                    <th>التاريخ</th>
                                    <th>النوع</th>
                                    <th>التفاصيل</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${subscriberDebtSummary.entries
                                    .map(
                                      (row) => `
                                    <tr>
                                      <td>${Number(row.amount).toLocaleString()}</td>
                                      <td>${Number(row.remainingAmount).toLocaleString()}</td>
                                      <td>${row.debtDate ? String(row.debtDate).slice(0, 10) : '—'}</td>
                                      <td>${row.debtScope === 'previous' ? 'سابق' : 'حالي'}</td>
                                      <td>${(row.description || '—').replace(/</g, '&lt;')}</td>
                                    </tr>`,
                                    )
                                    .join('')}
                                </tbody>
                              </table>
                              `
                                  : ''
                              }
                              <h2>سجل الحركات</h2>
                              <table>
                                <thead>
                                  <tr>
                                    <th>التاريخ</th>
                                    <th>نوع الحركة</th>
                                    <th>المبلغ (د.ع)</th>
                                    <th>التفاصيل</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${selectedSubscriber.history?.map((h: SubscriberHistoryRow) => `
                                    <tr>
                                      <td>${h.date}</td>
                                      <td>${h.type}</td>
                                      <td>${Number(h.amount ?? 0).toLocaleString()}</td>
                                      <td>${h.description}</td>
                                    </tr>
                                  `).join('') || '<tr><td colspan="4" style="text-align: center;">لا توجد حركات مسجلة</td></tr>'}
                                </tbody>
                              </table>
                              <script>
                                window.onload = () => { window.print(); window.close(); }
                              </script>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                      }
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                  >
                    <Download size={14} /> طباعة السجل (PDF)
                  </button>
                </div>
                
                {selectedSubscriber.history && selectedSubscriber.history.length > 0 ? (
                  <div className="space-y-3">
                    {selectedSubscriber.history.map((record: SubscriberHistoryRow) => (
                      <div key={record.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              record.type === 'تسديد ديون' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                              record.type === 'تجديد اشتراك بالآجل' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' :
                              record.type === 'تجديد اشتراك' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' :
                              record.type === 'شراء مواد بالآجل' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                              'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            }`}>
                              {record.type}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">{record.date}</span>
                          </div>
                          <span className="text-sm font-bold text-slate-800" dir="ltr">{Number(record.amount ?? 0).toLocaleString()} د.ع</span>
                        </div>
                        <p className="text-xs text-slate-600">{record.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    لا توجد حركات مسجلة لهذا المشترك
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50">
              {isAdmin ? (
                <button 
                  onClick={() => handleDeleteSubscriber(selectedSubscriber.id)} 
                  className="px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 border border-rose-100 rounded-lg hover:bg-rose-100 transition-colors flex items-center gap-2"
                >
                  <Trash2 size={16} /> حذف المشترك
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSubscriberDetailsOpen(false);
                    setSubscriberDetailError(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500"
                >
                  إغلاق
                </button>
                {isAdmin && (
                  <button onClick={() => openEditSubscriber(selectedSubscriber)} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-2">
                    <Edit size={16} /> تعديل البيانات
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* إدارة الدين — إضافة سجل تفصيلي */}
      {isDebtManageOpen && selectedSubscriber && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-[65] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 shrink-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ClipboardList size={20} className="text-indigo-600 dark:text-indigo-400" />
                إضافة دين تفصيلي
              </h3>
              <button
                type="button"
                onClick={() => setIsDebtManageOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                يُسجّل المبلغ كسطر مستقل ويُضاف إلى إجمالي دين المشترك. لن يُستبدل السجل القديم.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">المبلغ (د.ع)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={newDebtFormAmount}
                  onChange={(e) => setNewDebtFormAmount(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                  dir="ltr"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">تاريخ الدين</label>
                <input
                  type="date"
                  value={newDebtFormDate}
                  onChange={(e) => setNewDebtFormDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">التفاصيل / البيان</label>
                <textarea
                  value={newDebtFormDesc}
                  onChange={(e) => setNewDebtFormDesc(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                  placeholder="مثال: تأخر سداد، رسوم إضافية، اتفاق…"
                />
              </div>
              <div>
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">تصنيف الدين</span>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="debtScope"
                      checked={newDebtFormScope === 'current'}
                      onChange={() => setNewDebtFormScope('current')}
                    />
                    دين حالي
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="debtScope"
                      checked={newDebtFormScope === 'previous'}
                      onChange={() => setNewDebtFormScope('previous')}
                    />
                    دين سابق
                  </label>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50 shrink-0">
              <button
                type="button"
                onClick={() => setIsDebtManageOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={newDebtSubmitting}
                onClick={() => void handleDebtFormSubmit()}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {newDebtSubmitting ? 'جاري الحفظ…' : 'حفظ الدين'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Debt Modal */}
      {isPayDebtOpen && selectedSubscriber && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">تسديد الديون</h3>
              <button type="button" onClick={() => setIsPayDebtOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSettleDebt(); }}>
            <div className="p-4 space-y-4">
              <div className="bg-rose-50 p-3 rounded-lg border border-rose-100 flex justify-between items-center">
                <span className="text-sm font-bold text-rose-800">إجمالي الدين:</span>
                <span className="text-lg font-black text-rose-600" dir="ltr">
                  {Number(selectedSubscriber.debt ?? 0).toLocaleString()} د.ع
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">المبلغ المراد تسديده (د.ع)</label>
                <input
                  type="number"
                  value={payDebtAmount}
                  onChange={(e) => setPayDebtAmount(Number(e.target.value))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                  dir="ltr"
                  min="1"
                  max={selectedSubscriber.debt}
                  disabled={payDebtSubmitting}
                />
              </div>
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 flex justify-between items-center">
                <span className="text-sm font-bold text-emerald-800">المتبقي بعد التسديد:</span>
                <span className="text-lg font-black text-emerald-600" dir="ltr">
                  {Math.max(0, selectedSubscriber.debt - payDebtAmount).toLocaleString()} د.ع
                </span>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button type="button" onClick={() => setIsPayDebtOpen(false)} disabled={payDebtSubmitting} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed">إلغاء</button>
              <button
                type="submit"
                disabled={payDebtSubmitting || payDebtAmount <= 0 || payDebtAmount > selectedSubscriber.debt}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {payDebtSubmitting ? 'جاري التسديد...' : 'تأكيد التسديد'}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
