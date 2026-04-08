import React, { useState, useMemo } from 'react';
import { Smartphone, Plus, Package, ShoppingCart, Edit, Trash2, ArrowUpRight, ArrowDownRight, BarChart3 } from 'lucide-react';
import { useAppContext, SimType, SimPackage, SimInventoryTransaction, SimSale, SimNumber } from '@/context/AppContext';
import { canAction } from '@/utils/permissions';
import { Download, Upload, Filter, Printer } from 'lucide-react';
import { simCardsApi } from '@/modules/sim-cards/api/simcards.api';
import { ApiRequestError } from '@/api/client';

const SIM_NUMBER_LENGTH = 11;
const isValidSimNumber = (s: string) => /^\d{11}$/.test(String(s).replace(/\s/g, ''));
const sanitizeSimInput = (s: string) => String(s).replace(/\D/g, '').slice(0, SIM_NUMBER_LENGTH);

export default function SimCards() {
  const {
    simPackages, setSimPackages,
    simInventoryTransactions, setSimInventoryTransactions,
    simSales, setSimSales,
    simNumbers, setSimNumbers,
    asiaBalance, zainBalance,
    addNotification,
    logActivity,
    systemSettings,
    currentUser
  } = useAppContext();
  const canLines = (action: string) => canAction(currentUser, 'office', action);

  const [activeTab, setActiveTab] = useState<'inventory' | 'packages' | 'sales' | 'reports' | 'numbers'>('inventory');

  // Modals
  const [isAddInventoryModalOpen, setIsAddInventoryModalOpen] = useState(false);
  const [inventoryStep, setInventoryStep] = useState<1 | 2>(1);
  const [inventoryImportMethod, setInventoryImportMethod] = useState<'manual' | 'file'>('manual');
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [isAddNumberModalOpen, setIsAddNumberModalOpen] = useState(false);

  // Forms
  const [inventoryForm, setInventoryForm] = useState({ type: 'asia' as SimType, quantity: '', date: new Date().toISOString().split('T')[0], numbersList: '' });
  
  const [numberForm, setNumberForm] = useState({ number: '', type: 'asia' as SimType });
  const [numberSearchQuery, setNumberSearchQuery] = useState('');
  const [numberDateFilter, setNumberDateFilter] = useState('');
  const [numberStatusFilter, setNumberStatusFilter] = useState<'all' | 'available' | 'sold'>('all');
  const [numberTypeFilter, setNumberTypeFilter] = useState<'all' | 'asia' | 'zain'>('all');
  
  const [packageForm, setPackageForm] = useState<Partial<SimPackage>>({
    type: 'asia',
    name: '',
    topupAmount: 5000,
    companyCommission: 0,
    jbReturn: 0,
    sellingPrice: 0
  });
  const [editingPackageId, setEditingPackageId] = useState<number | null>(null);

  const [isAddingInventory, setIsAddingInventory] = useState(false);
  const [sellForm, setSellForm] = useState({
    type: 'asia' as SimType,
    packageId: '',
    date: new Date().toISOString().split('T')[0],
    simNumber: '',
    simNumberId: ''
  });

  const topupOptions = [5000, 6000, 10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000];

  const refreshSimData = async (): Promise<{ nums: any[] } | void> => {
    const [pkgs, inv, sales, nums] = await Promise.all([
      simCardsApi.getPackages().catch(() => []),
      simCardsApi.getInventory().catch(() => []),
      simCardsApi.getSales().catch(() => []),
      simCardsApi.getNumbers().catch(() => []),
    ]);
    if (Array.isArray(pkgs)) {
      setSimPackages(
        (pkgs as any[]).map((p: any) => ({
          ...p,
          topupAmount: Number(p?.topupAmount ?? p?.topup_amount ?? 0),
          companyCommission: Number(p?.companyCommission ?? p?.company_commission ?? 0),
          jbReturn: Number(p?.jbReturn ?? p?.jb_return ?? 0),
          cost: Number(p?.cost ?? 0),
          sellingPrice: Number(p?.sellingPrice ?? p?.selling_price ?? 0),
        })) as any,
      );
    }
    if (Array.isArray(inv)) {
      setSimInventoryTransactions(
        (inv as any[]).map((t: any) => ({
          ...t,
          date: t?.date ? String(t.date).split("T")[0] : t?.date,
        })) as any,
      );
    }
    if (Array.isArray(sales)) {
      setSimSales(
        (sales as any[]).map((s: any) => ({
          ...s,
          packageId: s?.packageId ?? s?.package_id,
          simNumberId: s?.simNumberId ?? s?.sim_number_id,
          sellingPrice: Number(s?.sellingPrice ?? s?.selling_price ?? 0),
          cost: Number(s?.cost ?? 0),
          profit: Number(s?.profit ?? 0),
          companyCommission: Number(s?.companyCommission ?? s?.company_commission ?? 0),
          jbReturn: Number(s?.jbReturn ?? s?.jb_return ?? 0),
          date: s?.date ? String(s.date).split("T")[0] : s?.date,
        })) as any,
      );
    }
    if (Array.isArray(nums)) {
      const mapped = (nums as any[]).map((n: any) => ({
        ...n,
        soldDate: n?.soldDate ?? n?.sold_date,
        packageId: n?.packageId ?? n?.package_id,
      }));
      setSimNumbers(mapped as any);
      return { nums: mapped };
    }
  };

  const handleAddInventory = async () => {
    if (!inventoryForm.quantity || Number(inventoryForm.quantity) <= 0) return;
    
    const quantity = Number(inventoryForm.quantity);
    
    // Parse numbers
    const numbers = inventoryForm.numbersList
      .split('\n')
      .map(n => n.trim())
      .filter(n => n.length > 0);
      
    if (numbers.length < quantity) {
      alert(`لقد قمت بإدخال أرقام أقل من العدد المطلوب. المطلوب: ${quantity}، المدخل: ${numbers.length}`);
      return;
    }
    
    if (numbers.length > quantity) {
      alert(`لقد قمت بإدخال أرقام أكثر من العدد المطلوب. المطلوب: ${quantity}، المدخل: ${numbers.length}`);
      return;
    }

    const invalidLength = numbers.filter(n => !isValidSimNumber(n));
    if (invalidLength.length > 0) {
      alert(`كل رقم يجب أن يكون 11 رقمًا حصرًا.\nأرقام غير صالحة: ${invalidLength.slice(0, 5).join(', ')}${invalidLength.length > 5 ? '...' : ''}`);
      return;
    }

    const expectedPrefix = inventoryForm.type === 'asia' ? '077' : '078';
    const invalidPrefix = numbers.filter(n => !n.startsWith(expectedPrefix));
    if (invalidPrefix.length > 0) {
      alert(`الأرقام يجب أن تبدأ بـ ${expectedPrefix}.\nأرقام خاطئة: ${invalidPrefix.slice(0, 3).join(', ')}${invalidPrefix.length > 3 ? '...' : ''}`);
      return;
    }

    try {
      setIsAddingInventory(true);
      for (const num of numbers) {
        await simCardsApi.createNumber({ number: num, type: inventoryForm.type, status: 'available' });
      }
      await simCardsApi.createInventory({ type: inventoryForm.type, quantity, action: 'add' });
      await refreshSimData();
      setIsAddInventoryModalOpen(false);
      setInventoryStep(1);
      setInventoryForm({ type: 'asia', quantity: '', date: new Date().toISOString().split('T')[0], numbersList: '' });
    } catch (e: any) {
      const msg = e instanceof ApiRequestError ? `${e.message}` : String(e?.message ?? e);
      alert(`فشل تأكيد الإضافة: ${msg}`);
    } finally {
      setIsAddingInventory(false);
    }
  };

  const handleInventoryFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const raw = text.split('\n').map(n => n.trim().replace(/\D/g, '')).filter(n => n.length > 0);
      const numbers = raw.map(n => n.slice(0, SIM_NUMBER_LENGTH)).filter(n => n.length === SIM_NUMBER_LENGTH);
      const rejected = raw.length - numbers.length;
      setInventoryForm({ ...inventoryForm, numbersList: numbers.join('\n') });
      if (rejected > 0) alert(`تم قبول ${numbers.length} رقم. تم تجاهل ${rejected} رقم (يجب أن يكون كل رقم 11 رقمًا بالضبط)`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSavePackage = async () => {
    if (!packageForm.name || !packageForm.topupAmount || packageForm.companyCommission === undefined || packageForm.jbReturn === undefined || !packageForm.sellingPrice) return;
    
    const cost = Number(packageForm.topupAmount) - (Number(packageForm.companyCommission) + Number(packageForm.jbReturn));
    
    if (editingPackageId) {
      await simCardsApi.updatePackage(editingPackageId, {
        type: packageForm.type,
        name: packageForm.name,
        topup_amount: Number(packageForm.topupAmount),
        company_commission: Number(packageForm.companyCommission),
        jb_return: Number(packageForm.jbReturn),
        cost,
        selling_price: Number(packageForm.sellingPrice),
      });
    } else {
      await simCardsApi.createPackage({
        type: packageForm.type,
        name: packageForm.name,
        topup_amount: Number(packageForm.topupAmount),
        company_commission: Number(packageForm.companyCommission),
        jb_return: Number(packageForm.jbReturn),
        cost,
        selling_price: Number(packageForm.sellingPrice),
      });
    }
    await refreshSimData();
    
    setIsPackageModalOpen(false);
    setEditingPackageId(null);
    setPackageForm({ type: 'asia', name: '', topupAmount: 5000, companyCommission: 0, jbReturn: 0, sellingPrice: 0 });
  };

  const handleEditPackage = (pkg: SimPackage) => {
    setPackageForm(pkg);
    setEditingPackageId(pkg.id);
    setIsPackageModalOpen(true);
  };

  const handleDeletePackage = async (id: number) => {
    if (window.confirm('هل أنت متأكد من حذف هذه الباقة؟')) {
      await simCardsApi.deletePackage(id);
      await refreshSimData();
    }
  };

  const handleSellSim = async () => {
    if (!sellForm.packageId) return;
    
    const pkg = simPackages.find(p => p.id === Number(sellForm.packageId));
    if (!pkg) return;

    const profit = Number(pkg.sellingPrice ?? 0) - Number(pkg.cost ?? 0);

    let simNumberIdToSave = sellForm.simNumberId ? Number(sellForm.simNumberId) : undefined;
    if (!simNumberIdToSave) {
      if (sellForm.simNumber.trim()) {
        const trimmed = sellForm.simNumber.trim();
        if (!isValidSimNumber(trimmed)) {
          alert(`الرقم يجب أن يكون 11 رقمًا حصرًا. المدخل: ${trimmed.length} رقم`);
          return;
        }
        const prefix = pkg.type === 'asia' ? '077' : '078';
        if (trimmed.startsWith(prefix)) {
          try {
            const created = await simCardsApi.createNumber({
              number: trimmed,
              type: pkg.type,
              status: 'available',
            }) as any;
            simNumberIdToSave = created?.id;
          } catch {
            const refreshed = await refreshSimData();
            const nums = refreshed?.nums ?? simNumbers;
            const existing = (Array.isArray(nums) ? nums : []).find(
              (n: any) => (n?.number ?? '') === sellForm.simNumber.trim() && (n?.type ?? '') === pkg.type
            );
            if (existing) simNumberIdToSave = existing.id;
          }
        }
      }
      if (!simNumberIdToSave) {
        const availableNum = simNumbers.find(n => n.type === pkg.type && n.status === 'available');
        if (!availableNum) {
          alert('لا توجد أرقام متاحة في المخزن لهذا النوع! أدخل رقمًا يدويًا أو أضف أرقامًا للمخزن أولاً.');
          return;
        }
        simNumberIdToSave = availableNum.id;
      }
    }

    try {
      await simCardsApi.createSale({
        package_id: pkg.id,
        type: pkg.type,
        selling_price: Number(pkg.sellingPrice ?? 0),
        cost: Number(pkg.cost ?? 0),
        profit,
        company_commission: Number(pkg.companyCommission ?? 0),
        jb_return: Number(pkg.jbReturn ?? 0),
        sim_number_id: simNumberIdToSave,
      });

      await refreshSimData();
      setIsSellModalOpen(false);
      setSellForm({ type: 'asia', packageId: '', date: new Date().toISOString().split('T')[0], simNumber: '', simNumberId: '' });

      addNotification('عملية بيع خط', `تم بيع خط ${pkg.type === 'asia' ? 'آسيا' : 'زين'} بنجاح`, 'info');
      logActivity?.('lines', 'sell_line', `بيع خط ${pkg.type === 'asia' ? 'آسيا' : 'زين'}`);
      
      const currentBalance = pkg.type === 'asia' ? asiaBalance : zainBalance;
      if (currentBalance - 1 <= (systemSettings?.cardsThreshold ?? 0)) {
        addNotification('تنبيه مخزون الخطوط', `مخزون خطوط ${pkg.type === 'asia' ? 'آسيا' : 'زين'} منخفض (المتبقي ${currentBalance - 1})`, 'alert');
      }
    } catch (e: any) {
      const msg = e instanceof ApiRequestError
        ? `فشل تأكيد البيع (${e.status}): ${e.message}`
        : `فشل تأكيد البيع: ${String(e?.message ?? e)}`;
      alert(msg);
    }
  };

  const handleSimNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = sanitizeSimInput(e.target.value);
    const foundNum = simNumbers.find(
      n => n.number === val && n.status === 'available' && n.type === sellForm.type
    );
    setSellForm({
      ...sellForm,
      simNumber: val,
      simNumberId: foundNum ? foundNum.id.toString() : ''
    });
  };

  const handleSaveNumber = async () => {
    const num = numberForm.number.trim();
    if (!num) return;
    if (!isValidSimNumber(num)) {
      alert(`الرقم يجب أن يكون 11 رقمًا حصرًا. المدخل: ${num.length} رقم`);
      return;
    }
    try {
      await simCardsApi.createNumber({
        number: num,
        type: numberForm.type,
        status: 'available',
      });
      await refreshSimData();
      setIsAddNumberModalOpen(false);
      setNumberForm({ number: '', type: 'asia' });
    } catch (e: any) {
      const msg = e instanceof ApiRequestError ? `${e.message}` : String(e?.message ?? e);
      alert(`فشل حفظ الرقم: ${msg}`);
    }
  };

  const handleImportNumbers = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res((reader.result as string) ?? '');
      reader.onerror = () => rej(new Error('فشل قراءة الملف'));
      reader.readAsText(file);
    });

    const lines = text.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (lines.length === 0) {
      alert('لم يتم العثور على أرقام في الملف');
      e.target.value = '';
      return;
    }

    const validLines = lines
      .map(n => n.replace(/\D/g, '').slice(0, SIM_NUMBER_LENGTH))
      .filter(n => n.length === SIM_NUMBER_LENGTH);
    const rejectedCount = lines.length - validLines.length;
    if (rejectedCount > 0) alert(`تم تجاهل ${rejectedCount} رقم (يجب أن يكون كل رقم 11 رقمًا بالضبط)`);

    let success = 0;
    let failed = 0;
    for (const num of validLines) {
      const type: SimType = num.startsWith('078') ? 'zain' : 'asia';
      try {
        await simCardsApi.createNumber({ number: num, type, status: 'available' });
        success++;
      } catch {
        failed++;
      }
    }

    await refreshSimData();
    e.target.value = '';
    if (failed > 0) {
      alert(`تم استيراد ${success} رقم. فشل ${failed} (ربما الرقم مكرر أو غير صالح)`);
    } else {
      alert(`تم استيراد ${success} رقم بنجاح`);
    }
  };

  const filteredNumbers = useMemo(() => {
    return simNumbers.filter(n => {
      const matchesSearch = n.number.includes(numberSearchQuery);
      const matchesDate = !numberDateFilter || n.soldDate === numberDateFilter;
      const matchesStatus = numberStatusFilter === 'all' || n.status === numberStatusFilter;
      const matchesType = numberTypeFilter === 'all' || n.type === numberTypeFilter;
      return matchesSearch && matchesDate && matchesStatus && matchesType;
    });
  }, [simNumbers, numberSearchQuery, numberDateFilter, numberStatusFilter, numberTypeFilter]);

  const handlePrintNumbers = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html dir="rtl">
        <head>
          <title>تقرير الأرقام</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
            th { background-color: #f4f4f4; }
            .header { text-align: center; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>تقرير الأرقام</h2>
            <p>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-IQ')}</p>
            ${numberTypeFilter !== 'all' ? `<p>النوع: ${numberTypeFilter === 'asia' ? 'آسيا' : 'زين'}</p>` : ''}
            ${numberStatusFilter !== 'all' ? `<p>الحالة: ${numberStatusFilter === 'available' ? 'متاح' : 'تم البيع'}</p>` : ''}
            ${numberDateFilter ? `<p>تاريخ البيع: ${numberDateFilter}</p>` : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th>الرقم</th>
                <th>النوع</th>
                <th>الحالة</th>
                <th>تاريخ البيع</th>
                <th>الباقة</th>
              </tr>
            </thead>
            <tbody>
              ${filteredNumbers.map(n => {
                const pkg = n.packageId ? simPackages.find(p => p.id === n.packageId) : null;
                return `
                  <tr>
                    <td dir="ltr" style="text-align: right;">${n.number}</td>
                    <td>${n.type === 'asia' ? 'آسيا' : 'زين'}</td>
                    <td>${n.status === 'available' ? 'متاح' : 'تم البيع'}</td>
                    <td>${n.soldDate || '-'}</td>
                    <td>${pkg ? pkg.name : '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const availablePackagesForSale = simPackages.filter(p => p.type === sellForm.type);

  // Reports State
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportPackageFilter, setReportPackageFilter] = useState<string>('all');

  const isDateInRange = (dateStr: string) => {
    if (!reportStartDate && !reportEndDate) return true;
    const date = new Date(dateStr);
    const start = reportStartDate ? new Date(reportStartDate) : new Date(0);
    const end = reportEndDate ? new Date(reportEndDate) : new Date(8640000000000000);
    end.setHours(23, 59, 59, 999);
    return date >= start && date <= end;
  };

  const filteredSimSales = useMemo(() => {
    return simSales.filter(sale => {
      const inRange = isDateInRange(sale.date);
      const matchesPackage = reportPackageFilter === 'all' || sale.packageId.toString() === reportPackageFilter;
      return inRange && matchesPackage;
    });
  }, [simSales, reportStartDate, reportEndDate, reportPackageFilter]);

  const reportStats = useMemo(() => {
    let totalSales = 0;
    let totalProfit = 0;
    let asiaProfit = 0;
    let zainProfit = 0;
    const packageStats: Record<number, { count: number, commission: number, jbReturn: number, profit: number }> = {};

    filteredSimSales.forEach(sale => {
      totalSales += sale.sellingPrice;
      totalProfit += sale.profit;
      if (sale.type === 'asia') asiaProfit += sale.profit;
      if (sale.type === 'zain') zainProfit += sale.profit;

      if (!packageStats[sale.packageId]) {
        packageStats[sale.packageId] = { count: 0, commission: 0, jbReturn: 0, profit: 0 };
      }
      packageStats[sale.packageId].count += 1;
      packageStats[sale.packageId].commission += sale.companyCommission;
      packageStats[sale.packageId].jbReturn += sale.jbReturn;
      packageStats[sale.packageId].profit += sale.profit;
    });

    return { totalSales, totalProfit, asiaProfit, zainProfit, packageStats };
  }, [filteredSimSales]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Smartphone className="text-indigo-600" />
          الخطوط
        </h1>
        <div className="flex gap-2 flex-wrap">
          {canLines('linesAdd') && (
            <button
              onClick={() => setIsAddInventoryModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus size={20} />
              إضافة خطوط
            </button>
          )}
          {canLines('linesAddPackage') && (
            <button
              onClick={() => {
                setEditingPackageId(null);
                setPackageForm({ type: 'asia', name: '', topupAmount: 5000, companyCommission: 0, jbReturn: 0, sellingPrice: 0 });
                setIsPackageModalOpen(true);
              }}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Package size={20} />
              إضافة باقة
            </button>
          )}
          {canLines('linesSell') && (
            <button
              onClick={() => setIsSellModalOpen(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ShoppingCart size={20} />
              بيع خط
            </button>
          )}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 mb-1">رصيد خطوط آسيا</p>
            <p className="text-3xl font-bold text-slate-800 dark:text-white">{asiaBalance} <span className="text-lg font-normal text-slate-500 dark:text-slate-400">خط</span></p>
          </div>
          <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center text-rose-600">
            <Smartphone size={24} />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 mb-1">رصيد خطوط زين</p>
            <p className="text-3xl font-bold text-slate-800 dark:text-white">{zainBalance} <span className="text-lg font-normal text-slate-500 dark:text-slate-400">خط</span></p>
          </div>
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
            <Smartphone size={24} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-700 hide-scrollbar">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-none min-w-[120px] flex-1 py-4 px-2 text-center font-medium transition-colors ${activeTab === 'inventory' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
          >
            حركة المخزن
          </button>
          <button
            onClick={() => setActiveTab('numbers')}
            className={`flex-none min-w-[120px] flex-1 py-4 px-2 text-center font-medium transition-colors ${activeTab === 'numbers' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
          >
            إدخال الأرقام
          </button>
          <button
            onClick={() => setActiveTab('packages')}
            className={`flex-none min-w-[120px] flex-1 py-4 px-2 text-center font-medium transition-colors ${activeTab === 'packages' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
          >
            الباقات المتاحة
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`flex-none min-w-[120px] flex-1 py-4 px-2 text-center font-medium transition-colors ${activeTab === 'sales' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
          >
            سجل المبيعات
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex-none min-w-[120px] flex-1 py-4 px-2 text-center font-medium transition-colors ${activeTab === 'reports' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
          >
            التقارير
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'inventory' && (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                    <th className="p-4 font-medium rounded-tr-lg">التاريخ</th>
                    <th className="p-4 font-medium">النوع</th>
                    <th className="p-4 font-medium">العملية</th>
                    <th className="p-4 font-medium rounded-tl-lg">العدد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {simInventoryTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">لا توجد حركات في المخزن</td>
                    </tr>
                  ) : (
                    simInventoryTransactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <td className="p-4 text-slate-800 dark:text-slate-200">{tx.date}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${tx.type === 'asia' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {tx.type === 'asia' ? 'آسيا' : 'زين'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`flex items-center gap-1 ${tx.action === 'add' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {tx.action === 'add' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                            {tx.action === 'add' ? 'إضافة للمخزن' : 'بيع'}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-slate-800 dark:text-slate-200" dir="ltr">
                          {tx.action === 'add' ? '+' : '-'}{tx.quantity}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'numbers' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex flex-wrap gap-2 flex-1">
                  <div className="relative flex-1 min-w-[150px] max-w-md">
                    <input
                      type="text"
                      placeholder="بحث عن رقم..."
                      value={numberSearchQuery}
                      onChange={(e) => setNumberSearchQuery(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="relative">
                    <select
                      value={numberTypeFilter}
                      onChange={(e) => setNumberTypeFilter(e.target.value as any)}
                      className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="all">كل الأنواع</option>
                      <option value="asia">آسيا</option>
                      <option value="zain">زين</option>
                    </select>
                  </div>
                  <div className="relative">
                    <select
                      value={numberStatusFilter}
                      onChange={(e) => setNumberStatusFilter(e.target.value as any)}
                      className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="all">كل الحالات</option>
                      <option value="available">متاح</option>
                      <option value="sold">تم البيع</option>
                    </select>
                  </div>
                  <div className="relative">
                    <input
                      type="date"
                      value={numberDateFilter}
                      onChange={(e) => setNumberDateFilter(e.target.value)}
                      className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                      title="تصفية حسب تاريخ البيع"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handlePrintNumbers} className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-2">
                    <Printer size={16} />
                    <span className="hidden sm:inline">طباعة</span>
                  </button>
                  <label className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-2 cursor-pointer">
                    <Upload size={16} />
                    <span className="hidden sm:inline">استيراد أرقام</span>
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={handleImportNumbers} />
                  </label>
                  {canLines('linesAddNumbers') && (
                    <button onClick={() => setIsAddNumberModalOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                      <Plus size={16} />
                      <span className="hidden sm:inline">إضافة رقم</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm">
                      <th className="p-4 font-medium rounded-tr-lg">الرقم</th>
                      <th className="p-4 font-medium">النوع</th>
                      <th className="p-4 font-medium">الحالة</th>
                      <th className="p-4 font-medium">تاريخ البيع</th>
                      <th className="p-4 font-medium rounded-tl-lg">الباقة المباعة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredNumbers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">لا توجد أرقام</td>
                      </tr>
                    ) : (
                      filteredNumbers.map(num => {
                        const pkg = num.packageId ? simPackages.find(p => p.id === num.packageId) : null;
                        return (
                          <tr key={num.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-bold text-slate-800 dark:text-slate-200" dir="ltr">{num.number}</td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${num.type === 'asia' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                {num.type === 'asia' ? 'آسيا' : 'زين'}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${num.status === 'sold' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                                {num.status === 'sold' ? 'تم البيع' : 'متاح'}
                              </span>
                            </td>
                            <td className="p-4 text-slate-600">{num.soldDate || '-'}</td>
                            <td className="p-4 text-slate-600">{pkg?.name || '-'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'packages' && (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                    <th className="p-4 font-medium rounded-tr-lg">النوع</th>
                    <th className="p-4 font-medium">اسم الباقة</th>
                    <th className="p-4 font-medium">مقدار التعبئة</th>
                    <th className="p-4 font-medium">عمولة الشركة</th>
                    <th className="p-4 font-medium">الراجع JB</th>
                    <th className="p-4 font-medium">التكلفة</th>
                    <th className="p-4 font-medium">سعر البيع</th>
                    <th className="p-4 font-medium">الربح</th>
                    <th className="p-4 font-medium rounded-tl-lg">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {simPackages.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500">لا توجد باقات مضافة</td>
                    </tr>
                  ) : (
                    simPackages.map(pkg => (
                      <tr key={pkg.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${pkg.type === 'asia' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {pkg.type === 'asia' ? 'آسيا' : 'زين'}
                          </span>
                        </td>
                        <td className="p-4 font-medium text-slate-800">{pkg.name}</td>
                        <td className="p-4 text-slate-600" dir="ltr">{pkg.topupAmount.toLocaleString()}</td>
                        <td className="p-4 text-rose-600" dir="ltr">{pkg.companyCommission.toLocaleString()}</td>
                        <td className="p-4 text-emerald-600" dir="ltr">{pkg.jbReturn.toLocaleString()}</td>
                        <td className="p-4 font-bold text-slate-700" dir="ltr">{pkg.cost.toLocaleString()}</td>
                        <td className="p-4 font-bold text-indigo-600" dir="ltr">{pkg.sellingPrice.toLocaleString()}</td>
                        <td className="p-4 font-bold text-emerald-600" dir="ltr">{(pkg.sellingPrice - pkg.cost).toLocaleString()}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleEditPackage(pkg)} className="p-1 text-slate-400 hover:text-indigo-600 transition-colors">
                              <Edit size={18} />
                            </button>
                            <button onClick={() => handleDeletePackage(pkg.id)} className="p-1 text-slate-400 hover:text-rose-600 transition-colors">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'sales' && (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                    <th className="p-4 font-medium rounded-tr-lg">التاريخ</th>
                    <th className="p-4 font-medium">النوع</th>
                    <th className="p-4 font-medium">الباقة</th>
                    <th className="p-4 font-medium">سعر البيع</th>
                    <th className="p-4 font-medium">التكلفة</th>
                    <th className="p-4 font-medium rounded-tl-lg">الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {simSales.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">لا توجد مبيعات</td>
                    </tr>
                  ) : (
                    simSales.map(sale => {
                      const pkg = simPackages.find(p => p.id === sale.packageId);
                      return (
                        <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="p-4 text-slate-800 dark:text-slate-200">{sale.date}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${sale.type === 'asia' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              {sale.type === 'asia' ? 'آسيا' : 'زين'}
                            </span>
                          </td>
                          <td className="p-4 font-medium text-slate-800 dark:text-slate-200">{pkg?.name || 'باقة محذوفة'}</td>
                          <td className="p-4 font-bold text-indigo-600" dir="ltr">{sale.sellingPrice.toLocaleString()}</td>
                          <td className="p-4 text-slate-600" dir="ltr">{sale.cost.toLocaleString()}</td>
                          <td className="p-4 font-bold text-emerald-600" dir="ltr">{sale.profit.toLocaleString()}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl border border-slate-200 dark:border-slate-600 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">من تاريخ</label>
                  <input 
                    type="date" 
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">إلى تاريخ</label>
                  <input 
                    type="date" 
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">تصفية حسب الباقة</label>
                  <select 
                    value={reportPackageFilter}
                    onChange={(e) => setReportPackageFilter(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">جميع الباقات</option>
                    {simPackages.map(pkg => (
                      <option key={pkg.id} value={pkg.id.toString()}>{pkg.name} ({pkg.type === 'asia' ? 'آسيا' : 'زين'})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <p className="text-sm text-slate-500 mb-1">إجمالي المبيعات</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white" dir="ltr">{reportStats.totalSales.toLocaleString()} د.ع</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <p className="text-sm text-slate-500 mb-1">إجمالي الأرباح</p>
                  <p className="text-2xl font-bold text-emerald-600" dir="ltr">{reportStats.totalProfit.toLocaleString()} د.ع</p>
                </div>
                <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 shadow-sm">
                  <p className="text-sm text-rose-600 mb-1">أرباح آسيا</p>
                  <p className="text-2xl font-bold text-rose-700" dir="ltr">{reportStats.asiaProfit.toLocaleString()} د.ع</p>
                </div>
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 shadow-sm">
                  <p className="text-sm text-amber-600 mb-1">أرباح زين</p>
                  <p className="text-2xl font-bold text-amber-700" dir="ltr">{reportStats.zainProfit.toLocaleString()} د.ع</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm">
                      <th className="p-4 font-medium rounded-tr-lg">الباقة</th>
                      <th className="p-4 font-medium">النوع</th>
                      <th className="p-4 font-medium text-center">العدد المباع</th>
                      <th className="p-4 font-medium">إجمالي العمولات</th>
                      <th className="p-4 font-medium">إجمالي الراجع JB</th>
                      <th className="p-4 font-medium rounded-tl-lg">إجمالي الأرباح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {Object.entries(reportStats.packageStats).map(([pkgId, statsObj]) => {
                      const stats = statsObj as { count: number, commission: number, jbReturn: number, profit: number };
                      const pkg = simPackages.find(p => p.id === Number(pkgId));
                      if (!pkg) return null;
                      return (
                        <tr key={pkgId} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="p-4 font-medium text-slate-800 dark:text-slate-200">{pkg.name}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${pkg.type === 'asia' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              {pkg.type === 'asia' ? 'آسيا' : 'زين'}
                            </span>
                          </td>
                          <td className="p-4 font-bold text-slate-700 text-center" dir="ltr">{stats.count}</td>
                          <td className="p-4 text-rose-600" dir="ltr">{stats.commission.toLocaleString()}</td>
                          <td className="p-4 text-emerald-600" dir="ltr">{stats.jbReturn.toLocaleString()}</td>
                          <td className="p-4 font-bold text-indigo-600" dir="ltr">{stats.profit.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                    {Object.keys(reportStats.packageStats).length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">لا توجد مبيعات في هذه الفترة أو لهذه الباقة</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Inventory Modal */}
      {isAddInventoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                {inventoryStep === 1 ? 'إضافة خطوط للمخزن' : 'إدخال الأرقام'}
              </h2>
              <button onClick={() => { setIsAddInventoryModalOpen(false); setInventoryStep(1); }} className="text-slate-400 hover:text-slate-600">
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            
            {inventoryStep === 1 ? (
              <>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">نوع الخط</label>
                    <select
                      value={inventoryForm.type}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, type: e.target.value as SimType })}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="asia">آسيا (Asiacell)</option>
                      <option value="zain">زين (Zain)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">العدد</label>
                    <input
                      type="number"
                      value={inventoryForm.quantity}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, quantity: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="أدخل عدد الخطوط"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">التاريخ</label>
                    <input
                      type="date"
                      value={inventoryForm.date}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, date: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="p-6 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-100 dark:border-slate-600 flex justify-end gap-3">
                  <button
                    onClick={() => { setIsAddInventoryModalOpen(false); setInventoryStep(1); }}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={() => {
                      if (!inventoryForm.quantity || Number(inventoryForm.quantity) <= 0) {
                        alert('يرجى إدخال عدد صحيح');
                        return;
                      }
                      setInventoryStep(2);
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    التالي
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-6 space-y-4">
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setInventoryImportMethod('manual')}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${inventoryImportMethod === 'manual' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      إدخال يدوي
                    </button>
                    <button
                      onClick={() => setInventoryImportMethod('file')}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${inventoryImportMethod === 'file' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      استيراد ملف
                    </button>
                  </div>

                  {inventoryImportMethod === 'manual' ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">أرقام الخطوط (كل رقم في سطر)</label>
                      <textarea
                        value={inventoryForm.numbersList}
                        onChange={(e) => {
                          const lines = e.target.value.split('\n');
                          const sanitized = lines.map(line => sanitizeSimInput(line));
                          setInventoryForm({ ...inventoryForm, numbersList: sanitized.join('\n') });
                        }}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 h-48 resize-none"
                        placeholder={inventoryForm.type === 'asia' ? "077xxxxxxx (11 رقم)\n077xxxxxxx" : "078xxxxxxx (11 رقم)\n078xxxxxxx"}
                        dir="ltr"
                      ></textarea>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                      <Upload size={32} className="mx-auto text-slate-400 mb-3" />
                      <p className="text-sm text-slate-600 mb-2">قم برفع ملف نصي (TXT) أو إكسل (CSV) يحتوي على الأرقام</p>
                      <p className="text-xs text-slate-500 mb-4">يجب أن يكون كل رقم في سطر منفصل</p>
                      <label className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors cursor-pointer inline-block">
                        اختر ملف
                        <input type="file" accept=".csv,.txt" className="hidden" onChange={handleInventoryFileUpload} />
                      </label>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-sm flex-wrap gap-2">
                    <span className="text-slate-600">العدد المطلوب: <span className="font-bold">{inventoryForm.quantity}</span> (كل رقم 11 رقمًا حصرًا)</span>
                    {(() => {
                      const nums = inventoryForm.numbersList.split('\n').map(n => n.trim()).filter(n => n.length > 0);
                      const valid = nums.filter(n => isValidSimNumber(n));
                      const ok = valid.length === Number(inventoryForm.quantity) && valid.length === nums.length;
                      return (
                        <span className={ok ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                          المدخل: {nums.length}{valid.length !== nums.length ? ` (صالح: ${valid.length})` : ''}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between gap-3">
                  <button
                    onClick={() => setInventoryStep(1)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    رجوع
                  </button>
                  <button
                    type="button"
                    onClick={handleAddInventory}
                    disabled={isAddingInventory}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAddingInventory ? 'جاري الإضافة...' : 'تأكيد وإضافة'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Package Modal */}
      {isPackageModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">{editingPackageId ? 'تعديل باقة' : 'إضافة باقة جديدة'}</h2>
              <button onClick={() => setIsPackageModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">نوع الخط</label>
                <select
                  value={packageForm.type}
                  onChange={(e) => setPackageForm({ ...packageForm, type: e.target.value as SimType })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="asia">آسيا (Asiacell)</option>
                  <option value="zain">زين (Zain)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">اسم الباقة</label>
                <input
                  type="text"
                  value={packageForm.name}
                  onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="مثال: باقة 15 المفتوحة"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">مقدار التعبئة</label>
                <select
                  value={packageForm.topupAmount}
                  onChange={(e) => setPackageForm({ ...packageForm, topupAmount: Number(e.target.value) })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {topupOptions.map(opt => (
                    <option key={opt} value={opt}>{opt.toLocaleString()} د.ع</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">عمولة الشركة (-)</label>
                  <input
                    type="number"
                    value={packageForm.companyCommission}
                    onChange={(e) => setPackageForm({ ...packageForm, companyCommission: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الراجع JB (+)</label>
                  <input
                    type="number"
                    value={packageForm.jbReturn}
                    onChange={(e) => setPackageForm({ ...packageForm, jbReturn: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              
              <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg border border-slate-200 dark:border-slate-600 flex justify-between items-center">
                <span className="font-medium text-slate-700">تكلفة الخط المحسوبة:</span>
                <span className="font-bold text-slate-800 dark:text-white" dir="ltr">
                  {((Number(packageForm.topupAmount) || 0) - ((Number(packageForm.companyCommission) || 0) + (Number(packageForm.jbReturn) || 0))).toLocaleString()} د.ع
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">سعر البيع</label>
                <input
                  type="number"
                  value={packageForm.sellingPrice}
                  onChange={(e) => setPackageForm({ ...packageForm, sellingPrice: Number(e.target.value) })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              
              {Number(packageForm.sellingPrice) > 0 && (
                <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100 flex justify-between items-center">
                  <span className="font-medium text-emerald-800">الربح المتوقع:</span>
                  <span className="font-bold text-emerald-600" dir="ltr">
                    {(Number(packageForm.sellingPrice) - ((Number(packageForm.topupAmount) || 0) - ((Number(packageForm.companyCommission) || 0) + (Number(packageForm.jbReturn) || 0)))).toLocaleString()} د.ع
                  </span>
                </div>
              )}
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setIsPackageModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleSavePackage}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                حفظ الباقة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sell Modal */}
      {isSellModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">بيع خط</h2>
              <button onClick={() => setIsSellModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">نوع الخط</label>
                <select
                  value={sellForm.type}
                  onChange={(e) => {
                  const newType = e.target.value as SimType;
                  const prevNum = simNumbers.find(n => n.id === Number(sellForm.simNumberId));
                  const keepNum = prevNum && prevNum.type === newType;
                  setSellForm({
                    ...sellForm,
                    type: newType,
                    packageId: '',
                    simNumber: keepNum ? sellForm.simNumber : '',
                    simNumberId: keepNum ? sellForm.simNumberId : '',
                  });
                }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="asia">آسيا (Asiacell)</option>
                  <option value="zain">زين (Zain)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">رقم الخط (اختيار من القائمة أو كتابة يدويًا)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={SIM_NUMBER_LENGTH}
                  placeholder={sellForm.type === 'asia' ? '077xxxxxxxx' : '078xxxxxxxx'}
                  value={sellForm.simNumber}
                  onChange={handleSimNumberChange}
                  list="available-numbers-sell"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  dir="ltr"
                />
                <datalist id="available-numbers-sell">
                  {simNumbers
                    .filter(n => n.status === 'available' && n.type === sellForm.type)
                    .map(n => (
                      <option key={n.id} value={n.number} />
                    ))}
                </datalist>
                {sellForm.simNumberId ? (
                  <p className="text-xs text-emerald-600 mt-1">الرقم موجود في المخزن</p>
                ) : sellForm.simNumber && (
                  <p className="text-xs text-slate-500 mt-1">سيتم إضافة الرقم للمخزن ثم البيع إن لم يكن مسجلاً</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">الباقة</label>
                <select
                  value={sellForm.packageId}
                  onChange={(e) => setSellForm({ ...sellForm, packageId: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">اختر الباقة...</option>
                  {availablePackagesForSale.map(pkg => (
                    <option key={pkg.id} value={pkg.id}>{pkg.name} - سعر البيع: {pkg.sellingPrice.toLocaleString()}</option>
                  ))}
                </select>
                {availablePackagesForSale.length === 0 && (
                  <p className="text-xs text-rose-500 mt-1">لا توجد باقات مضافة لهذا النوع من الخطوط.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">التاريخ</label>
                <input
                  type="date"
                  value={sellForm.date}
                  onChange={(e) => setSellForm({ ...sellForm, date: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setIsSellModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleSellSim}
                disabled={!sellForm.packageId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                تأكيد البيع
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Add Number Modal */}
      {isAddNumberModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">إضافة رقم جديد</h2>
              <button onClick={() => setIsAddNumberModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">الرقم (11 رقمًا حصرًا)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={SIM_NUMBER_LENGTH}
                  value={numberForm.number}
                  onChange={(e) => {
                    const val = sanitizeSimInput(e.target.value);
                    let type = numberForm.type;
                    if (val.startsWith('077')) type = 'asia';
                    else if (val.startsWith('078')) type = 'zain';
                    setNumberForm({ number: val, type });
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  dir="ltr"
                  placeholder="077xxxxxxxx أو 078xxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">نوع الخط</label>
                <select
                  value={numberForm.type}
                  onChange={(e) => setNumberForm({ ...numberForm, type: e.target.value as SimType })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="asia">آسيا (Asiacell)</option>
                  <option value="zain">زين (Zain)</option>
                </select>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setIsAddNumberModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveNumber}
                disabled={!numberForm.number || !isValidSimNumber(numberForm.number)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                حفظ الرقم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
