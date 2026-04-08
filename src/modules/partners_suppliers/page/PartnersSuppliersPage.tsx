import { useState, useMemo, useEffect } from 'react';
import { Users, Truck, FileText, Plus, Calculator, Download, Printer, ArrowUpRight, ArrowDownRight, CreditCard, X, Filter, Edit, Trash2 } from 'lucide-react';
import { useAppContext, Partner, PartnerTransaction, Supplier, SupplierTransaction } from '@/context/AppContext';
import { partnersApi } from '@/api/partners';
import { suppliersApi } from '@/api/suppliers';
import { canAction } from '@/utils/permissions';
import { IRAQ_PHONE_HINT_AR, requireIraqMobile } from '@/utils/iraqPhone';

export default function Partners() {
  const { 
    materialSales, officeSales, swigTransactions, qiTransactions, cardSales, cashbackValue, subscribers,
    partners, setPartners, partnerTransactions, setPartnerTransactions,
    suppliers, setSuppliers, supplierTransactions, setSupplierTransactions,
    addNotification,
    logActivity,
    currentUser
  } = useAppContext();
  const canPartners = (action: string) => canAction(currentUser, 'partners', action);
  const [activeTab, setActiveTab] = useState<'partners' | 'suppliers' | 'reports'>('partners');

  // --- Modals State ---
  const [isAddPartnerModalOpen, setIsAddPartnerModalOpen] = useState(false);
  const [isCalcProfitModalOpen, setIsCalcProfitModalOpen] = useState(false);
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
  const [isSupplierTxModalOpen, setIsSupplierTxModalOpen] = useState(false);

  // --- Form States ---
  const [newPartner, setNewPartner] = useState<Partial<Partner>>({ department: 'internet', joinDate: new Date().toISOString().split('T')[0] });
  const [editingPartnerId, setEditingPartnerId] = useState<number | null>(null);
  
  const [profitCalc, setProfitCalc] = useState({ partnerId: '', date: new Date().toISOString().split('T')[0], revenue: '', expenses: '' });
  
  const calculateDepartmentProfit = (department: string) => {
    let total = 0;
    if (department === 'internet') {
      const materialsProfit = materialSales.reduce((sum, sale) => sum + sale.profit, 0);
      const cashbackProfit = cashbackValue * subscribers.length;
      total = materialsProfit + cashbackProfit;
    } else if (department === 'office') {
      total = officeSales.reduce((sum, sale) => sum + sale.profit, 0);
    } else if (department === 'cards') {
      const cardProfit = cardSales.reduce((sum, sale) => sum + sale.profit, 0);
      const swigProfit = swigTransactions.filter(tx => tx.type === 'topup_customer').reduce((sum, tx) => sum + tx.commission, 0);
      const qiProfit = qiTransactions.filter(tx => tx.type === 'topup_customer').reduce((sum, tx) => sum + tx.commission, 0);
      total = cardProfit + swigProfit + qiProfit;
    }
    return total;
  };

  // Update revenue automatically when partner changes
  useEffect(() => {
    if (profitCalc.partnerId) {
      const partner = partners.find(p => p.id === Number(profitCalc.partnerId));
      if (partner) {
        const deptProfit = calculateDepartmentProfit(partner.department);
        setProfitCalc(prev => ({ ...prev, revenue: deptProfit.toString() }));
      }
    }
  }, [profitCalc.partnerId, materialSales, officeSales, swigTransactions, qiTransactions, cardSales, cashbackValue, subscribers]);

  /** إعادة جلب الموردين عند فتح التبويب إذا كانت القائمة فارغة أو بعد فشل التحميل الأولي. */
  useEffect(() => {
    if (activeTab !== 'suppliers' || !currentUser) return;
    void suppliersApi
      .getSuppliers()
      .then((list) => {
        if (Array.isArray(list)) setSuppliers(list);
      })
      .catch(() => {});
  }, [activeTab, currentUser, setSuppliers]);
  
  const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({ outstandingDebt: 0 });
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);
  
  const [supplierTx, setSupplierTx] = useState({ supplierId: '', date: new Date().toISOString().split('T')[0], type: 'payment' as 'purchase' | 'payment', amount: '', notes: '' });

  // --- Filters ---
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');

  // --- Handlers ---
  const handleAddPartner = async () => {
    if (!newPartner.name || !newPartner.percentage || !newPartner.department || !newPartner.joinDate) return;
    
    try {
      if (editingPartnerId) {
        const res = await partnersApi.updatePartner(editingPartnerId, {
          name: newPartner.name,
          join_date: newPartner.joinDate,
          percentage: Number(newPartner.percentage),
          department: newPartner.department as 'internet' | 'office' | 'cards'
        });
        const updatedPartner = (res as any)?.data ?? res;
        setPartners(partners.map(p => p.id === editingPartnerId ? updatedPartner : p));
        addNotification?.('تعديل شريك', `تم تعديل بيانات الشريك ${newPartner.name} بنجاح`, 'info');
        logActivity?.('partners', 'edit_partner', `تعديل شريك ${newPartner.name}`);
      } else {
        const res = await partnersApi.createPartner({
          name: newPartner.name,
          join_date: newPartner.joinDate,
          percentage: Number(newPartner.percentage),
          department: newPartner.department as 'internet' | 'office' | 'cards'
        });
        const raw = (res as any)?.data ?? res;
        const partner = Array.isArray(raw) ? raw[0] : raw;
        const p = partner ? { ...partner, joinDate: partner.join_date ?? partner.joinDate } : null;
        if (p) setPartners([p, ...partners]);
        addNotification?.('إضافة شريك', `تم إضافة الشريك ${newPartner.name} بنجاح`, 'info');
        logActivity?.('partners', 'add_partner', `إضافة شريك ${newPartner.name}`);
      }
      
      setIsAddPartnerModalOpen(false);
      setEditingPartnerId(null);
      setNewPartner({ department: 'internet', joinDate: new Date().toISOString().split('T')[0] });
    } catch (error) {
      console.error("Failed to save partner", error);
      alert("حدث خطأ أثناء حفظ الشريك");
    }
  };

  const handleEditPartner = (partner: Partner) => {
    setNewPartner({
      name: partner.name,
      joinDate: partner.joinDate,
      percentage: partner.percentage,
      department: partner.department
    });
    setEditingPartnerId(partner.id);
    setIsAddPartnerModalOpen(true);
  };

  const handleDeletePartner = async (id: number) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الشريك؟')) {
      try {
        const partnerName = partners.find(p => p.id === id)?.name || 'الشريك';
        await partnersApi.deletePartner(id);
        setPartners(partners.filter(p => p.id !== id));
        setPartnerTransactions(partnerTransactions.filter(tx => (tx.partnerId ?? tx.partner_id) !== id));
        addNotification?.('حذف شريك', `تم حذف الشريك ${partnerName} من النظام`, 'info');
      } catch (error) {
        console.error("Failed to delete partner", error);
        alert("حدث خطأ أثناء حذف الشريك");
      }
    }
  };

  const handleCalcProfit = async () => {
    if (!profitCalc.partnerId || !profitCalc.revenue || !profitCalc.expenses || !profitCalc.date) return;
    
    const partner = partners.find(p => p.id === Number(profitCalc.partnerId));
    if (!partner) return;

    const rev = Number(profitCalc.revenue);
    const exp = Number(profitCalc.expenses);
    const net = rev - exp;
    const share = net * (partner.percentage / 100);

    try {
      const tx = await partnersApi.createTransaction(partner.id, {
        partnerId: partner.id,
        date: profitCalc.date,
        department: partner.department,
        revenue: rev,
        expenses: exp,
        netProfit: net,
        partnerShare: share
      });

      setPartnerTransactions([tx, ...partnerTransactions]);
      addNotification?.('حركة شريك', `تم تسجيل حركة أرباح للشريك ${partner.name} بمبلغ ${Number(profitCalc.expenses).toLocaleString()} د.ع`, 'info');
      logActivity?.('partners', 'calc_profit', `حركة أرباح للشريك ${partner.name} بمبلغ ${Number(profitCalc.expenses).toLocaleString()} د.ع`);
      setIsCalcProfitModalOpen(false);
      setProfitCalc({ partnerId: '', date: new Date().toISOString().split('T')[0], revenue: '', expenses: '' });
    } catch (error) {
      console.error("Failed to calculate profit", error);
      alert("حدث خطأ أثناء حساب الأرباح");
    }
  };

  const handleAddSupplier = async () => {
    if (!newSupplier.name || !newSupplier.specialty || !newSupplier.phone) return;
    let phone: string;
    try {
      phone = requireIraqMobile(String(newSupplier.phone));
    } catch {
      alert(IRAQ_PHONE_HINT_AR);
      return;
    }
    try {
      if (editingSupplierId) {
        const updatedSupplier = await suppliersApi.updateSupplier(editingSupplierId, {
          name: newSupplier.name,
          specialty: newSupplier.specialty,
          phone: phone,
          outstandingDebt: Number(newSupplier.outstandingDebt) || 0
        });
        setSuppliers(suppliers.map(s => s.id === editingSupplierId ? updatedSupplier : s));
        addNotification?.('تعديل مورد', `تم تعديل بيانات المورد ${newSupplier.name} بنجاح`, 'info');
        logActivity?.('partners', 'edit_supplier', `تعديل مورد ${newSupplier.name}`);
      } else {
        const supplier = await suppliersApi.createSupplier({
          name: newSupplier.name,
          specialty: newSupplier.specialty,
          phone: phone,
          outstandingDebt: Number(newSupplier.outstandingDebt) || 0
        });
        setSuppliers([...suppliers, supplier]);
        addNotification?.('إضافة مورد', `تم إضافة المورد ${newSupplier.name} بنجاح`, 'info');
        logActivity?.('partners', 'add_supplier', `إضافة مورد ${newSupplier.name}`);
      }
      
      setIsAddSupplierModalOpen(false);
      setEditingSupplierId(null);
      setNewSupplier({ outstandingDebt: 0 });
    } catch (error) {
      console.error("Failed to save supplier", error);
      alert("حدث خطأ أثناء حفظ المورد");
    }
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setNewSupplier({
      name: supplier.name,
      specialty: supplier.specialty,
      phone: supplier.phone,
      outstandingDebt: supplier.outstandingDebt
    });
    setEditingSupplierId(supplier.id);
    setIsAddSupplierModalOpen(true);
  };

  const handleDeleteSupplier = async (id: number) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المورد؟')) {
      try {
        const supplierName = suppliers.find(s => s.id === id)?.name || 'المورد';
        await suppliersApi.deleteSupplier(id);
        setSuppliers(suppliers.filter(s => s.id !== id));
        setSupplierTransactions(supplierTransactions.filter(tx => tx.supplierId !== id));
        addNotification?.('حذف مورد', `تم حذف المورد ${supplierName} من النظام`, 'info');
        logActivity?.('partners', 'delete_supplier', `حذف مورد ${supplierName}`);
      } catch (error) {
        console.error("Failed to delete supplier", error);
        alert("حدث خطأ أثناء حذف المورد");
      }
    }
  };

  const handleSupplierTx = async () => {
    if (!supplierTx.supplierId || !supplierTx.amount || !supplierTx.date) return;
    
    const amount = Number(supplierTx.amount);
    const supplierId = Number(supplierTx.supplierId);
    const supplier = suppliers.find(s => s.id === supplierId);
    
    if (supplierTx.type === 'payment' && supplier && amount > supplier.outstandingDebt) {
      alert('مبلغ التسديد أكبر من الديون المستحقة!');
      return;
    }

    try {
      const tx = await suppliersApi.createTransaction(supplierId, {
        supplierId: supplierId,
        date: supplierTx.date,
        type: supplierTx.type as 'purchase' | 'payment',
        amount: amount,
        notes: supplierTx.notes
      });

      setSupplierTransactions([tx, ...supplierTransactions]);
      
      // Update supplier debt locally (assuming backend handles it or we re-fetch)
      setSuppliers(suppliers.map(s => {
        if (s.id === tx.supplierId) {
          return {
            ...s,
            outstandingDebt: tx.type === 'purchase' ? s.outstandingDebt + amount : s.outstandingDebt - amount
          };
        }
        return s;
      }));

      const typeLabel = supplierTx.type === 'payment' ? 'تسديد' : 'شراء بالآجل';
      addNotification?.('حركة مورد', `تم تسجيل ${typeLabel} بمبلغ ${amount.toLocaleString()} د.ع للمورد ${supplier?.name || ''}`, 'info');
      logActivity?.('partners', 'supplier_tx', `${typeLabel} بمبلغ ${amount.toLocaleString()} د.ع للمورد ${supplier?.name || ''}`);
      setIsSupplierTxModalOpen(false);
      setSupplierTx({ supplierId: '', date: new Date().toISOString().split('T')[0], type: 'payment', amount: '', notes: '' });
    } catch (error) {
      console.error("Failed to create supplier transaction", error);
      alert("حدث خطأ أثناء إضافة العملية");
    }
  };

  // --- Derived Data for Reports ---
  const filteredPartnerTxs = useMemo(() => {
    return partnerTransactions.filter(tx => {
      if (reportStartDate && tx.date < reportStartDate) return false;
      if (reportEndDate && tx.date > reportEndDate) return false;
      return true;
    });
  }, [partnerTransactions, reportStartDate, reportEndDate]);

  const filteredSupplierTxs = useMemo(() => {
    return supplierTransactions.filter(tx => {
      if (reportStartDate && tx.date < reportStartDate) return false;
      if (reportEndDate && tx.date > reportEndDate) return false;
      return true;
    });
  }, [supplierTransactions, reportStartDate, reportEndDate]);

  const totalPartnerShares = filteredPartnerTxs.reduce((sum, tx) => sum + (tx.partnerShare ?? tx.partner_share ?? 0), 0);
  const totalSupplierDebt = suppliers.reduce((sum, s) => sum + s.outstandingDebt, 0);

  const getDepartmentName = (dept: string) => {
    switch(dept) {
      case 'internet': return 'الإنترنت';
      case 'office': return 'المكتب';
      case 'cards': return 'البطاقات';
      default: return dept;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">قسم الشركاء والموردين</h1>
          <p className="text-slate-500 dark:text-slate-300 text-sm mt-1">إدارة حسابات الشركاء، توزيع الأرباح، وديون الموردين</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2">
            <Printer size={16} />
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto sticky top-0 bg-slate-50 dark:bg-slate-900 z-30 pt-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 print:hidden">
        <button
          onClick={() => setActiveTab('partners')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'partners' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <Users size={18} />
          الشركاء
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'suppliers' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <Truck size={18} />
          الموردين
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'reports' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <FileText size={18} />
          التقارير
        </button>
      </div>

      {/* Partners Tab */}
      {activeTab === 'partners' && (
        <div className="space-y-6">
          <div className="flex justify-end gap-2 print:hidden">
            {canPartners('addPartner') && (
              <button onClick={() => { setEditingPartnerId(null); setNewPartner({ department: 'internet', joinDate: new Date().toISOString().split('T')[0] }); setIsAddPartnerModalOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                <Plus size={16} />
                <span>إضافة شريك</span>
              </button>
            )}
            {canPartners('calcProfit') && (
              <button onClick={() => setIsCalcProfitModalOpen(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2">
                <Calculator size={16} />
                <span>حساب الأرباح</span>
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Users size={18} className="text-indigo-600 dark:text-indigo-400" />
                قائمة الشركاء والنسب
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">اسم الشريك</th>
                    <th className="px-4 py-3 font-medium">تاريخ المشاركة</th>
                    <th className="px-4 py-3 font-medium">القسم</th>
                    <th className="px-4 py-3 font-medium">النسبة المئوية</th>
                    <th className="px-4 py-3 font-medium text-center print:hidden">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                  {partners.map(partner => (
                    <tr key={partner.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                      <td className="px-4 py-4 font-bold text-slate-800 dark:text-white">{partner.name}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-400">{partner.joinDate}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-400">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-200">
                          {getDepartmentName(partner.department)}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-bold text-indigo-600" dir="ltr">{partner.percentage}%</td>
                      <td className="px-4 py-4 text-center print:hidden">
                        {canPartners('addPartner') && (
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleEditPartner(partner)} className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors" title="تعديل">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => handleDeletePartner(partner.id)} className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors" title="حذف">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {partners.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا يوجد شركاء مسجلين</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <FileText size={18} className="text-indigo-600 dark:text-indigo-400" />
                سجل حساب الأرباح
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">التاريخ</th>
                    <th className="px-4 py-3 font-medium">الشريك</th>
                    <th className="px-4 py-3 font-medium">القسم</th>
                    <th className="px-4 py-3 font-medium">الإيرادات</th>
                    <th className="px-4 py-3 font-medium">المصروفات</th>
                    <th className="px-4 py-3 font-medium">صافي الربح</th>
                    <th className="px-4 py-3 font-medium">حصة الشريك</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                  {partnerTransactions.map(tx => {
                    const partnerId = tx.partnerId ?? tx.partner_id;
                    const partner = partners.find(p => p.id === partnerId);
                    const rev = Number(tx.revenue ?? 0);
                    const exp = Number(tx.expenses ?? 0);
                    const net = Number(tx.netProfit ?? tx.net_profit ?? 0);
                    const share = Number(tx.partnerShare ?? tx.partner_share ?? 0);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{tx.date ? String(tx.date).split('T')[0] : tx.date}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{partner?.name || 'غير معروف'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{getDepartmentName(tx.department ?? '')}</td>
                        <td className="px-4 py-3 text-slate-600" dir="ltr">{rev.toLocaleString()}</td>
                        <td className="px-4 py-3 text-rose-600" dir="ltr">{exp.toLocaleString()}</td>
                        <td className="px-4 py-3 font-medium text-slate-800" dir="ltr">{net.toLocaleString()}</td>
                        <td className="px-4 py-3 font-bold text-emerald-600" dir="ltr">{share.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  {partnerTransactions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد سجلات أرباح</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Suppliers Tab */}
      {activeTab === 'suppliers' && (
        <div className="space-y-6">
          <div className="flex justify-end gap-2 print:hidden">
            {canPartners('addSupplier') && (
              <button onClick={() => { setEditingSupplierId(null); setNewSupplier({ outstandingDebt: 0 }); setIsAddSupplierModalOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                <Plus size={16} />
                <span>إضافة مورد</span>
              </button>
            )}
            {canPartners('paySupplier') && (
              <button onClick={() => { setSupplierTx({...supplierTx, type: 'payment'}); setIsSupplierTxModalOpen(true); }} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2">
                <CreditCard size={16} />
                <span>تسديد مورد</span>
              </button>
            )}
            {canPartners('purchaseOnCredit') && (
              <button onClick={() => { setSupplierTx({...supplierTx, type: 'purchase'}); setIsSupplierTxModalOpen(true); }} className="bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors flex items-center gap-2">
                <ArrowDownRight size={16} />
                <span>شراء بالآجل</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg">
                  <ArrowDownRight size={20} />
                </div>
                <h3 className="text-slate-600 dark:text-slate-300 font-medium">إجمالي الديون المستحقة</h3>
              </div>
              <p className="text-3xl font-bold text-slate-800 dark:text-white mt-2" dir="ltr">{totalSupplierDebt.toLocaleString()} <span className="text-sm text-slate-500 dark:text-slate-400 font-normal">د.ع</span></p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                  <Truck size={20} />
                </div>
                <h3 className="text-slate-600 dark:text-slate-300 font-medium">عدد الموردين</h3>
              </div>
              <p className="text-3xl font-bold text-slate-800 dark:text-white mt-2" dir="ltr">{suppliers.length} <span className="text-sm text-slate-500 dark:text-slate-400 font-normal">مورد</span></p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Truck size={18} className="text-indigo-600 dark:text-indigo-400" />
                قائمة الموردين والديون
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">اسم المورد</th>
                    <th className="px-4 py-3 font-medium">الاختصاص</th>
                    <th className="px-4 py-3 font-medium">رقم الهاتف</th>
                    <th className="px-4 py-3 font-medium">الديون المستحقة</th>
                    <th className="px-4 py-3 font-medium text-center print:hidden">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                  {suppliers.map(supplier => (
                    <tr key={supplier.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                      <td className="px-4 py-4 font-bold text-slate-800 dark:text-white">{supplier.name}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-400">{supplier.specialty}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-400" dir="ltr">{supplier.phone}</td>
                      <td className={`px-4 py-4 font-bold ${supplier.outstandingDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`} dir="ltr">
                        {supplier.outstandingDebt.toLocaleString()} د.ع
                      </td>
                      <td className="px-4 py-4 text-center print:hidden">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleEditSupplier(supplier)} className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors" title="تعديل">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => handleDeleteSupplier(supplier.id)} className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors" title="حذف">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {suppliers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا يوجد موردين مسجلين</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <FileText size={18} className="text-indigo-600 dark:text-indigo-400" />
                سجل حركات الموردين
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">التاريخ</th>
                    <th className="px-4 py-3 font-medium">المورد</th>
                    <th className="px-4 py-3 font-medium">نوع الحركة</th>
                    <th className="px-4 py-3 font-medium">المبلغ</th>
                    <th className="px-4 py-3 font-medium">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                  {supplierTransactions.map(tx => {
                    const supplier = suppliers.find(s => s.id === tx.supplierId);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{tx.date}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{supplier?.name || 'غير معروف'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                            tx.type === 'payment' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                          }`}>
                            {tx.type === 'payment' ? 'تسديد' : 'شراء بالآجل'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-bold ${tx.type === 'payment' ? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">
                          {tx.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{tx.notes}</td>
                      </tr>
                    );
                  })}
                  {supplierTransactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد حركات</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden print:shadow-none print:border-slate-300">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-700/50 print:hidden">
              <div className="flex items-center gap-2">
                <Filter size={18} className="text-slate-400 dark:text-slate-300" />
                <span className="font-medium text-slate-700 dark:text-slate-200">تصفية التقارير</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">من</span>
                  <input 
                    type="date" 
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">إلى</span>
                  <input 
                    type="date" 
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                {(reportStartDate || reportEndDate) && (
                  <button 
                    onClick={() => { setReportStartDate(''); setReportEndDate(''); }}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline"
                  >
                    مسح الفلاتر
                  </button>
                )}
              </div>
            </div>

            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-6 text-center">تقرير الشركاء والموردين الشامل</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Partners Summary */}
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-600 pb-2">ملخص أرباح الشركاء</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-100 dark:border-slate-600">
                      <span className="font-medium text-slate-700 dark:text-slate-200">إجمالي حصص الشركاء (للفترة)</span>
                      <span className="font-bold text-emerald-600" dir="ltr">{totalPartnerShares.toLocaleString()} د.ع</span>
                    </div>
                    
                    <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                      <table className="w-full text-right text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300">
                          <tr>
                            <th className="px-3 py-2 font-medium">الشريك</th>
                            <th className="px-3 py-2 font-medium">القسم</th>
                            <th className="px-3 py-2 font-medium">إجمالي الأرباح</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {partners.map(partner => {
                            const partnerTotal = filteredPartnerTxs
                              .filter(tx => (tx.partnerId ?? tx.partner_id) === partner.id)
                              .reduce((sum, tx) => sum + tx.partnerShare, 0);
                            
                            return (
                              <tr key={partner.id}>
                                <td className="px-3 py-2 font-medium text-slate-800 dark:text-white">{partner.name}</td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{getDepartmentName(partner.department)}</td>
                                <td className="px-3 py-2 font-bold text-emerald-600" dir="ltr">{partnerTotal.toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Suppliers Summary */}
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-600 pb-2">ملخص حسابات الموردين</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-100 dark:border-slate-600">
                      <span className="font-medium text-slate-700 dark:text-slate-200">إجمالي الديون المستحقة (الحالية)</span>
                      <span className="font-bold text-rose-600" dir="ltr">{totalSupplierDebt.toLocaleString()} د.ع</span>
                    </div>
                    
                    <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                      <table className="w-full text-right text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300">
                          <tr>
                            <th className="px-3 py-2 font-medium">المورد</th>
                            <th className="px-3 py-2 font-medium">الديون الحالية</th>
                            <th className="px-3 py-2 font-medium">تسديدات (للفترة)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {suppliers.map(supplier => {
                            const paymentsTotal = filteredSupplierTxs
                              .filter(tx => tx.supplierId === supplier.id && tx.type === 'payment')
                              .reduce((sum, tx) => sum + tx.amount, 0);
                            
                            return (
                              <tr key={supplier.id}>
                                <td className="px-3 py-2 font-medium text-slate-800 dark:text-white">{supplier.name}</td>
                                <td className={`px-3 py-2 font-bold ${supplier.outstandingDebt > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`} dir="ltr">
                                  {supplier.outstandingDebt.toLocaleString()}
                                </td>
                                <td className="px-3 py-2 font-bold text-emerald-600" dir="ltr">{paymentsTotal.toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      
      {/* Add Partner Modal */}
      {isAddPartnerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">{editingPartnerId ? 'تعديل شريك' : 'إضافة شريك جديد'}</h3>
              <button onClick={() => setIsAddPartnerModalOpen(false)} className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">اسم الشريك</label>
                <input type="text" value={newPartner.name || ''} onChange={e => setNewPartner({...newPartner, name: e.target.value})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">تاريخ المشاركة</label>
                <input type="date" value={newPartner.joinDate || ''} onChange={e => setNewPartner({...newPartner, joinDate: e.target.value})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">النسبة المئوية (%)</label>
                <input type="number" value={newPartner.percentage || ''} onChange={e => setNewPartner({...newPartner, percentage: Number(e.target.value)})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">القسم</label>
                <select value={newPartner.department || 'internet'} onChange={e => setNewPartner({...newPartner, department: e.target.value as any})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="internet">قسم الإنترنت</option>
                  <option value="office">قسم المكتب</option>
                  <option value="cards">قسم البطاقات</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button onClick={() => setIsAddPartnerModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">إلغاء</button>
              <button onClick={handleAddPartner} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">{editingPartnerId ? 'حفظ التعديلات' : 'حفظ الشريك'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Calc Profit Modal */}
      {isCalcProfitModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">حساب أرباح شريك</h3>
              <button onClick={() => setIsCalcProfitModalOpen(false)} className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">الشريك</label>
                <select value={profitCalc.partnerId} onChange={e => setProfitCalc({...profitCalc, partnerId: e.target.value})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">اختر الشريك...</option>
                  {partners.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({getDepartmentName(p.department)} - {p.percentage}%)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">التاريخ</label>
                <input type="date" value={profitCalc.date} onChange={e => setProfitCalc({...profitCalc, date: e.target.value})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">أرباح القسم (تلقائي) (د.ع)</label>
                <input type="number" value={profitCalc.revenue} readOnly className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-slate-50 dark:bg-slate-700 outline-none text-slate-900 dark:text-slate-100" dir="ltr" placeholder="يتم حسابه تلقائياً" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">إجمالي المصروفات للقسم (د.ع)</label>
                <input type="number" value={profitCalc.expenses} onChange={e => setProfitCalc({...profitCalc, expenses: e.target.value})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" dir="ltr" />
              </div>
              
              {profitCalc.partnerId && profitCalc.revenue && profitCalc.expenses && (
                <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-lg">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-300">صافي الربح:</span>
                    <span className="font-bold text-slate-800 dark:text-white" dir="ltr">{(Number(profitCalc.revenue) - Number(profitCalc.expenses)).toLocaleString()} د.ع</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">حصة الشريك:</span>
                    <span className="font-bold text-emerald-600" dir="ltr">{((Number(profitCalc.revenue) - Number(profitCalc.expenses)) * (partners.find(p => p.id === Number(profitCalc.partnerId))?.percentage || 0) / 100).toLocaleString()} د.ع</span>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button onClick={() => setIsCalcProfitModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">إلغاء</button>
              <button onClick={handleCalcProfit} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">تأكيد وحفظ</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {isAddSupplierModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">{editingSupplierId ? 'تعديل مورد' : 'إضافة مورد جديد'}</h3>
              <button onClick={() => setIsAddSupplierModalOpen(false)} className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">اسم المورد</label>
                <input type="text" value={newSupplier.name || ''} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">الاختصاص (مثال: مواد إنترنت، قرطاسية)</label>
                <input type="text" value={newSupplier.specialty || ''} onChange={e => setNewSupplier({...newSupplier, specialty: e.target.value})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">رقم الهاتف</label>
                <input type="text" value={newSupplier.phone || ''} onChange={e => setNewSupplier({...newSupplier, phone: e.target.value.replace(/\D/g, '').slice(0, 15)})} placeholder="077… أو 7712345678" className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" dir="ltr" maxLength={15} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">الديون المستحقة السابقة (إن وجدت)</label>
                <input type="number" value={newSupplier.outstandingDebt || ''} onChange={e => setNewSupplier({...newSupplier, outstandingDebt: Number(e.target.value)})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" dir="ltr" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button onClick={() => setIsAddSupplierModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">إلغاء</button>
              <button onClick={handleAddSupplier} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">{editingSupplierId ? 'حفظ التعديلات' : 'حفظ المورد'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Transaction Modal */}
      {isSupplierTxModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">{supplierTx.type === 'payment' ? 'تسديد مورد' : 'شراء بالآجل'}</h3>
              <button onClick={() => setIsSupplierTxModalOpen(false)} className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">المورد</label>
                <select value={supplierTx.supplierId} onChange={e => setSupplierTx({...supplierTx, supplierId: e.target.value})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">اختر المورد...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} (مطلوب: {s.outstandingDebt.toLocaleString()})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">التاريخ</label>
                <input type="date" value={supplierTx.date} onChange={e => setSupplierTx({...supplierTx, date: e.target.value})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">المبلغ (د.ع)</label>
                <input type="number" value={supplierTx.amount} onChange={e => setSupplierTx({...supplierTx, amount: e.target.value})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">ملاحظات والتفاصيل</label>
                <input type="text" value={supplierTx.notes} onChange={e => setSupplierTx({...supplierTx, notes: e.target.value})} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder={supplierTx.type === 'payment' ? 'مثال: دفعة نقدية' : 'مثال: شراء كابلات'} />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button onClick={() => setIsSupplierTxModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">إلغاء</button>
              <button onClick={handleSupplierTx} className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${supplierTx.type === 'payment' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                تأكيد {supplierTx.type === 'payment' ? 'التسديد' : 'الشراء'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
