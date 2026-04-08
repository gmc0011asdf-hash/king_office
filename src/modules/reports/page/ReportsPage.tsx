import React, { useState, useMemo, useEffect } from 'react';
import { BarChart3, Download, Printer, Calendar, TrendingUp, PieChart, Activity, DollarSign, CreditCard, Clock, Wallet, Users, Smartphone } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { internetApi } from '@/modules/internet/api/meta.api';

export default function Reports() {
  const { 
    subscribers, 
    materialSales, 
    officeSales, 
    officeCustomers,
    cardSales,
    swigTransactions,
    qiTransactions,
    swigBalance,
    qiBalance,
    walletBalance,
    wirelessWalletBalance,
    cardInventoryCount,
    partners,
    walletTransactions,
    cashbackValue,
    suppliers,
    simSales,
    simPackages
  } = useAppContext();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    internetApi.getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);
  const [activeTab, setActiveTab] = useState<'all' | 'internet' | 'office' | 'cards' | 'sims' | 'partners'>('all');

  // Helper to check if a date is within the selected range
  const safeNum = (v: any) => (isNaN(Number(v)) ? 0 : Number(v));
  const getSaleDate = (s: any) => s?.purchaseDate ?? s?.purchase_date ?? s?.date ?? "";
  const getPaymentMethod = (s: any) => s?.paymentMethod ?? s?.payment_method ?? "cash";
  const getSaleTotal = (s: any) => {
    const pm = getPaymentMethod(s);
    if (pm === "installments" || pm === "debt") return safeNum(s?.totalWithCommission ?? s?.total_with_commission);
    return safeNum(s?.totalAmount ?? s?.total_amount ?? 0);
  };

  const isDateInRange = (dateStr: string) => {
    if (!startDate && !endDate) return true;
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (date < start) return false;
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (date > end) return false;
    }
    
    return true;
  };

  const internetReportData = useMemo(() => {
    let cashCollected = 0;
    let debtsCreated = 0;
    let totalProfits = 0;

    subscribers.forEach(sub => {
      debtsCreated += safeNum(sub?.debt);
      if (sub.history) {
        sub.history.forEach(h => {
          if (isDateInRange(h.date)) {
            if (h.type === 'اشتراك جديد' || h.type === 'تجديد اشتراك' || h.type === 'تسديد ديون') {
              cashCollected += h.amount;
            }
          }
        });
      }
    });

    materialSales.forEach(sale => {
      const d = sale?.date ?? "";
      if (isDateInRange(d)) {
        if ((sale?.paymentMethod ?? sale?.payment_method) === 'cash') {
          cashCollected += safeNum(sale?.totalAmount ?? sale?.total_amount);
        }
        totalProfits += safeNum(sale?.profit);
      }
    });

    // كاش باك فقط لمشتركي FTTH - Wireless لا يحسب
    const ftthCount = subscribers.filter(s => (s?.subscriptionType ?? s?.subscription_type ?? 'ftth').toString().toLowerCase() !== 'wireless').length;
    totalProfits += (cashbackValue * ftthCount);

    // أرباح Wireless: (سعر البيع - سعر التكلفة) لكل اشتراك/تجديد في الفترة
    let wirelessProfits = 0;
    subscribers.forEach(sub => {
      const subType = (sub?.subscriptionType ?? sub?.subscription_type ?? 'ftth').toString().toLowerCase();
      if (subType !== 'wireless') return;
      const cat = categories.find((c: any) => c.name === sub.category);
      const sellPrice = safeNum(sub?.categoryPrice ?? cat?.price ?? 0);
      const costPrice = cat?.costPrice != null && !isNaN(Number(cat.costPrice)) ? Number(cat.costPrice) : 0;
      const profitPerUnit = Math.max(0, sellPrice - costPrice);
      if (sub.history && profitPerUnit > 0) {
        sub.history.forEach((h: any) => {
          if (isDateInRange(h?.date ?? '') && (h?.type === 'اشتراك جديد' || h?.type === 'تجديد اشتراك' || h?.type === 'تجديد اشتراك بالآجل')) {
            wirelessProfits += profitPerUnit;
          }
        });
      }
    });
    totalProfits += wirelessProfits;

    return { cashCollected, debtsCreated, totalProfits, wirelessProfits };
  }, [subscribers, materialSales, startDate, endDate, cashbackValue, categories]);

  const officeReportData = useMemo(() => {
    let cashCollected = 0;
    let debtsCreated = 0;
    let installmentsCreated = 0;
    let totalProfits = 0;

    officeSales.forEach(sale => {
      const d = getSaleDate(sale);
      if (isDateInRange(d)) {
        const pm = getPaymentMethod(sale);
        const tot = getSaleTotal(sale);
        if (pm === 'cash') {
          cashCollected += tot;
        } else if (pm === 'installments') {
          installmentsCreated += tot;
        }
        totalProfits += safeNum(sale?.profit);
      }
    });

    officeCustomers.forEach(customer => {
      debtsCreated += safeNum(customer?.debt);
      const hist = customer?.history ?? [];
      hist.forEach((h: any) => {
        const hd = h?.date ?? "";
        if (isDateInRange(hd)) {
          const ht = String(h?.type ?? "");
          if (ht.includes('تسديد')) cashCollected += safeNum(h?.amount);
        }
      });
    });

    // Add Sim Cards to Office Department
    simSales.forEach(sale => {
      if (isDateInRange(sale.date)) {
        cashCollected += sale.sellingPrice;
        totalProfits += sale.profit;
      }
    });

    return { cashCollected, debtsCreated, installmentsCreated, totalProfits };
  }, [officeSales, officeCustomers, simSales, startDate, endDate]);

  const cardsReportData = useMemo(() => {
    let cashCollected = 0;
    let totalProfits = 0;
    
    cardSales.forEach(sale => {
      const d = sale?.date ?? "";
      if (isDateInRange(d)) {
        cashCollected += safeNum(sale?.total ?? sale?.totalAmount ?? sale?.total_amount);
        totalProfits += safeNum(sale?.profit);
      }
    });

    swigTransactions.forEach(tx => {
      const d = tx?.date ?? "";
      if (isDateInRange(d) && tx?.type === 'topup_customer') {
        cashCollected += safeNum(tx?.total ?? tx?.amount);
        totalProfits += safeNum(tx?.commission);
      }
    });
    
    qiTransactions.forEach(tx => {
      const d = tx?.date ?? "";
      if (isDateInRange(d) && tx?.type === 'topup_customer') {
        cashCollected += safeNum(tx?.total ?? tx?.amount);
        totalProfits += safeNum(tx?.commission);
      }
    });

    return { cashCollected, debtsCreated: 0, installmentsCreated: 0, totalProfits };
  }, [cardSales, swigTransactions, qiTransactions, startDate, endDate]);

  const simsReportData = useMemo(() => {
    let cashCollected = 0;
    let totalProfits = 0;
    let asiaProfit = 0;
    let zainProfit = 0;
    const packageStats: Record<number, { count: number, commission: number, jbReturn: number, profit: number }> = {};

    simSales.forEach(sale => {
      const d = sale?.date ?? "";
      if (isDateInRange(d)) {
        const sp = safeNum(sale?.sellingPrice ?? sale?.selling_price);
        const pf = safeNum(sale?.profit);
        cashCollected += sp;
        totalProfits += pf;
        
        if (sale?.type === 'asia') asiaProfit += pf;
        if (sale?.type === 'zain') zainProfit += pf;

        const pkgId = sale?.packageId ?? sale?.package_id ?? 0;
        if (!packageStats[pkgId]) {
          packageStats[pkgId] = { count: 0, commission: 0, jbReturn: 0, profit: 0 };
        }
        packageStats[pkgId].count += 1;
        packageStats[pkgId].commission += safeNum(sale?.companyCommission ?? sale?.company_commission);
        packageStats[pkgId].jbReturn += safeNum(sale?.jbReturn ?? sale?.jb_return);
        packageStats[pkgId].profit += safeNum(sale?.profit);
      }
    });

    return { cashCollected, debtsCreated: 0, installmentsCreated: 0, totalProfits, asiaProfit, zainProfit, packageStats };
  }, [simSales, startDate, endDate]);

  const expensesData = useMemo(() => {
    let totalExpenses = 0;
    walletTransactions.forEach(tx => {
      const d = tx?.date ?? "";
      if (isDateInRange(d) && tx?.type === 'expense') {
        totalExpenses += safeNum(tx?.amount);
      }
    });
    return totalExpenses;
  }, [walletTransactions, startDate, endDate]);

  const partnerShares = useMemo(() => {
    return partners.map(partner => {
      let departmentProfit = 0;
      if (partner.department === 'internet') departmentProfit = internetReportData.totalProfits;
      else if (partner.department === 'office') departmentProfit = officeReportData.totalProfits;
      else if (partner.department === 'cards') departmentProfit = cardsReportData.totalProfits;
      // If there's a sim cards department for partners, it would be added here.
      
      const share = (departmentProfit * partner.percentage) / 100;
      return { ...partner, share, departmentProfit };
    });
  }, [partners, internetReportData, officeReportData, cardsReportData]);

  const reportData = useMemo(() => {
    if (activeTab === 'internet') {
      return {
        ...internetReportData,
        installmentsCreated: 0,
        wirelessProfits: internetReportData.wirelessProfits ?? 0,
      };
    } else if (activeTab === 'office') {
      return { ...officeReportData, wirelessProfits: 0 };
    } else if (activeTab === 'cards') {
      return { ...cardsReportData, wirelessProfits: 0 };
    } else if (activeTab === 'sims') {
      return { ...simsReportData, wirelessProfits: 0 };
    } else {
      return {
        cashCollected: internetReportData.cashCollected + officeReportData.cashCollected + cardsReportData.cashCollected + simsReportData.cashCollected,
        debtsCreated: internetReportData.debtsCreated + officeReportData.debtsCreated,
        installmentsCreated: officeReportData.installmentsCreated,
        totalProfits: internetReportData.totalProfits + officeReportData.totalProfits + cardsReportData.totalProfits + simsReportData.totalProfits,
        wirelessProfits: internetReportData.wirelessProfits ?? 0,
      };
    }
  }, [internetReportData, officeReportData, cardsReportData, simsReportData, activeTab]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">التقارير الشاملة</h1>
          <p className="text-slate-500 dark:text-slate-300 text-sm mt-1">تحليل الأداء المالي والتشغيلي لجميع الأقسام</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 shadow-sm">
            <Printer size={16} />
            <span className="hidden sm:inline">طباعة</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap gap-4 items-end print:hidden">
        <div className="w-full sm:w-auto flex-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">من تاريخ</label>
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
          />
        </div>
        <div className="w-full sm:w-auto flex-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">إلى تاريخ</label>
          <input 
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
          />
        </div>
        <button 
          onClick={() => { setStartDate(''); setEndDate(''); }}
          className="w-full sm:w-auto bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 px-6 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          مسح الفلاتر
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto sticky top-0 bg-slate-50 dark:bg-slate-900 z-30 pt-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 print:hidden">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'all'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          الكل
        </button>
        <button
          onClick={() => setActiveTab('internet')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'internet'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          قسم الإنترنت
        </button>
        <button
          onClick={() => setActiveTab('office')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'office'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          قسم المكتب
        </button>
        <button
          onClick={() => setActiveTab('cards')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'cards'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          قسم البطاقات
        </button>
        <button
          onClick={() => setActiveTab('sims')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'sims'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          الخطوط
        </button>
        <button
          onClick={() => setActiveTab('partners')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'partners'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          حصص الشركاء والمصروفات
        </button>
      </div>

      {/* Report Preview Area */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 lg:p-10 print:border-none print:shadow-none print:p-0 print:bg-white">
        <div className="text-center mb-10 border-b border-slate-100 dark:border-slate-600 pb-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white print:text-slate-800">
            {activeTab === 'all' ? 'التقرير المالي الموحد' : 
             activeTab === 'internet' ? 'التقرير المالي - قسم الإنترنت' : 
             activeTab === 'office' ? 'التقرير المالي - قسم المكتب' :
             activeTab === 'cards' ? 'التقرير المالي - قسم البطاقات' :
             activeTab === 'sims' ? 'التقرير المالي - الخطوط' :
             'تقرير حصص الشركاء والمصروفات'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2 print:text-slate-600">
            الفترة: {startDate ? startDate : 'البداية'} إلى {endDate ? endDate : 'الآن'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100 text-center">
            <div className="flex justify-center mb-3 text-emerald-600">
              <DollarSign size={28} />
            </div>
            <p className="text-sm font-bold text-emerald-800 mb-2">المبالغ المستحصلة نقداً</p>
            <p className="text-2xl font-black text-emerald-600" dir="ltr">{reportData.cashCollected.toLocaleString()}</p>
            <p className="text-xs text-emerald-600/70 mt-1 font-medium">د.ع</p>
          </div>
          
          <div className="bg-rose-50 p-6 rounded-xl border border-rose-100 text-center">
            <div className="flex justify-center mb-3 text-rose-600">
              <CreditCard size={28} />
            </div>
            <p className="text-sm font-bold text-rose-800 mb-2">الديون المسجلة (آجل)</p>
            <p className="text-2xl font-black text-rose-600" dir="ltr">{(Number(reportData.debtsCreated) || 0).toLocaleString()}</p>
            <p className="text-xs text-rose-600/70 mt-1 font-medium">د.ع</p>
          </div>

          <div className="bg-amber-50 p-6 rounded-xl border border-amber-100 text-center">
            <div className="flex justify-center mb-3 text-amber-600">
              <Clock size={28} />
            </div>
            <p className="text-sm font-bold text-amber-800 mb-2">مبيعات الأقساط</p>
            <p className="text-2xl font-black text-amber-600" dir="ltr">{reportData.installmentsCreated.toLocaleString()}</p>
            <p className="text-xs text-amber-600/70 mt-1 font-medium">د.ع</p>
          </div>

          <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 text-center">
            <div className="flex justify-center mb-3 text-indigo-600">
              <TrendingUp size={28} />
            </div>
            <p className="text-sm font-bold text-indigo-800 mb-2">إجمالي الأرباح</p>
            <p className="text-2xl font-black text-indigo-600" dir="ltr">{reportData.totalProfits.toLocaleString()}</p>
            <p className="text-xs text-indigo-600/70 mt-1 font-medium">د.ع</p>
          </div>
          {(activeTab === 'all' || activeTab === 'internet') && (
          <div className="bg-amber-50 p-6 rounded-xl border border-amber-100 text-center">
            <div className="flex justify-center mb-3 text-amber-600">
              <TrendingUp size={28} />
            </div>
            <p className="text-sm font-bold text-amber-800 mb-2">أرباح Wireless</p>
            <p className="text-2xl font-black text-amber-600" dir="ltr">{(reportData.wirelessProfits ?? 0).toLocaleString()}</p>
            <p className="text-xs text-amber-600/70 mt-1 font-medium">د.ع</p>
          </div>
          )}
        </div>

        {(activeTab === 'all' || activeTab === 'internet') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            <div className="bg-indigo-50 dark:bg-indigo-900/30 p-6 rounded-xl border border-indigo-100 dark:border-indigo-800 text-center">
              <div className="flex justify-center mb-3 text-indigo-600">
                <Wallet size={28} />
              </div>
              <p className="text-sm font-bold text-indigo-800 dark:text-indigo-200 mb-2">محفظة الإنترنت (FTTH)</p>
              <p className="text-2xl font-black text-indigo-600 dark:text-indigo-300" dir="ltr">{(walletBalance ?? 0).toLocaleString()}</p>
              <p className="text-xs text-indigo-600/70 mt-1 font-medium">د.ع</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/30 p-6 rounded-xl border border-amber-100 dark:border-amber-800 text-center">
              <div className="flex justify-center mb-3 text-amber-600">
                <Wallet size={28} />
              </div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200 mb-2">محفظة Wireless</p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-300" dir="ltr">{(wirelessWalletBalance ?? 0).toLocaleString()}</p>
              <p className="text-xs text-amber-600/70 mt-1 font-medium">د.ع</p>
            </div>
          </div>
        )}

        <div className="space-y-8">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Activity size={20} className="text-indigo-600" />
              تفاصيل المبيعات والأرباح
            </h3>
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200 text-slate-600 text-sm">
                  <th className="py-3 font-medium">القسم</th>
                  <th className="py-3 font-medium">إجمالي المبيعات</th>
                  <th className="py-3 font-medium">الأرباح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {(activeTab === 'all' || activeTab === 'internet') && (
                  <>
                  <tr>
                    <td className="py-3 font-medium text-slate-800 dark:text-slate-200">مواد الإنترنت</td>
                    <td className="py-3 font-bold text-slate-700" dir="ltr">
                      {materialSales.filter(s => isDateInRange(s.date)).reduce((sum, s) => sum + s.totalAmount, 0).toLocaleString()} د.ع
                    </td>
                    <td className="py-3 font-bold text-emerald-600" dir="ltr">
                      {materialSales.filter(s => isDateInRange(s.date)).reduce((sum, s) => sum + s.profit, 0).toLocaleString()} د.ع
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-slate-800 dark:text-slate-200">أرباح Wireless</td>
                    <td className="py-3 font-bold text-slate-700" dir="ltr">—</td>
                    <td className="py-3 font-bold text-amber-600" dir="ltr">
                      {(reportData.wirelessProfits ?? 0).toLocaleString()} د.ع
                    </td>
                  </tr>
                  </>
                )}
                {(activeTab === 'all' || activeTab === 'office') && (
                  <tr>
                    <td className="py-3 font-medium text-slate-800 dark:text-slate-200">مواد المكتب</td>
                    <td className="py-3 font-bold text-slate-700" dir="ltr">
                      {officeSales.filter(s => isDateInRange(getSaleDate(s))).reduce((sum, s) => sum + getSaleTotal(s), 0).toLocaleString()} د.ع
                    </td>
                    <td className="py-3 font-bold text-emerald-600" dir="ltr">
                      {officeSales.filter(s => isDateInRange(getSaleDate(s))).reduce((sum, s) => sum + safeNum(s?.profit), 0).toLocaleString()} د.ع
                    </td>
                  </tr>
                )}
                {(activeTab === 'all' || activeTab === 'cards') && (
                  <tr>
                    <td className="py-3 font-medium text-slate-800 dark:text-slate-200">البطاقات والمحافظ</td>
                    <td className="py-3 font-bold text-slate-700" dir="ltr">
                      {cardsReportData.cashCollected.toLocaleString()} د.ع
                    </td>
                    <td className="py-3 font-bold text-emerald-600" dir="ltr">
                      {cardsReportData.totalProfits.toLocaleString()} د.ع
                    </td>
                  </tr>
                )}
                {(activeTab === 'all' || activeTab === 'sims') && (
                  <tr>
                    <td className="py-3 font-medium text-slate-800 dark:text-slate-200">الخطوط</td>
                    <td className="py-3 font-bold text-slate-700" dir="ltr">
                      {simsReportData.cashCollected.toLocaleString()} د.ع
                    </td>
                    <td className="py-3 font-bold text-emerald-600" dir="ltr">
                      {simsReportData.totalProfits.toLocaleString()} د.ع
                    </td>
                  </tr>
                )}
                <tr className="bg-slate-50 dark:bg-slate-700/50 font-bold">
                  <td className="py-3 text-slate-800 dark:text-white">الإجمالي</td>
                  <td className="py-3 text-slate-800 dark:text-white" dir="ltr">
                    {(
                      (activeTab === 'all' || activeTab === 'internet' ? materialSales.filter(s => isDateInRange(s?.date ?? "")).reduce((sum, s) => sum + safeNum(s?.totalAmount ?? s?.total_amount), 0) : 0) +
                      (activeTab === 'all' || activeTab === 'office' ? officeReportData.cashCollected : 0) +
                      (activeTab === 'all' || activeTab === 'cards' ? cardsReportData.cashCollected : 0)
                    ).toLocaleString()} د.ع
                  </td>
                  <td className="py-3 text-emerald-600" dir="ltr">
                    {reportData.totalProfits.toLocaleString()} د.ع
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {(activeTab === 'all' || activeTab === 'office' || activeTab === 'sims') && (
            <div className="mt-8">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Smartphone size={20} className="text-indigo-600" />
                تفاصيل مبيعات الخطوط (ضمن قسم المكتب)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-rose-50 p-4 rounded-lg border border-rose-200">
                  <p className="text-sm text-rose-600 font-medium mb-1">أرباح خطوط آسيا</p>
                  <p className="text-xl font-bold text-rose-700" dir="ltr">{simsReportData.asiaProfit.toLocaleString()} د.ع</p>
                </div>
                <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-600 font-medium mb-1">أرباح خطوط زين</p>
                  <p className="text-xl font-bold text-amber-700" dir="ltr">{simsReportData.zainProfit.toLocaleString()} د.ع</p>
                </div>
              </div>
              
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-slate-600 text-sm">
                    <th className="py-3 font-medium">الباقة</th>
                    <th className="py-3 font-medium">النوع</th>
                    <th className="py-3 font-medium text-center">العدد المباع</th>
                    <th className="py-3 font-medium">إجمالي العمولات</th>
                    <th className="py-3 font-medium">إجمالي الراجع JB</th>
                    <th className="py-3 font-medium">إجمالي الأرباح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {Object.entries(simsReportData.packageStats).map(([pkgId, statsObj]) => {
                    const stats = statsObj as { count: number, commission: number, jbReturn: number, profit: number };
                    const pkg = simPackages.find(p => p.id === Number(pkgId));
                    if (!pkg) return null;
                    return (
                      <tr key={pkgId}>
                        <td className="py-3 font-medium text-slate-800 dark:text-slate-200">{pkg.name}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${pkg.type === 'asia' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {pkg.type === 'asia' ? 'آسيا' : 'زين'}
                          </span>
                        </td>
                        <td className="py-3 font-bold text-slate-700 text-center" dir="ltr">{stats.count}</td>
                        <td className="py-3 text-rose-600" dir="ltr">{stats.commission.toLocaleString()}</td>
                        <td className="py-3 text-emerald-600" dir="ltr">{stats.jbReturn.toLocaleString()}</td>
                        <td className="py-3 font-bold text-indigo-600 dark:text-indigo-400" dir="ltr">{stats.profit.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  {Object.keys(simsReportData.packageStats).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-500">لا توجد مبيعات خطوط في هذه الفترة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {(activeTab === 'all' || activeTab === 'cards') && (
            <div className="mt-8">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Wallet size={20} className="text-indigo-600" />
                أرصدة المحافظ والبطاقات
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">رصيد محفظة سويج</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-white" dir="ltr">{swigBalance.toLocaleString()} د.ع</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">رصيد محفظة كي كارد</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-white" dir="ltr">{qiBalance.toLocaleString()} د.ع</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">البطاقات المتوفرة</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-white" dir="ltr">{cardInventoryCount} بطاقة</p>
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'all' || activeTab === 'partners') && (
            <div className="mt-8">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Users size={20} className="text-indigo-600" />
                حصص الشركاء والمصروفات
              </h3>
              
              <div className="bg-rose-50 dark:bg-rose-900/30 p-4 rounded-lg border border-rose-200 dark:border-rose-800 mb-6">
                <p className="text-sm text-rose-600 dark:text-rose-400 font-medium mb-1">إجمالي المصروفات للفترة المحددة</p>
                <p className="text-2xl font-bold text-rose-700 dark:text-rose-300" dir="ltr">{expensesData.toLocaleString()} د.ع</p>
              </div>

              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-slate-600 text-sm">
                    <th className="py-3 font-medium">اسم الشريك</th>
                    <th className="py-3 font-medium">القسم</th>
                    <th className="py-3 font-medium">النسبة</th>
                    <th className="py-3 font-medium">أرباح القسم</th>
                    <th className="py-3 font-medium">حصة الشريك</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {partnerShares.map(partner => (
                    <tr key={partner.id}>
                      <td className="py-3 font-medium text-slate-800 dark:text-slate-200">{partner.name}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">
                        {partner.department === 'internet' ? 'الإنترنت' : partner.department === 'office' ? 'المكتب' : 'البطاقات'}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-400" dir="ltr">{partner.percentage}%</td>
                      <td className="py-3 font-bold text-slate-700 dark:text-slate-300" dir="ltr">
                        {partner.departmentProfit.toLocaleString()} د.ع
                      </td>
                      <td className="py-3 font-bold text-indigo-600 dark:text-indigo-400" dir="ltr">
                        {partner.share.toLocaleString()} د.ع
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
