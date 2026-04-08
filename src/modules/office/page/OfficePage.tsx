import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext, type OfficeMaterial as CtxOfficeMaterial, type OfficeSale } from '@/context/AppContext';
import { canAction } from '@/utils/permissions';
import { materialsApi } from '@/api/materials';
import { ApiRequestError } from '@/api/client';
import { IRAQ_PHONE_HINT_AR, requireIraqMobile } from '@/utils/iraqPhone';
import {
  OfficeTabBar,
  QuickSaleTab,
  InventoryTab,
  CustomersTab,
  InvoicesTab,
  DebtsTab,
  ReportsTab,
  LinesTab,
  OfficeAlertsTab,
  AddMaterialModal,
  EditMaterialModal,
  InvoiceModal,
  CustomerModal,
  printCustomerReport,
  printInvoice,
} from './components';
import type { OfficeTab, OfficeMaterial, OfficeCustomer, Invoice, InvoiceItem } from './components';

export default function OfficePage() {
  const app = useAppContext?.();
  const canOffice = (action: string) => canAction(app?.currentUser, 'office', action);
  const [search, setSearch] = useState('');
  const [customersSearch, setCustomersSearch] = useState('');
  const [tab, setTab] = useState<OfficeTab>('quick_sale');

  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [materialName, setMaterialName] = useState('');
  const [materialPurchasePrice, setMaterialPurchasePrice] = useState('');
  const [materialSellingPrice, setMaterialSellingPrice] = useState('');
  const [materialQty, setMaterialQty] = useState('');
  const [isEditMaterialOpen, setIsEditMaterialOpen] = useState(false);
  const [editMaterialId, setEditMaterialId] = useState<number | null>(null);

  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [invoiceCustomerName, setInvoiceCustomerName] = useState('');
  const [invoiceCustomerPhone, setInvoiceCustomerPhone] = useState('');
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<'cash' | 'debt'>('cash');
  const [invoicePaidAmount, setInvoicePaidAmount] = useState('0');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    { materialId: '', materialName: '', quantity: 1, sellingPrice: 0 },
  ]);
  const [lastCreatedInvoice, setLastCreatedInvoice] = useState<Invoice | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [invoiceCustomerId, setInvoiceCustomerId] = useState<number | ''>('');
  const [customerNameFocused, setCustomerNameFocused] = useState(false);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const savingInvoiceRef = useRef(false);

  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<OfficeCustomer | null>(null);
  const [customerHistory, setCustomerHistory] = useState<unknown[]>([]);
  const [customerSales, setCustomerSales] = useState<unknown[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<unknown[]>([]);
  const [customerInstallments, setCustomerInstallments] = useState<unknown[]>([]);
  const [payDebtAmount, setPayDebtAmount] = useState('');

  const [officeSummary, setOfficeSummary] = useState<{ totalSales?: number; totalRevenue?: number; totalProfit?: number; totalCollected?: number; office?: { sales?: number; revenue?: number; profit?: number; sectionId?: number }; lines?: { sales?: number; revenue?: number; profit?: number; sectionId?: number } } | null>(null);

  const [salePayment, setSalePayment] = useState<'cash' | 'debt' | 'installments'>('cash');
  const [saleCustomerName, setSaleCustomerName] = useState('');
  const [saleCustomerPhone, setSaleCustomerPhone] = useState('');
  const [salePurchaseDate, setSalePurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleCommissionPercent, setSaleCommissionPercent] = useState('0');
  const [saleMonths, setSaleMonths] = useState<number>(3);
  const [cartItems, setCartItems] = useState<Array<{ materialId: number; quantity: number }>>([]);

  const officeMaterials = useMemo(() => {
    const list = (app?.officeMaterials ?? []) as OfficeMaterial[];
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter((item) =>
          [item?.name, item?.category, item?.barcode, item?.description]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        );
    return [...filtered].sort((a, b) => {
      const qa = Number(a?.quantity ?? 0);
      const qb = Number(b?.quantity ?? 0);
      const aIn = qa > 0;
      const bIn = qb > 0;
      if (aIn !== bIn) return aIn ? -1 : 1;
      if (aIn && bIn && qb !== qa) return qb - qa;
      const na = String(a?.name ?? '');
      const nb = String(b?.name ?? '');
      const c = na.localeCompare(nb, 'ar', { sensitivity: 'base' });
      if (c !== 0) return c;
      return Number(a?.id ?? 0) - Number(b?.id ?? 0);
    });
  }, [app, search]);

  const materialsWithStock = useMemo(() => officeMaterials.filter((m) => Number(m?.quantity ?? 0) > 0), [officeMaterials]);

  const cartCalc = useMemo(() => {
    const materials = (app?.officeMaterials ?? []) as OfficeMaterial[];
    const rows = (cartItems ?? []).map((ci) => {
      const m = materials.find((x) => Number(x.id) === Number(ci.materialId));
      const selling = Number(m?.sellingPrice ?? m?.selling_price ?? 0);
      const purchase = Number(m?.purchasePrice ?? m?.purchase_price ?? 0);
      const qty = Math.max(1, Number(ci.quantity || 1));
      const lineTotal = selling * qty;
      const lineProfit = (selling - purchase) * qty;
      return {
        materialId: ci.materialId,
        name: m?.name ?? '-',
        available: Number(m?.quantity ?? 0),
        qty,
        selling,
        purchase,
        lineTotal,
        lineProfit,
      };
    });
    const baseTotal = rows.reduce((s, r) => s + Number(r.lineTotal || 0), 0);
    const profit = rows.reduce((s, r) => s + Number(r.lineProfit || 0), 0);
    const commissionPct = Math.max(0, Number(saleCommissionPercent || 0));
    const totalWithCommission = baseTotal + (baseTotal * commissionPct) / 100;
    const months = Math.max(1, Number(saleMonths || 1));
    const monthly = totalWithCommission / months;
    return { rows, baseTotal, profit, commissionPct, totalWithCommission, months, monthly };
  }, [app, cartItems, saleCommissionPercent, saleMonths]);

  const customers = (app?.officeCustomers ?? []) as OfficeCustomer[];
  const customersWithDebt = useMemo(() => customers.filter((c) => Number(c?.debt ?? 0) > 0), [customers]);
  const sales = app?.officeSales ?? [];

  const filteredCustomers = useMemo(() => {
    if (!customersSearch.trim()) return customers;
    const q = customersSearch.trim().toLowerCase();
    return customers.filter((c) => [c?.name, c?.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [customers, customersSearch]);

  const invoiceCustomerSuggestions = useMemo(() => {
    if (!invoiceCustomerName.trim()) return customers.slice(0, 8);
    const q = invoiceCustomerName.trim().toLowerCase();
    return customers.filter((c) => [c?.name, c?.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))).slice(0, 8);
  }, [customers, invoiceCustomerName]);

  const openCustomerModal = async (c: OfficeCustomer) => {
    setSelectedCustomer(c);
    setPayDebtAmount('');
    setCustomerHistory([]);
    setCustomerSales([]);
    setCustomerInvoices([]);
    setCustomerInstallments([]);
    setIsCustomerOpen(true);
    const [h, s, invs, inst] = await Promise.all([
      materialsApi.getCustomerHistory(c.id).catch(() => []),
      materialsApi.getCustomerSales(c.id).catch(() => []),
      materialsApi.getInvoices({ customerId: c.id }).catch(() => []),
      materialsApi.getCustomerInstallments(c.id).catch(() => []),
    ]);
    setCustomerHistory(Array.isArray(h) ? h : []);
    setCustomerSales(Array.isArray(s) ? s : []);
    setCustomerInvoices(Array.isArray(invs) ? invs : []);
    setCustomerInstallments(Array.isArray(inst) ? inst : []);
  };

  const refreshCustomers = async () => {
    const nextCustomers = await materialsApi.getCustomers().catch(() => []);
    app?.setOfficeCustomers?.(Array.isArray(nextCustomers) ? nextCustomers : []);
  };

  const refreshSelectedCustomer = async (customerId: number) => {
    const nextCustomers = await materialsApi.getCustomers().catch(() => []);
    const list = Array.isArray(nextCustomers) ? nextCustomers : [];
    app?.setOfficeCustomers?.(list);
    const next = list.find((x: OfficeCustomer) => Number(x?.id) === Number(customerId));
    if (next) setSelectedCustomer(next);
  };

  const refreshOfficeSummary = async () => {
    const s = await materialsApi.getReportsSummary().catch(() => null);
    setOfficeSummary(s && typeof s === 'object' ? s : null);
  };

  useEffect(() => {
    if (tab === 'reports') refreshOfficeSummary();
    if (tab === 'invoices') loadInvoices();
    if (tab === 'debts') refreshCustomers();
  }, [tab]);

  /** إعادة جلب المواد عند فتح البيع السريع إذا كانت القائمة فارغة (فشل تحميل أولي أو جلسة جديدة). */
  useEffect(() => {
    if (tab !== 'quick_sale' || !app?.currentUser) return;
    if ((app?.officeMaterials?.length ?? 0) > 0) return;
    void materialsApi
      .getAll()
      .then((m) => {
        if (!Array.isArray(m)) return;
        app.setOfficeMaterials?.(
          m.map((raw: any) => ({
            id: raw.id,
            name: raw.name,
            purchasePrice: Number(raw.purchasePrice ?? raw.purchase_price ?? 0),
            sellingPrice: Number(raw.sellingPrice ?? raw.selling_price ?? 0),
            quantity: Number(raw.quantity ?? 0),
            purchase_price: raw.purchase_price,
            selling_price: raw.selling_price,
          })) as CtxOfficeMaterial[],
        );
      })
      .catch(() => {});
  }, [tab, app?.currentUser, app?.officeMaterials?.length, app?.setOfficeMaterials]);

  const invoiceCalc = useMemo(() => {
    const items = (invoiceItems ?? []).map((it) => {
      const qty = Math.max(1, Number(it?.quantity ?? 1));
      const price = Math.max(0, Number(it?.sellingPrice ?? 0));
      const total = qty * price;
      return { ...it, quantity: qty, sellingPrice: price, lineTotal: total };
    });
    const totalAmount = items.reduce((s, x) => s + Number(x?.lineTotal ?? 0), 0);
    let paid = Math.max(0, Number(invoicePaidAmount || 0));
    if (paid > totalAmount) paid = totalAmount;
    const remaining = Math.max(0, totalAmount - paid);
    const status: 'paid' | 'partial' | 'unpaid' =
      remaining === 0 && totalAmount > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    return { items, totalAmount, paidAmount: paid, remaining, status };
  }, [invoiceItems, invoicePaidAmount]);

  const openInvoiceModal = () => {
    setLastCreatedInvoice(null);
    setInvoiceCustomerName('');
    setInvoiceCustomerPhone('');
    setInvoiceCustomerId('');
    setInvoicePaymentMethod('cash');
    setInvoicePaidAmount('0');
    setInvoiceNotes('');
    setInvoiceItems([{ materialId: '', materialName: '', quantity: 1, sellingPrice: 0 }]);
    setIsSavingInvoice(false);
    savingInvoiceRef.current = false;
    setIsInvoiceOpen(true);
  };

  const loadInvoices = async () => {
    const params: { q?: string; status?: string; dateFrom?: string; dateTo?: string } = {};
    if (invoiceSearch.trim()) params.q = invoiceSearch.trim();
    if (invoiceStatusFilter) params.status = invoiceStatusFilter;
    if (invoiceDateFrom) params.dateFrom = invoiceDateFrom;
    if (invoiceDateTo) params.dateTo = invoiceDateTo;
    const list = await materialsApi.getInvoices(params).catch(() => []);
    setInvoices(Array.isArray(list) ? list : []);
  };

  const handleDeleteInvoice = async (inv: Invoice) => {
    if (!confirm(`هل تريد حذف الفاتورة ${inv?.invoiceNo ?? inv?.invoice_no ?? inv?.id}؟ الحذف لغرض التنظيم فقط ولن يؤثر على المخزون أو دين الزبون.`)) return;
    try {
      const invNo = inv?.invoiceNo ?? inv?.invoice_no ?? inv?.id;
      await materialsApi.deleteInvoice(inv.id);
      setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
      app?.addNotification?.('حذف فاتورة', `تم حذف الفاتورة ${invNo} من السجل`, 'info');
      app?.logActivity?.('office', 'delete_invoice', `حذف فاتورة ${invNo}`);
    } catch (e: unknown) {
      const err = e as { message?: string };
      alert(err?.message ?? 'فشل حذف الفاتورة');
    }
  };

  const handlePrintCustomerReport = async (
    c: OfficeCustomer,
    customerSalesData?: unknown[],
    customerInstallmentsData?: unknown[],
    customerInvoicesData?: unknown[],
    customerHistoryData?: unknown[]
  ) => {
    let sales = customerSalesData ?? [];
    let installments = customerInstallmentsData ?? [];
    let invoices = customerInvoicesData ?? [];
    let history = customerHistoryData ?? [];
    if (c?.id !== selectedCustomer?.id || sales.length === 0) {
      const [h, s, invs, inst] = await Promise.all([
        materialsApi.getCustomerHistory(c.id).catch(() => []),
        materialsApi.getCustomerSales(c.id).catch(() => []),
        materialsApi.getInvoices({ customerId: c.id }).catch(() => []),
        materialsApi.getCustomerInstallments(c.id).catch(() => []),
      ]);
      sales = Array.isArray(s) ? s : [];
      installments = Array.isArray(inst) ? inst : [];
      invoices = Array.isArray(invs) ? invs : [];
      history = Array.isArray(h) ? h : [];
    }
    const ctx = { systemSettings: app?.systemSettings };
    printCustomerReport(c, ctx, sales, installments, invoices, history);
  };

  const handlePrintInvoice: (inv: unknown) => void = (inv) => {
    printInvoice(inv as Invoice, { systemSettings: app?.systemSettings });
  };

  const handleCreateMaterial = async () => {
    if (!materialName.trim()) return;
    const purchase = Number(materialPurchasePrice || 0);
    const selling = Number(materialSellingPrice || 0);
    if (selling > 0 && purchase > 0 && selling < purchase) {
      alert('سعر البيع يجب أن يكون أعلى من سعر الشراء');
      return;
    }
    const payload = {
      name: materialName.trim(),
      purchase_price: Number(materialPurchasePrice || 0),
      selling_price: Number(materialSellingPrice || 0),
      quantity: Number(materialQty || 0),
    };
    const created = (await materialsApi.create(payload)) as unknown as CtxOfficeMaterial;
    app?.setOfficeMaterials?.([created, ...(app?.officeMaterials ?? [])]);
    app?.addNotification?.('إضافة مادة مكتب', `تم إضافة المادة ${materialName.trim()} بكمية ${Number(materialQty || 0)}`, 'info');
    app?.logActivity?.('office', 'add_material', `إضافة مادة ${materialName.trim()} بكمية ${Number(materialQty || 0)}`);
    setMaterialName('');
    setMaterialPurchasePrice('');
    setMaterialSellingPrice('');
    setMaterialQty('');
    setIsAddMaterialOpen(false);
  };

  const handleUpdateMaterial = async () => {
    if (!editMaterialId) return;
    if (!materialName.trim()) return;
    const purchase = Number(materialPurchasePrice || 0);
    const selling = Number(materialSellingPrice || 0);
    if (selling > 0 && purchase > 0 && selling < purchase) {
      alert('سعر البيع يجب أن يكون أعلى من سعر الشراء');
      return;
    }
    const payload = {
      name: materialName.trim(),
      purchase_price: Number(materialPurchasePrice || 0),
      selling_price: Number(materialSellingPrice || 0),
      quantity: Number(materialQty || 0),
    };
    await materialsApi.update(editMaterialId, payload);
    const nextMaterials = await materialsApi.getAll().catch(() => []);
    app?.setOfficeMaterials?.(Array.isArray(nextMaterials) ? nextMaterials : []);
    app?.addNotification?.('تعديل مادة مكتب', `تم تعديل المادة ${materialName.trim()} بنجاح`, 'info');
    app?.logActivity?.('office', 'edit_material', `تعديل مادة ${materialName.trim()}`);
    setIsEditMaterialOpen(false);
    setEditMaterialId(null);
  };

  const handleDeleteMaterial = async (id: number) => {
    const ok = confirm('هل أنت متأكد من حذف هذه المادة؟');
    if (!ok) return;
    const material = (app?.officeMaterials ?? []).find((m: OfficeMaterial) => Number(m.id) === id);
    await materialsApi.delete(id);
    const nextMaterials = await materialsApi.getAll().catch(() => []);
    app?.setOfficeMaterials?.(Array.isArray(nextMaterials) ? nextMaterials : []);
    app?.addNotification?.('حذف مادة مكتب', `تم حذف المادة ${material?.name || ''} من المخزون`, 'info');
    app?.logActivity?.('office', 'delete_material', `حذف مادة ${material?.name || ''}`);
  };

  const handleEditMaterial = (item: OfficeMaterial) => {
    setEditMaterialId(Number(item?.id));
    setMaterialName(String(item?.name ?? ''));
    setMaterialPurchasePrice(String(item?.purchasePrice ?? item?.purchase_price ?? ''));
    setMaterialSellingPrice(String(item?.sellingPrice ?? item?.selling_price ?? ''));
    setMaterialQty(String(item?.quantity ?? ''));
    setIsEditMaterialOpen(true);
  };

  const handleQuickSale = async () => {
    if (cartItems.length === 0) return;
    if (salePayment !== 'cash') {
      if (!saleCustomerName.trim() || !saleCustomerPhone.trim()) return;
    }
    if (cartCalc.rows.some((r) => r.qty > r.available)) return;

    try {
      const payload: Record<string, unknown> = {
        items: cartItems.map((x) => ({ materialId: x.materialId, quantity: x.quantity })),
        paymentMethod: salePayment,
        purchaseDate: salePurchaseDate,
      };
      if (salePayment !== 'cash') {
        let custPhone: string;
        try {
          custPhone = requireIraqMobile(saleCustomerPhone);
        } catch {
          alert(IRAQ_PHONE_HINT_AR);
          return;
        }
        payload.customerName = saleCustomerName.trim();
        payload.customerPhone = custPhone;
      }
      if (salePayment === 'installments') {
        payload.commissionPercent = cartCalc.commissionPct;
        payload.installmentsMonths = cartCalc.months;
      }

      const created = (await materialsApi.createCartSale(payload)) as OfficeSale;
      app?.setOfficeSales?.([created, ...(app?.officeSales ?? [])]);
      const totalLabel = (created as { totalAmount?: number; total_amount?: number })?.totalAmount ?? (created as { total_amount?: number })?.total_amount ?? cartCalc.baseTotal;
      app?.addNotification?.('بيع سريع', `تم إتمام بيع بقيمة ${Number(totalLabel).toLocaleString()} د.ع ${salePayment !== 'cash' ? `للزبون ${saleCustomerName}` : ''}`, 'sale');
      app?.logActivity?.('office', 'quick_sale', `بيع سريع بقيمة ${Number(totalLabel).toLocaleString()} د.ع ${salePayment !== 'cash' ? `للزبون ${saleCustomerName}` : ''}`);

      if (salePayment !== 'cash') {
        const nextCustomers = await materialsApi.getCustomers().catch(() => []);
        app?.setOfficeCustomers?.(Array.isArray(nextCustomers) ? nextCustomers : []);
      }
      const nextMaterials = await materialsApi.getAll().catch(() => []);
      app?.setOfficeMaterials?.(Array.isArray(nextMaterials) ? nextMaterials : []);

      setCartItems([]);
      setSalePayment('cash');
      setSaleCustomerName('');
      setSaleCustomerPhone('');
      setSaleCommissionPercent('0');
      setSaleMonths(3);
      refreshOfficeSummary();
    } catch (e: unknown) {
      const msg =
        e instanceof ApiRequestError
          ? `فشل تأكيد البيع (${e.status}): ${e.message}`
          : `فشل تأكيد البيع: ${String((e as { message?: string })?.message ?? e)}`;
      alert(msg);
    }
  };

  const handleCreateInvoice = async () => {
    if (savingInvoiceRef.current || lastCreatedInvoice) return;
    savingInvoiceRef.current = true;
    const cleanedItems = (invoiceCalc.items ?? [])
      .filter((it) => (it?.materialId || it?.materialName) && Number(it?.quantity ?? 0) > 0)
      .map((it) => {
        const materialId = it?.materialId ? Number(it.materialId) : undefined;
        const material = materialId ? (app?.officeMaterials ?? []).find((m: OfficeMaterial) => Number(m.id) === Number(materialId)) : null;
        const materialName = String(it?.materialName || material?.name || '');
        const qty = Math.max(1, Number(it?.quantity ?? 1));
        const sellingPrice = Math.max(0, Number(it?.sellingPrice ?? material?.sellingPrice ?? material?.selling_price ?? 0));
        return {
          materialId,
          materialName,
          quantity: qty,
          sellingPrice,
          totalAmount: qty * sellingPrice,
        };
      });

    if (cleanedItems.length === 0) {
      savingInvoiceRef.current = false;
      return;
    }

    const remaining = Number(invoiceCalc.totalAmount || 0) - Number(invoiceCalc.paidAmount || 0);
    if (invoicePaymentMethod === 'debt' || remaining > 0) {
      if (!invoiceCustomerName.trim() || !invoiceCustomerPhone.trim()) {
        alert('يجب إدخال اسم الزبون ورقم الهاتف لتسجيل المبلغ المتبقي في الديون.');
        savingInvoiceRef.current = false;
        return;
      }
    }

    let invoicePhoneNorm: string | undefined;
    if (invoiceCustomerPhone.trim()) {
      try {
        invoicePhoneNorm = requireIraqMobile(invoiceCustomerPhone);
      } catch {
        alert(IRAQ_PHONE_HINT_AR);
        savingInvoiceRef.current = false;
        return;
      }
    }

    const payload: Record<string, unknown> = {
      officeName: app?.systemSettings?.officeName ?? app?.systemSettings?.office_name ?? 'مكتب الملك',
      customerId: invoiceCustomerId || undefined,
      customerName: invoiceCustomerName.trim() || undefined,
      customerPhone: invoicePhoneNorm,
      paymentMethod: invoicePaymentMethod,
      paidAmount: Number(invoiceCalc.paidAmount || 0),
      notes: invoiceNotes.trim() || undefined,
      items: cleanedItems,
    };

    setIsSavingInvoice(true);
    try {
      const created = await materialsApi.createInvoice(payload) as Invoice;
      setLastCreatedInvoice(created);
      const invNo = created?.invoiceNo ?? created?.invoice_no ?? created?.id ?? '';
      const total = Number(created?.totalAmount ?? created?.total_amount ?? invoiceCalc.totalAmount ?? 0);
      app?.addNotification?.('إنشاء فاتورة', `تم إنشاء الفاتورة ${invNo} بقيمة ${total.toLocaleString()} د.ع للزبون ${invoiceCustomerName.trim() || 'غير محدد'}`, 'info');
      app?.logActivity?.('office', 'create_invoice', `إنشاء فاتورة ${invNo} بقيمة ${total.toLocaleString()} د.ع للزبون ${invoiceCustomerName.trim() || 'غير محدد'}`);

      const [nextMaterials, nextCustomers] = await Promise.all([
        materialsApi.getAll().catch(() => []),
        materialsApi.getCustomers().catch(() => []),
      ]);
      app?.setOfficeMaterials?.(Array.isArray(nextMaterials) ? nextMaterials : []);
      app?.setOfficeCustomers?.(Array.isArray(nextCustomers) ? nextCustomers : []);
      if (tab === 'invoices') loadInvoices();
    } catch (e: unknown) {
      const msg =
        e instanceof ApiRequestError
          ? `فشل حفظ الفاتورة (${e.status}): ${e.message}`
          : `فشل حفظ الفاتورة: ${String((e as { message?: string })?.message ?? e)}`;
      alert(msg);
    } finally {
      setIsSavingInvoice(false);
      savingInvoiceRef.current = false;
    }
  };

  const handlePayDebt = async () => {
    if (!selectedCustomer?.id) return;
    const amount = Number(payDebtAmount || 0);
    await materialsApi.payCustomerDebt(selectedCustomer.id, { amount });
    app?.addNotification?.('تسديد دين', `تم تسديد ${amount.toLocaleString()} د.ع من دين الزبون ${selectedCustomer?.name || ''}`, 'info');
    app?.logActivity?.('office', 'pay_debt', `تسديد ${amount.toLocaleString()} د.ع من دين الزبون ${selectedCustomer?.name || ''}`);
    await refreshSelectedCustomer(selectedCustomer.id);
    const [h, inst, invs] = await Promise.all([
      materialsApi.getCustomerHistory(selectedCustomer.id).catch(() => []),
      materialsApi.getCustomerInstallments(selectedCustomer.id).catch(() => []),
      materialsApi.getInvoices({ customerId: selectedCustomer.id }).catch(() => []),
    ]);
    setCustomerHistory(Array.isArray(h) ? h : []);
    setCustomerInstallments(Array.isArray(inst) ? inst : []);
    setCustomerInvoices(Array.isArray(invs) ? invs : []);
    setPayDebtAmount('');
    refreshOfficeSummary();
  };

  const handlePayInstallment = async (installmentId: number) => {
    await materialsApi.payInstallment(installmentId, {});
    if (!selectedCustomer?.id) return;
    const inst = await materialsApi.getCustomerInstallments(selectedCustomer.id).catch(() => []);
    setCustomerInstallments(Array.isArray(inst) ? inst : []);
    await refreshSelectedCustomer(selectedCustomer.id);
    refreshOfficeSummary();
  };

  const materialsThreshold = Number(app?.systemSettings?.materialsThreshold ?? app?.systemSettings?.materials_threshold ?? 5);
  const officeName = app?.systemSettings?.officeName ?? app?.systemSettings?.office_name ?? 'مكتب الملك';

  return (
    <div className="min-h-[calc(100vh-6rem)] sm:h-[calc(100vh-6rem)] flex flex-col pb-4">
      <div className="shrink-0 space-y-4 sm:space-y-6">
        <div className="px-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">قسم المكتب</h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-1">إدارة مواد المكتب والعملاء والمبيعات والخطوط.</p>
        </div>
        <OfficeTabBar
          tab={tab}
          setTab={setTab}
          customersWithDebtCount={customersWithDebt.length}
          loadInvoices={loadInvoices}
          currentUser={app?.currentUser}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pt-6 space-y-6">
        {tab === 'quick_sale' && (
          <QuickSaleTab
            search={search}
            setSearch={setSearch}
            officeMaterials={officeMaterials}
            cartItems={cartItems}
            setCartItems={setCartItems}
            cartCalc={cartCalc}
            salePayment={salePayment}
            setSalePayment={setSalePayment}
            saleCustomerName={saleCustomerName}
            setSaleCustomerName={setSaleCustomerName}
            saleCustomerPhone={saleCustomerPhone}
            setSaleCustomerPhone={setSaleCustomerPhone}
            salePurchaseDate={salePurchaseDate}
            setSalePurchaseDate={setSalePurchaseDate}
            saleCommissionPercent={saleCommissionPercent}
            setSaleCommissionPercent={setSaleCommissionPercent}
            saleMonths={saleMonths}
            setSaleMonths={setSaleMonths}
            materialsThreshold={materialsThreshold}
            canOffice={canOffice}
            onOpenInvoice={openInvoiceModal}
            onConfirmSale={handleQuickSale}
          />
        )}

        {tab === 'inventory' && (
          <InventoryTab
            search={search}
            setSearch={setSearch}
            officeMaterials={officeMaterials}
            materialsThreshold={materialsThreshold}
            canOffice={canOffice}
            onAddMaterial={() => setIsAddMaterialOpen(true)}
            onEditMaterial={handleEditMaterial}
            onDeleteMaterial={handleDeleteMaterial}
          />
        )}

        {tab === 'customers' && (
          <CustomersTab
            customersSearch={customersSearch}
            setCustomersSearch={setCustomersSearch}
            filteredCustomers={filteredCustomers}
            onCustomerClick={openCustomerModal}
          />
        )}

        {tab === 'invoices' && (
          <InvoicesTab
            invoiceSearch={invoiceSearch}
            setInvoiceSearch={setInvoiceSearch}
            invoiceStatusFilter={invoiceStatusFilter}
            setInvoiceStatusFilter={setInvoiceStatusFilter}
            invoiceDateFrom={invoiceDateFrom}
            setInvoiceDateFrom={setInvoiceDateFrom}
            invoiceDateTo={invoiceDateTo}
            setInvoiceDateTo={setInvoiceDateTo}
            invoices={invoices}
            loadInvoices={loadInvoices}
            canOffice={canOffice}
            onOpenInvoice={openInvoiceModal}
            onPrintInvoice={handlePrintInvoice}
            onDeleteInvoice={handleDeleteInvoice}
          />
        )}

        {tab === 'debts' && (
          <DebtsTab
            customersWithDebt={customersWithDebt}
            onCustomerDetails={openCustomerModal}
            onPrintReport={(c) => handlePrintCustomerReport(c)}
          />
        )}

        {tab === 'lines' && <LinesTab />}

        {tab === 'reports' && <ReportsTab officeSummary={officeSummary} sales={sales} />}

        {tab === 'alerts' && <OfficeAlertsTab />}
      </div>

      <AddMaterialModal
        isOpen={isAddMaterialOpen}
        onClose={() => setIsAddMaterialOpen(false)}
        materialName={materialName}
        setMaterialName={setMaterialName}
        materialPurchasePrice={materialPurchasePrice}
        setMaterialPurchasePrice={setMaterialPurchasePrice}
        materialSellingPrice={materialSellingPrice}
        setMaterialSellingPrice={setMaterialSellingPrice}
        materialQty={materialQty}
        setMaterialQty={setMaterialQty}
        onSubmit={handleCreateMaterial}
      />

      <EditMaterialModal
        isOpen={isEditMaterialOpen}
        onClose={() => {
          setIsEditMaterialOpen(false);
          setEditMaterialId(null);
        }}
        materialName={materialName}
        setMaterialName={setMaterialName}
        materialPurchasePrice={materialPurchasePrice}
        setMaterialPurchasePrice={setMaterialPurchasePrice}
        materialSellingPrice={materialSellingPrice}
        setMaterialSellingPrice={setMaterialSellingPrice}
        materialQty={materialQty}
        setMaterialQty={setMaterialQty}
        onSubmit={handleUpdateMaterial}
      />

      <InvoiceModal
        isOpen={isInvoiceOpen}
        onClose={() => setIsInvoiceOpen(false)}
        officeName={officeName}
        invoiceCustomerName={invoiceCustomerName}
        setInvoiceCustomerName={setInvoiceCustomerName}
        invoiceCustomerPhone={invoiceCustomerPhone}
        setInvoiceCustomerPhone={setInvoiceCustomerPhone}
        invoiceCustomerId={invoiceCustomerId}
        setInvoiceCustomerId={setInvoiceCustomerId}
        invoicePaymentMethod={invoicePaymentMethod}
        setInvoicePaymentMethod={setInvoicePaymentMethod}
        invoicePaidAmount={invoicePaidAmount}
        setInvoicePaidAmount={setInvoicePaidAmount}
        invoiceNotes={invoiceNotes}
        setInvoiceNotes={setInvoiceNotes}
        invoiceItems={invoiceItems}
        setInvoiceItems={setInvoiceItems}
        invoiceCalc={invoiceCalc}
        invoiceCustomerSuggestions={invoiceCustomerSuggestions}
        customerNameFocused={customerNameFocused}
        setCustomerNameFocused={setCustomerNameFocused}
        materialsWithStock={materialsWithStock}
        officeMaterials={officeMaterials}
        lastCreatedInvoice={lastCreatedInvoice}
        isSavingInvoice={isSavingInvoice}
        onSave={handleCreateInvoice}
        onPrint={handlePrintInvoice}
      />

      <CustomerModal
        isOpen={isCustomerOpen}
        onClose={() => setIsCustomerOpen(false)}
        selectedCustomer={selectedCustomer}
        payDebtAmount={payDebtAmount}
        setPayDebtAmount={setPayDebtAmount}
        customerHistory={customerHistory}
        customerSales={customerSales}
        customerInvoices={customerInvoices}
        customerInstallments={customerInstallments}
        canOffice={canOffice}
        onPayDebt={handlePayDebt}
        onPrintReport={() =>
          selectedCustomer && handlePrintCustomerReport(selectedCustomer, customerSales, customerInstallments, customerInvoices, customerHistory)
        }
        onPrintInvoice={handlePrintInvoice}
        onPayInstallment={handlePayInstallment}
      />
    </div>
  );
}
