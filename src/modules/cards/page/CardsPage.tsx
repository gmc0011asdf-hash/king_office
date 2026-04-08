import { useState, useMemo } from 'react';
import { CreditCard, Wallet, Plus, ArrowDownToLine, ArrowUpFromLine, Search, ShoppingCart, X, BarChart3, DollarSign, TrendingUp, Printer } from 'lucide-react';
import { useAppContext, CardWalletTransaction, CardSale, CardPurchase } from '@/context/AppContext';
import { cardsApi } from '@/api/cards';
import { notifyPersistence } from '@/utils/persistence';
import { canAction } from '@/utils/permissions';

export default function Cards() {
  const {
    swigTransactions, setSwigTransactions,
    qiTransactions, setQiTransactions,
    cardSales, setCardSales,
    swigBalance, setSwigBalance,
    qiBalance, setQiBalance,
    cardPurchases, setCardPurchases,
    cardInventoryCount, setCardInventoryCount,
    currentPurchasePrice, setCurrentPurchasePrice,
    currentSellingPrice, setCurrentSellingPrice,
    addNotification,
    logActivity,
    systemSettings,
    currentUser
  } = useAppContext();

  const canCards = (action: string) => canAction(currentUser, 'cards', action);

  const [activeTab, setActiveTab] = useState('swig');
  const [printType, setPrintType] = useState<'full' | 'qty'>('full');
  const [isTopupModalOpen, setIsTopupModalOpen] = useState(false);
  const [isCustomerTopupModalOpen, setIsCustomerTopupModalOpen] = useState(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  
  // Transactions
  const [inventoryView, setInventoryView] = useState<'sales' | 'purchases'>('sales');

  // Form States
  const [topupAmount, setTopupAmount] = useState<number | ''>('');
  const [topupWallet, setTopupWallet] = useState<'swig' | 'ki'>('swig');
  const [topupDate, setTopupDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [customerTopupAmount, setCustomerTopupAmount] = useState<number | ''>('');
  const [customerTopupCommission, setCustomerTopupCommission] = useState<number | ''>('');
  const [customerTopupWallet, setCustomerTopupWallet] = useState<'swig' | 'ki'>('swig');
  const [customerTopupDate, setCustomerTopupDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [buyQuantity, setBuyQuantity] = useState<number | ''>('');
  const [buyPurchasePrice, setBuyPurchasePrice] = useState<number | ''>('');
  const [buySellingPrice, setBuySellingPrice] = useState<number | ''>('');
  const [buyDate, setBuyDate] = useState(new Date().toISOString().split('T')[0]);

  const [sellQuantity, setSellQuantity] = useState(1);
  const [sellDate, setSellDate] = useState(new Date().toISOString().split('T')[0]);

  // Report Filters
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');

  const openTopupModal = () => {
    setTopupWallet(activeTab === 'ki' ? 'ki' : 'swig');
    setTopupDate(new Date().toISOString().split('T')[0]);
    setIsTopupModalOpen(true);
  };

  const openCustomerTopupModal = () => {
    setCustomerTopupWallet(activeTab === 'ki' ? 'ki' : 'swig');
    setCustomerTopupDate(new Date().toISOString().split('T')[0]);
    setIsCustomerTopupModalOpen(true);
  };

  const handleWalletTopup = async () => {
    if (!topupAmount || topupAmount <= 0) return;
    
    try {
      const nextBalance = topupWallet === 'swig' ? swigBalance + Number(topupAmount) : qiBalance + Number(topupAmount);
      const result = await cardsApi.createWalletTransaction({
        walletType: topupWallet === 'swig' ? 'swig' : 'qi',
        type: 'topup_wallet',
        amount: Number(topupAmount),
        commission: 0,
        total: Number(topupAmount),
        date: topupDate,
        status: 'ناجح',
        balanceAfter: nextBalance,
      });

      if (!result.ok || !result.data) { notifyPersistence(result); return; }
      const newTx = result.data as CardWalletTransaction;
      if (topupWallet === 'swig') {
        setSwigBalance(nextBalance);
        setSwigTransactions([newTx, ...swigTransactions]);
      } else if (topupWallet === 'ki') {
        setQiBalance(nextBalance);
        setQiTransactions([newTx, ...qiTransactions]);
      }
      const walletLabel = topupWallet === 'swig' ? 'Switch' : 'Qi';
      addNotification('شحن محفظة', `تم شحن محفظة ${walletLabel} بمبلغ ${Number(topupAmount).toLocaleString()} د.ع`, 'info');
      logActivity?.('cards', 'topup_wallet', `شحن محفظة ${walletLabel} بمبلغ ${Number(topupAmount).toLocaleString()} د.ع`);
      notifyPersistence(result);

      setTopupAmount('');
      setIsTopupModalOpen(false);
    } catch (error) {
      console.error("Failed to topup wallet", error);
      alert("حدث خطأ أثناء شحن المحفظة");
    }
  };

  const handleCustomerTopup = async () => {
    if (!customerTopupAmount || customerTopupAmount <= 0) return;
    
    const amount = Number(customerTopupAmount);
    const commission = Number(customerTopupCommission) || 0;
    
    const availableBalance = customerTopupWallet === 'swig' ? swigBalance : qiBalance;
    if (availableBalance < amount) {
      alert(`لا يمكن تعبئة الزبون خارج نطاق المحفظة. الرصيد المتاح: ${availableBalance.toLocaleString()} د.ع`);
      return;
    }

    try {
      const nextBalance = customerTopupWallet === 'swig' ? swigBalance - amount : qiBalance - amount;
      const result = await cardsApi.createWalletTransaction({
        walletType: customerTopupWallet === 'swig' ? 'swig' : 'qi',
        type: 'topup_customer',
        amount: amount,
        commission: commission,
        total: amount + commission,
        date: customerTopupDate,
        status: 'ناجح',
        balanceAfter: nextBalance,
      });
      if (!result.ok || !result.data) { notifyPersistence(result); return; }
      const newTx = result.data as CardWalletTransaction;

      if (customerTopupWallet === 'swig') {
        const newBalance = nextBalance;
        setSwigBalance(newBalance);
        setSwigTransactions([newTx, ...swigTransactions]);
        if (newBalance <= systemSettings.swigThreshold) {
          addNotification('تنبيه محفظة Switch', `رصيد محفظة Switch منخفض (${newBalance.toLocaleString()})`, 'alert');
        }
      } else if (customerTopupWallet === 'ki') {
        const newBalance = qiBalance - amount;
        setQiBalance(newBalance);
        setQiTransactions([newTx, ...qiTransactions]);
        if (newBalance <= systemSettings.qiThreshold) {
          addNotification('تنبيه محفظة Qi', `رصيد محفظة Qi منخفض (${newBalance.toLocaleString()})`, 'alert');
        }
      }

      const walletLabel = customerTopupWallet === 'swig' ? 'Switch' : 'Qi';
      addNotification('شحن زبون', `تم شحن زبون عبر محفظة ${walletLabel} بمبلغ ${amount.toLocaleString()} د.ع`, 'info');
      logActivity?.('cards', 'topup_customer', `شحن زبون عبر محفظة ${walletLabel} بمبلغ ${amount.toLocaleString()} د.ع`);
      notifyPersistence(result);
      setCustomerTopupAmount('');
      setCustomerTopupCommission('');
      setCustomerTopupDate(new Date().toISOString().split('T')[0]);
      setIsCustomerTopupModalOpen(false);
    } catch (error) {
      console.error("Failed to topup customer", error);
      alert("حدث خطأ أثناء شحن الزبون");
    }
  };

  const handleBuyCards = async () => {
    if (!buyQuantity || !buyPurchasePrice || !buySellingPrice) return;
    const purchase = Number(buyPurchasePrice);
    const selling = Number(buySellingPrice);
    if (selling <= purchase) {
      alert('سعر البيع يجب أن يكون أعلى من سعر الشراء');
      return;
    }
    try {
      const result = await cardsApi.createPurchase({
        quantity: Number(buyQuantity),
        purchasePrice: Number(buyPurchasePrice),
        sellingPrice: Number(buySellingPrice),
        totalCost: Number(buyQuantity) * Number(buyPurchasePrice),
        date: buyDate
      });
      if (!result.ok || !result.data) { notifyPersistence(result); return; }
      const raw = result.data as CardPurchase & { totalAmount?: number; total_amount?: number };
      const newPurchase: CardPurchase = {
        ...raw,
        totalCost: Number(raw.totalCost ?? raw.totalAmount ?? raw.total_amount ?? (Number(buyQuantity) * Number(buyPurchasePrice)))
      };

      setCardInventoryCount(prev => prev + Number(buyQuantity));
      setCurrentPurchasePrice(Number(buyPurchasePrice));
      setCurrentSellingPrice(Number(buySellingPrice));
      setCardPurchases([newPurchase, ...cardPurchases]);
      addNotification('شراء مخزون بطاقات', `تم شراء ${buyQuantity} بطاقة بمبلغ ${(Number(buyQuantity) * Number(buyPurchasePrice)).toLocaleString()} د.ع`, 'info');
      logActivity?.('cards', 'buy_cards', `شراء ${buyQuantity} بطاقة بمبلغ ${(Number(buyQuantity) * Number(buyPurchasePrice)).toLocaleString()} د.ع`);
      notifyPersistence(result);

      setBuyQuantity('');
      setBuyPurchasePrice('');
      setBuySellingPrice('');
      setBuyDate(new Date().toISOString().split('T')[0]);
      setIsBuyModalOpen(false);
    } catch (error) {
      console.error("Failed to buy cards", error);
      alert("حدث خطأ أثناء شراء البطاقات");
    }
  };

  const handleSellCard = async () => {
    if (sellQuantity <= 0) return;
    if (cardInventoryCount < sellQuantity) {
      alert('الكمية المتوفرة غير كافية');
      return;
    }

    const profit = sellQuantity * (currentSellingPrice - currentPurchasePrice);

    try {
      const result = await cardsApi.createSale({
        quantity: sellQuantity,
        sellingPrice: currentSellingPrice,
        total: currentSellingPrice * sellQuantity,
        profit: profit,
        date: sellDate
      });
      if (!result.ok || !result.data) { notifyPersistence(result); return; }
      const rawSale = result.data as CardSale & { totalAmount?: number; total_amount?: number };
      const newSale: CardSale = {
        ...rawSale,
        total: Number(rawSale.total ?? rawSale.totalAmount ?? rawSale.total_amount ?? (currentSellingPrice * sellQuantity))
      };

      setCardInventoryCount(prev => prev - sellQuantity);
      setCardSales([newSale, ...cardSales]);
      notifyPersistence(result);

      addNotification('عملية بيع بطاقات', `تم بيع ${sellQuantity} بطاقة بنجاح`, 'info');
      logActivity?.('cards', 'sell_cards', `بيع ${sellQuantity} بطاقة`);
      
      if (cardInventoryCount - sellQuantity <= systemSettings.cardsThreshold) {
        addNotification('تنبيه مخزون البطاقات', `مخزون البطاقات منخفض (المتبقي ${cardInventoryCount - sellQuantity})`, 'alert');
      }

      setSellQuantity(1);
      setSellDate(new Date().toISOString().split('T')[0]);
      setIsSellModalOpen(false);
    } catch (error) {
      console.error("Failed to sell card", error);
      alert("حدث خطأ أثناء بيع البطاقات");
    }
  };

  const isDateInRange = (dateStr: string) => {
    if (!reportStartDate && !reportEndDate) return true;
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    if (reportStartDate) {
      const start = new Date(reportStartDate);
      start.setHours(0, 0, 0, 0);
      if (date < start) return false;
    }
    if (reportEndDate) {
      const end = new Date(reportEndDate);
      end.setHours(23, 59, 59, 999);
      if (date > end) return false;
    }
    return true;
  };

  const filteredSwigTransactions = useMemo(() => swigTransactions.filter(tx => isDateInRange(tx.date)), [swigTransactions, reportStartDate, reportEndDate]);
  const filteredQiTransactions = useMemo(() => qiTransactions.filter(tx => isDateInRange(tx.date)), [qiTransactions, reportStartDate, reportEndDate]);
  const filteredCardSales = useMemo(() => cardSales.filter(sale => isDateInRange(sale.date)), [cardSales, reportStartDate, reportEndDate]);
  const filteredCardPurchases = useMemo(() => cardPurchases.filter(purchase => isDateInRange(purchase.date)), [cardPurchases, reportStartDate, reportEndDate]);

  const reportData = useMemo(() => {
    let swigCommissions = 0;
    let swigCollected = 0;
    let qiCommissions = 0;
    let qiCollected = 0;
    let cardsTotal = 0;
    let cardsProfit = 0;

    filteredSwigTransactions.forEach(tx => {
      if (tx.type === 'topup_customer') {
        swigCommissions += tx.commission;
        swigCollected += tx.amount + tx.commission;
      }
    });

    filteredQiTransactions.forEach(tx => {
      if (tx.type === 'topup_customer') {
        qiCommissions += tx.commission;
        qiCollected += tx.amount + tx.commission;
      }
    });

    filteredCardSales.forEach(sale => {
      cardsTotal += sale.total;
      cardsProfit += sale.profit;
    });

    const salesByDateObj: Record<string, number> = {};
    filteredCardSales.forEach(sale => {
      salesByDateObj[sale.date] = (salesByDateObj[sale.date] || 0) + sale.quantity;
    });
    const salesByDate = Object.entries(salesByDateObj)
      .map(([date, quantity]) => ({ date, quantity }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      swigCommissions,
      swigCollected,
      qiCommissions,
      qiCollected,
      cardsTotal,
      cardsProfit,
      totalCollected: swigCollected + qiCollected + cardsTotal,
      totalProfit: swigCommissions + qiCommissions + cardsProfit,
      salesByDate
    };
  }, [filteredSwigTransactions, filteredQiTransactions, filteredCardSales]);

  const currentTransactions = activeTab === 'swig' ? filteredSwigTransactions : activeTab === 'ki' ? filteredQiTransactions : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">قسم البطاقات</h1>
          <p className="text-slate-500 dark:text-slate-300 text-sm mt-1">إدارة محافظ Switch و Qi ومبيعات البطاقات</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(activeTab === 'swig' || activeTab === 'ki') && (
            <button onClick={openTopupModal} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
              <ArrowDownToLine size={16} />
              <span>تعبئة رصيد</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto sticky top-0 bg-slate-50 dark:bg-slate-900 z-30 pt-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 print:hidden">
        <button
          onClick={() => setActiveTab('swig')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'swig' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          محفظة Switch
        </button>
        <button
          onClick={() => setActiveTab('ki')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'ki' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          محفظة Qi
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'inventory' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          مخزون البطاقات
        </button>
        <button
          onClick={() => setActiveTab('swig-cards-report')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'swig-cards-report' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          تقرير Switch والبطاقات
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'reports' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          التقارير
        </button>
      </div>

      {/* Global Date Filter & Print */}
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
          className="w-full sm:w-auto bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 px-6 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          مسح الفلاتر
        </button>
        <button 
          onClick={() => {
            setPrintType('full');
            setTimeout(() => {
              window.print();
            }, 100);
          }}
          className="w-full sm:w-auto bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Printer size={16} />
          {activeTab === 'inventory' ? 'طباعة التقرير التفصيلي' : 'طباعة التقرير'}
        </button>
        {activeTab === 'inventory' && (
          <button 
            onClick={() => {
              setPrintType('qty');
              setTimeout(() => {
                window.print();
              }, 100);
            }}
            className="w-full sm:w-auto bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <Printer size={16} />
            تقرير الأعداد فقط
          </button>
        )}
      </div>

      {/* Print Header */}
      <div className="hidden print:block mb-8 border-b border-slate-200 pb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900">مكتب الملك</h1>
            <p className="text-slate-500 mt-1 text-lg">
              {activeTab === 'swig' ? 'تقرير محفظة Switch' : 
               activeTab === 'ki' ? 'تقرير محفظة Qi' : 
               activeTab === 'inventory' ? (printType === 'qty' ? 'تقرير أعداد البطاقات' : 'تقرير مخزون البطاقات الشامل') : 
               activeTab === 'swig-cards-report' ? 'تقرير Switch والبطاقات المستقل' : 'التقرير الشامل'}
            </p>
            {activeTab === 'swig-cards-report' && (
              <p className="text-indigo-700 font-bold mt-2 text-xl">{systemSettings.cardsReportName || systemSettings.cards_report_name || 'قضاء علي الغربي SWG70'}</p>
            )}
          </div>
          <div className="text-left" dir="ltr">
            <p className="text-sm text-slate-500">تاريخ الطباعة: {new Date().toLocaleDateString('ar-IQ')}</p>
            {(reportStartDate || reportEndDate) && (
              <p className="text-sm text-slate-500 mt-1">
                الفترة: {reportStartDate || 'البداية'} إلى {reportEndDate || 'النهاية'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'swig' || activeTab === 'ki' || activeTab === 'inventory' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Wallet Summary */}
          <div className="lg:col-span-1 space-y-6">
            <div className={`print:bg-none print:bg-white print:border print:border-slate-300 print:shadow-none rounded-2xl p-6 text-white print:text-slate-800 shadow-lg relative overflow-hidden ${
              (activeTab === 'swig' && swigBalance <= systemSettings.swigThreshold) ||
              (activeTab === 'ki' && qiBalance <= systemSettings.qiThreshold) ||
              (activeTab === 'inventory' && cardInventoryCount <= systemSettings.cardsThreshold)
                ? 'bg-gradient-to-br from-red-600 to-red-800'
                : 'bg-gradient-to-br from-slate-800 to-slate-900'
            }`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl print:hidden"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-500/20 rounded-full -ml-8 -mb-8 blur-xl print:hidden"></div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <Wallet className="text-indigo-300 print:text-slate-700" />
                    <span className="font-medium text-slate-300 print:text-slate-800">
                      {activeTab === 'swig' ? 'محفظة Switch الرئيسية' : activeTab === 'ki' ? 'محفظة Qi الرئيسية' : 'إجمالي البطاقات'}
                    </span>
                  </div>
                  <div className="text-xs bg-white/10 print:bg-slate-100 print:text-slate-600 print:border print:border-slate-200 px-2 py-1 rounded text-slate-300">نشط</div>
                </div>
                
                <div className="mb-6">
                  <p className="text-sm text-slate-400 print:text-slate-600 mb-1">الرصيد المتاح</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold tracking-tight print:text-slate-900">
                      {activeTab === 'swig' ? swigBalance.toLocaleString() : activeTab === 'ki' ? qiBalance.toLocaleString() : cardInventoryCount.toLocaleString()}
                    </span>
                    <span className="text-indigo-300 print:text-slate-600">{activeTab === 'inventory' ? 'بطاقة متوفرة' : 'د.ع'}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 print:hidden">
                  {activeTab !== 'inventory' && (
                    <>
                      {((activeTab === 'swig' && canCards('topupSwig')) || (activeTab === 'ki' && canCards('topupQi'))) && (
                        <button onClick={openTopupModal} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                          <ArrowDownToLine size={16} />
                          <span>تعبئة المحفظة الرئيسية</span>
                        </button>
                      )}
                      {((activeTab === 'swig' && canCards('topupCustomerSwig')) || (activeTab === 'ki' && canCards('topupCustomerQi'))) && (
                        <button onClick={openCustomerTopupModal} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                          <ArrowUpFromLine size={16} />
                          <span>تعبئة للزبون</span>
                        </button>
                      )}
                    </>
                  )}
                  {activeTab === 'inventory' && (
                    <>
                      {canCards('sellCards') && <button onClick={() => setIsSellModalOpen(true)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                        <ShoppingCart size={16} />
                        <span>بيع بطاقات</span>
                      </button>}
                      {canCards('buyCards') && <button onClick={() => setIsBuyModalOpen(true)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                        <Plus size={16} />
                        <span>شراء مخزون</span>
                      </button>}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm print:shadow-none print:bg-white ${(activeTab === 'inventory' && printType === 'qty') ? 'print:hidden' : ''}`}>
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 print:text-slate-800">
                {reportStartDate || reportEndDate ? 'ملخص الأرباح (للفترة المحددة)' : 'ملخص الأرباح (هذا الشهر)'}
              </h3>
              <div className="space-y-4">
                {activeTab === 'swig' && (
                  <>
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-600">
                      <span className="text-sm text-slate-500 dark:text-slate-400">المبالغ المستحصلة</span>
                      <span className="font-bold text-slate-800 dark:text-white">{reportData.swigCollected.toLocaleString()} د.ع</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-600">
                      <span className="text-sm text-slate-500 dark:text-slate-400">عمولات محفظة Switch</span>
                      <span className="font-bold text-emerald-600">+{reportData.swigCommissions.toLocaleString()} د.ع</span>
                    </div>
                  </>
                )}
                {activeTab === 'ki' && (
                  <>
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-600">
                      <span className="text-sm text-slate-500 dark:text-slate-400">المبالغ المستحصلة</span>
                      <span className="font-bold text-slate-800 dark:text-white">{reportData.qiCollected.toLocaleString()} د.ع</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-600">
                      <span className="text-sm text-slate-500 dark:text-slate-400">عمولات محفظة Qi</span>
                      <span className="font-bold text-emerald-600">+{reportData.qiCommissions.toLocaleString()} د.ع</span>
                    </div>
                  </>
                )}
                {activeTab === 'inventory' && (
                  <>
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-600">
                      <span className="text-sm text-slate-500 dark:text-slate-400">المبالغ المستحصلة (المبيعات)</span>
                      <span className="font-bold text-slate-800 dark:text-white">{reportData.cardsTotal.toLocaleString()} د.ع</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-600">
                      <span className="text-sm text-slate-500 dark:text-slate-400">أرباح البطاقات</span>
                      <span className="font-bold text-emerald-600">+{reportData.cardsProfit.toLocaleString()} د.ع</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800 dark:text-white">إجمالي الأرباح</span>
                  <span className="font-bold text-indigo-600">
                    {activeTab === 'swig' ? reportData.swigCommissions.toLocaleString() : 
                     activeTab === 'ki' ? reportData.qiCommissions.toLocaleString() : 
                     reportData.cardsProfit.toLocaleString()} د.ع
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className={`lg:col-span-2 ${(activeTab === 'inventory' && printType === 'qty') ? 'print:hidden' : ''}`}>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm print:shadow-none overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="font-bold text-slate-800 dark:text-white">
                {activeTab === 'inventory' ? 'سجل البطاقات' : 'سجل الحركات'}
              </h3>
              {activeTab === 'inventory' && (
                <div className="flex gap-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg print:hidden">
                  <button 
                    onClick={() => setInventoryView('sales')} 
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${inventoryView === 'sales' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100'}`}
                  >
                    المبيعات
                  </button>
                  <button 
                    onClick={() => setInventoryView('purchases')} 
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${inventoryView === 'purchases' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100'}`}
                  >
                    المشتريات
                  </button>
                </div>
              )}
              <div className="flex gap-2 print:hidden">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                  <input 
                    type="text" 
                    placeholder="بحث..." 
                    className="pl-3 pr-9 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 w-full sm:w-48"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-right">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                  {activeTab !== 'inventory' ? (
                    <tr>
                      <th className="px-4 py-3 font-medium">رقم المرجع</th>
                      <th className="px-4 py-3 font-medium">النوع</th>
                      <th className="px-4 py-3 font-medium">المبلغ</th>
                      <th className="px-4 py-3 font-medium">العمولة/الربح</th>
                      <th className="px-4 py-3 font-medium">المبلغ المستحصل</th>
                      <th className="px-4 py-3 font-medium">التاريخ</th>
                      <th className="px-4 py-3 font-medium">الحالة</th>
                    </tr>
                  ) : inventoryView === 'sales' ? (
                    <tr>
                      <th className="px-4 py-3 font-medium">رقم المرجع</th>
                      <th className="px-4 py-3 font-medium">العدد</th>
                      <th className="px-4 py-3 font-medium">سعر البيع</th>
                      <th className="px-4 py-3 font-medium">المبلغ المستحصل</th>
                      <th className="px-4 py-3 font-medium">الربح</th>
                      <th className="px-4 py-3 font-medium">التاريخ</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="px-4 py-3 font-medium">رقم المرجع</th>
                      <th className="px-4 py-3 font-medium">العدد</th>
                      <th className="px-4 py-3 font-medium">سعر الشراء</th>
                      <th className="px-4 py-3 font-medium">سعر البيع</th>
                      <th className="px-4 py-3 font-medium">التكلفة الإجمالية</th>
                      <th className="px-4 py-3 font-medium">التاريخ</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                  {activeTab !== 'inventory' ? (
                    currentTransactions.length > 0 ? (
                      currentTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">TRX-{tx.id.toString().slice(-6)}</td>
                          <td className="px-4 py-3 text-slate-800">
                            {tx.type === 'topup_wallet' ? 'تعبئة المحفظة الرئيسية' : 'تعبئة للزبون'}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800" dir="ltr">{tx.amount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-emerald-600 font-medium" dir="ltr">+{tx.commission.toLocaleString()}</td>
                          <td className="px-4 py-3 font-bold text-slate-800" dir="ltr">{(tx.amount + tx.commission).toLocaleString()}</td>
                          <td className="px-4 py-3 text-slate-500">{tx.date}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد حركات مسجلة</td>
                      </tr>
                    )
                  ) : inventoryView === 'sales' ? (
                    filteredCardSales.length > 0 ? (
                      filteredCardSales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">SALE-{sale.id.toString().slice(-6)}</td>
                          <td className="px-4 py-3 text-slate-800">{sale.quantity}</td>
                          <td className="px-4 py-3 text-slate-800" dir="ltr">{sale.sellingPrice.toLocaleString()}</td>
                          <td className="px-4 py-3 font-medium text-slate-800" dir="ltr">{sale.total.toLocaleString()}</td>
                          <td className="px-4 py-3 text-emerald-600 font-medium" dir="ltr">+{sale.profit.toLocaleString()}</td>
                          <td className="px-4 py-3 text-slate-500">{sale.date}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد مبيعات مسجلة</td>
                      </tr>
                    )
                  ) : (
                    filteredCardPurchases.length > 0 ? (
                      filteredCardPurchases.map((purchase) => (
                        <tr key={purchase.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">PUR-{purchase.id.toString().slice(-6)}</td>
                          <td className="px-4 py-3 text-slate-800">{purchase.quantity}</td>
                          <td className="px-4 py-3 text-slate-800" dir="ltr">{purchase.purchasePrice.toLocaleString()}</td>
                          <td className="px-4 py-3 text-slate-800" dir="ltr">{purchase.sellingPrice.toLocaleString()}</td>
                          <td className="px-4 py-3 font-medium text-slate-800" dir="ltr">{purchase.totalCost.toLocaleString()}</td>
                          <td className="px-4 py-3 text-slate-500">{purchase.date}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد مشتريات مسجلة</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>إجمالي السجلات: {activeTab !== 'inventory' ? currentTransactions.length : (inventoryView === 'sales' ? filteredCardSales.length : filteredCardPurchases.length)}</span>
            </div>
          </div>
        </div>

        {/* Print-only Inventory Sales by Date */}
        {activeTab === 'inventory' && (
          <div className={`${printType === 'qty' ? 'print:block' : 'print:hidden'} hidden lg:col-span-2`}>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-white">حركات البيع حسب الأيام</h3>
              </div>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-right">
                  <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                    <tr>
                      <th className="px-4 py-3 font-medium">التاريخ</th>
                      <th className="px-4 py-3 font-medium">عدد البطاقات المباعة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                    {reportData.salesByDate.length > 0 ? (
                      reportData.salesByDate.map((daySale, index) => (
                        <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="px-4 py-3 text-slate-800">{daySale.date}</td>
                          <td className="px-4 py-3 font-bold text-slate-800">{daySale.quantity}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد مبيعات مسجلة</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm font-bold text-slate-800 dark:text-white">
                <span>إجمالي البطاقات المباعة:</span>
                <span>{reportData.salesByDate.reduce((sum, item) => sum + item.quantity, 0)} بطاقة</span>
              </div>
            </div>
          </div>
        )}
        </div>
      ) : activeTab === 'swig-cards-report' ? (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-center print:hidden mb-6 gap-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">تقرير Switch والبطاقات المستقل</h2>
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white px-6 py-2 rounded-full shadow-md flex items-center gap-3">
              <span className="font-bold tracking-wide">{systemSettings.cardsReportName || systemSettings.cards_report_name || 'قضاء علي الغربي SWG70'}</span>
              <span className="bg-white/20 px-2.5 py-1 rounded-md text-sm font-mono font-bold tracking-wider">SWG70</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-indigo-50 dark:bg-indigo-900/30 print:bg-white p-6 rounded-xl border border-indigo-100 dark:border-indigo-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-indigo-600 print:text-slate-700">
                <Wallet size={28} />
              </div>
              <p className="text-sm font-bold text-indigo-800 print:text-slate-800 mb-2">الرصيد المتاح (Switch فقط)</p>
              <p className="text-2xl font-black text-indigo-600 print:text-slate-900" dir="ltr">{swigBalance.toLocaleString()}</p>
              <p className="text-xs text-indigo-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>
            
            <div className="bg-emerald-50 dark:bg-emerald-900/30 print:bg-white p-6 rounded-xl border border-emerald-100 dark:border-emerald-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-emerald-600 print:text-slate-700">
                <CreditCard size={28} />
              </div>
              <p className="text-sm font-bold text-emerald-800 print:text-slate-800 mb-2">البطاقات المتاحة</p>
              <p className="text-2xl font-black text-emerald-600 print:text-slate-900" dir="ltr">{cardInventoryCount.toLocaleString()}</p>
              <p className="text-xs text-emerald-600/70 print:text-slate-500 mt-1 font-medium">بطاقة</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">مبيعات البطاقات حسب التاريخ (أعداد فقط)</h3>
            </div>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-right">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">التاريخ</th>
                    <th className="px-4 py-3 font-medium">العدد المباع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.salesByDate.length > 0 ? (
                    reportData.salesByDate.map((daySale, index) => (
                      <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{daySale.date}</td>
                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">{daySale.quantity}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد مبيعات مسجلة في هذه الفترة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm font-bold text-slate-800 dark:text-white">
              <span>إجمالي البطاقات المباعة:</span>
              <span>{reportData.salesByDate.reduce((sum, item) => sum + item.quantity, 0)} بطاقة</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center print:hidden mb-6">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">التقرير الشامل</h2>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 print:grid-cols-3 gap-6">
            <div className="bg-indigo-50 dark:bg-indigo-900/30 print:bg-white p-6 rounded-xl border border-indigo-100 dark:border-indigo-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-indigo-600 print:text-slate-700">
                <Wallet size={28} />
              </div>
              <p className="text-sm font-bold text-indigo-800 print:text-slate-800 mb-2">المبالغ المستحصلة (Switch)</p>
              <p className="text-2xl font-black text-indigo-600 print:text-slate-900" dir="ltr">{reportData.swigCollected.toLocaleString()}</p>
              <p className="text-xs text-indigo-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>
            
            <div className="bg-emerald-50 dark:bg-emerald-900/30 print:bg-white p-6 rounded-xl border border-emerald-100 dark:border-emerald-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-emerald-600 print:text-slate-700">
                <Wallet size={28} />
              </div>
              <p className="text-sm font-bold text-emerald-800 print:text-slate-800 mb-2">المبالغ المستحصلة (Qi)</p>
              <p className="text-2xl font-black text-emerald-600 print:text-slate-900" dir="ltr">{reportData.qiCollected.toLocaleString()}</p>
              <p className="text-xs text-emerald-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/30 print:bg-white p-6 rounded-xl border border-amber-100 dark:border-amber-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-amber-600 print:text-slate-700">
                <CreditCard size={28} />
              </div>
              <p className="text-sm font-bold text-amber-800 print:text-slate-800 mb-2">المبالغ المستحصلة (البطاقات)</p>
              <p className="text-2xl font-black text-amber-600 print:text-slate-900" dir="ltr">{reportData.cardsTotal.toLocaleString()}</p>
              <p className="text-xs text-amber-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-900/30 print:bg-white p-6 rounded-xl border border-indigo-100 dark:border-indigo-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-indigo-600 print:text-slate-700">
                <TrendingUp size={28} />
              </div>
              <p className="text-sm font-bold text-indigo-800 print:text-slate-800 mb-2">أرباح محفظة Switch</p>
              <p className="text-2xl font-black text-indigo-600 print:text-slate-900" dir="ltr">{reportData.swigCommissions.toLocaleString()}</p>
              <p className="text-xs text-indigo-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>
            
            <div className="bg-emerald-50 dark:bg-emerald-900/30 print:bg-white p-6 rounded-xl border border-emerald-100 dark:border-emerald-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-emerald-600 print:text-slate-700">
                <TrendingUp size={28} />
              </div>
              <p className="text-sm font-bold text-emerald-800 print:text-slate-800 mb-2">أرباح محفظة Qi</p>
              <p className="text-2xl font-black text-emerald-600 print:text-slate-900" dir="ltr">{reportData.qiCommissions.toLocaleString()}</p>
              <p className="text-xs text-emerald-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/30 print:bg-white p-6 rounded-xl border border-amber-100 dark:border-amber-800 print:border-slate-300 text-center">
              <div className="flex justify-center mb-3 text-amber-600 print:text-slate-700">
                <TrendingUp size={28} />
              </div>
              <p className="text-sm font-bold text-amber-800 print:text-slate-800 mb-2">أرباح البطاقات</p>
              <p className="text-2xl font-black text-amber-600 print:text-slate-900" dir="ltr">{reportData.cardsProfit.toLocaleString()}</p>
              <p className="text-xs text-amber-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>

            <div className="bg-slate-100 dark:bg-slate-700 print:bg-white p-6 rounded-xl border border-slate-200 dark:border-slate-600 print:border-slate-300 text-center md:col-span-1">
              <div className="flex justify-center mb-3 text-slate-600 print:text-slate-700">
                <Wallet size={28} />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">إجمالي المبالغ المستحصلة</p>
              <p className="text-3xl font-black text-slate-700 dark:text-slate-200 print:text-slate-900" dir="ltr">{reportData.totalCollected.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1 font-medium">د.ع</p>
            </div>

            <div className="bg-purple-50 dark:bg-purple-900/30 print:bg-white p-6 rounded-xl border border-purple-100 dark:border-purple-800 print:border-slate-300 text-center md:col-span-2">
              <div className="flex justify-center mb-3 text-purple-600 print:text-slate-700">
                <TrendingUp size={28} />
              </div>
              <p className="text-sm font-bold text-purple-800 print:text-slate-800 mb-2">إجمالي الأرباح</p>
              <p className="text-3xl font-black text-purple-600 print:text-slate-900" dir="ltr">{reportData.totalProfit.toLocaleString()}</p>
              <p className="text-xs text-purple-600/70 print:text-slate-500 mt-1 font-medium">د.ع</p>
            </div>
          </div>

          {/* Detailed Tables */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                <h3 className="font-bold text-slate-800 dark:text-white">تفاصيل محفظة Switch</h3>
              </div>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-right">
                  <thead className="bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium">التاريخ</th>
                      <th className="px-4 py-3 font-medium">النوع</th>
                      <th className="px-4 py-3 font-medium">المبلغ</th>
                      <th className="px-4 py-3 font-medium">العمولة</th>
                      <th className="px-4 py-3 font-medium">المبلغ المستحصل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                    {filteredSwigTransactions.length > 0 ? (
                      filteredSwigTransactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{tx.date}</td>
                          <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{tx.type === 'topup_wallet' ? 'تعبئة محفظة' : 'تعبئة زبون'}</td>
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200" dir="ltr">{tx.amount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-medium" dir="ltr">+{tx.commission.toLocaleString()}</td>
                          <td className="px-4 py-3 font-bold text-slate-800 dark:text-white" dir="ltr">{(tx.amount + tx.commission).toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد حركات</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                <h3 className="font-bold text-slate-800 dark:text-white">تفاصيل محفظة Qi</h3>
              </div>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-right">
                  <thead className="bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium">التاريخ</th>
                      <th className="px-4 py-3 font-medium">النوع</th>
                      <th className="px-4 py-3 font-medium">المبلغ</th>
                      <th className="px-4 py-3 font-medium">العمولة</th>
                      <th className="px-4 py-3 font-medium">المبلغ المستحصل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                    {filteredQiTransactions.length > 0 ? (
                      filteredQiTransactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{tx.date}</td>
                          <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{tx.type === 'topup_wallet' ? 'تعبئة محفظة' : 'تعبئة زبون'}</td>
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200" dir="ltr">{tx.amount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-medium" dir="ltr">+{tx.commission.toLocaleString()}</td>
                          <td className="px-4 py-3 font-bold text-slate-800 dark:text-white" dir="ltr">{(tx.amount + tx.commission).toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد حركات</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                <h3 className="font-bold text-slate-800 dark:text-white">تفاصيل مبيعات البطاقات</h3>
              </div>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-right">
                  <thead className="bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium">التاريخ</th>
                      <th className="px-4 py-3 font-medium">العدد</th>
                      <th className="px-4 py-3 font-medium">المبلغ المستحصل</th>
                      <th className="px-4 py-3 font-medium">الربح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                    {filteredCardSales.length > 0 ? (
                      filteredCardSales.map(sale => (
                        <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{sale.date}</td>
                          <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{sale.quantity}</td>
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200" dir="ltr">{sale.total.toLocaleString()}</td>
                          <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-medium" dir="ltr">+{sale.profit.toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد مبيعات</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top-up Modal */}
      {isTopupModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">تعبئة المحفظة الرئيسية</h3>
              <button onClick={() => setIsTopupModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">المحفظة</label>
                <select 
                  value={topupWallet}
                  onChange={(e) => setTopupWallet(e.target.value as 'swig' | 'ki')}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="swig">محفظة Switch</option>
                  <option value="ki">محفظة Qi</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">المبلغ (د.ع)</label>
                <input 
                  type="number" 
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(Number(e.target.value))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  placeholder="0" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">تاريخ التعبئة</label>
                <input 
                  type="date" 
                  value={topupDate}
                  onChange={(e) => setTopupDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button onClick={() => setIsTopupModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button onClick={handleWalletTopup} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">تأكيد التعبئة</button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Top-up Modal */}
      {isCustomerTopupModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">تعبئة للزبون</h3>
              <button onClick={() => setIsCustomerTopupModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">المحفظة</label>
                <select 
                  value={customerTopupWallet}
                  onChange={(e) => setCustomerTopupWallet(e.target.value as 'swig' | 'ki')}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="swig">محفظة Switch</option>
                  <option value="ki">محفظة Qi</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">مقدار التعبئة (د.ع)</label>
                <input 
                  type="number" 
                  value={customerTopupAmount}
                  onChange={(e) => setCustomerTopupAmount(Number(e.target.value))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  placeholder="0" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">العمولة (د.ع)</label>
                <input 
                  type="number" 
                  value={customerTopupCommission}
                  onChange={(e) => setCustomerTopupCommission(Number(e.target.value))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  placeholder="0" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">تاريخ التعبئة</label>
                <input 
                  type="date" 
                  value={customerTopupDate}
                  onChange={(e) => setCustomerTopupDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button onClick={() => setIsCustomerTopupModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button onClick={handleCustomerTopup} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">تأكيد التعبئة للزبون</button>
            </div>
          </div>
        </div>
      )}

      {/* Sell Card Modal */}
      {isSellModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">بيع بطاقات</h3>
              <button onClick={() => setIsSellModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">العدد</label>
                <input 
                  type="number" 
                  min="1"
                  value={sellQuantity}
                  onChange={(e) => setSellQuantity(parseInt(e.target.value) || 1)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">تاريخ البيع</label>
                <input 
                  type="date" 
                  value={sellDate}
                  onChange={(e) => setSellDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-slate-500 dark:text-slate-400">سعر البيع للبطاقة:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{currentSellingPrice.toLocaleString()} د.ع</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-600 pt-2 mt-2">
                  <span className="font-bold text-slate-700 dark:text-slate-300">الإجمالي:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 text-lg">{(currentSellingPrice * sellQuantity).toLocaleString()} د.ع</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button onClick={() => setIsSellModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button onClick={handleSellCard} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">إتمام البيع</button>
            </div>
          </div>
        </div>
      )}
      {/* Buy Card Modal */}
      {isBuyModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">شراء مخزون بطاقات</h3>
              <button onClick={() => setIsBuyModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">العدد</label>
                <input 
                  type="number" 
                  min="1"
                  value={buyQuantity}
                  onChange={(e) => setBuyQuantity(parseInt(e.target.value) || '')}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">سعر الشراء للبطاقة (د.ع)</label>
                <input 
                  type="number" 
                  value={buyPurchasePrice}
                  onChange={(e) => setBuyPurchasePrice(parseInt(e.target.value) || '')}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">سعر البيع للبطاقة (د.ع)</label>
                <input 
                  type="number" 
                  value={buySellingPrice}
                  onChange={(e) => setBuySellingPrice(parseInt(e.target.value) || '')}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">تاريخ الشراء</label>
                <input 
                  type="date" 
                  value={buyDate}
                  onChange={(e) => setBuyDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700 dark:text-slate-300">التكلفة الإجمالية:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 text-lg">{((Number(buyQuantity) || 0) * (Number(buyPurchasePrice) || 0)).toLocaleString()} د.ع</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button onClick={() => setIsBuyModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button onClick={handleBuyCards} className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700">إتمام الشراء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
