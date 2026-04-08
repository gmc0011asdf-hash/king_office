import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Globe,
  Briefcase,
  CreditCard,
  Receipt,
  Users,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Wallet,
  UsersRound,
  UserCheck,
  UserX
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { canAccessSection } from '@/utils/permissions';
import { subscriberDisplayStatus } from '@/utils/subscriptionDates';

export default function Dashboard() {
  const {
    walletBalance,
    wirelessWalletBalance,
    swigBalance,
    qiBalance,
    cardInventoryCount,
    subscribers,
    officeSales,
    cardSales,
    expenses,
    officeCustomers,
    systemSettings,
    currentUser,
  } = useAppContext();
  const [filterPeriod, setFilterPeriod] = useState('اليوم');

  const isAdmin = currentUser?.role === 'admin';
  const canAccess = (section: string) => isAdmin || canAccessSection(currentUser, section);

  const totalSubscribers = subscribers.length;
  const activeSubscribers = subscribers.filter(
    (s: any) => subscriberDisplayStatus(s.expirationDate ?? s.expiration_date) === 'نشط',
  ).length;
  const expiredSubscribers = subscribers.filter(
    (s: any) => subscriberDisplayStatus(s.expirationDate ?? s.expiration_date) === 'منتهي',
  ).length;

  const totalOfficeSales = (officeSales ?? []).reduce((s: number, o: any) => s + Number(o?.totalAmount ?? o?.total_amount ?? 0), 0);
  const totalCardSales = (cardSales ?? []).reduce((s: number, c: any) => s + Number(c?.totalAmount ?? c?.total_amount ?? c?.total ?? 0), 0);
  const totalExpenses = (expenses ?? []).reduce((s: number, e: any) => s + Number(e?.amount ?? 0), 0);
  const totalDebts = (officeCustomers ?? []).reduce((s: number, c: any) => s + Number(c?.debt ?? 0), 0);

  const modules = [
    { name: 'قسم الإنترنت', icon: Globe, color: 'bg-blue-500', path: '/internet', desc: 'إدارة المشتركين والمواد', section: 'internet' },
    { name: 'قسم المكتب', icon: Briefcase, color: 'bg-emerald-500', path: '/office', desc: 'مبيعات المكتب والمخزون', section: 'office' },
    { name: 'قسم البطاقات', icon: CreditCard, color: 'bg-amber-500', path: '/cards', desc: 'بطاقات Switch و Qi', section: 'cards' },
    { name: 'قسم المصروفات', icon: Receipt, color: 'bg-rose-500', path: '/expenses', desc: 'إدارة النفقات التشغيلية', section: 'expenses' },
    { name: 'قسم الشركاء', icon: Users, color: 'bg-purple-500', path: '/partners', desc: 'توزيع الأرباح والنسب', section: 'partners' },
    { name: 'قسم التقارير', icon: BarChart3, color: 'bg-indigo-500', path: '/reports', desc: 'التقارير المالية الشاملة', section: 'reports' },
  ].filter(m => canAccess(m.section));

  const kpis = [
    { title: 'محفظة Qi', value: (qiBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }), currency: 'د.ع', trend: 'رصيد', isPositive: true, icon: Wallet, section: 'cards' },
    { title: 'محفظة Switch', value: (swigBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }), currency: 'د.ع', trend: 'رصيد', isPositive: true, icon: Wallet, section: 'cards' },
    { title: 'محفظة الإنترنت (FTTH)', value: (walletBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }), currency: 'د.ع', trend: 'رصيد', isPositive: true, icon: Wallet, section: 'internet' },
    { title: 'محفظة Wireless', value: (wirelessWalletBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }), currency: 'د.ع', trend: 'رصيد', isPositive: true, icon: Wallet, section: 'internet' },
    { title: 'البطاقات المتوفرة', value: (cardInventoryCount ?? 0).toLocaleString(), currency: 'بطاقة', trend: 'مخزون', isPositive: true, icon: CreditCard, section: 'cards' },
    { title: 'إجمالي المشتركين', value: totalSubscribers.toLocaleString(), currency: 'مشترك', trend: 'قسم الإنترنت', isPositive: true, icon: UsersRound, section: 'internet' },
    { title: 'مشتركين نشطين', value: activeSubscribers.toLocaleString(), currency: 'مشترك', trend: 'نشط', isPositive: true, icon: UserCheck, section: 'internet' },
    { title: 'مشتركين منتهين', value: expiredSubscribers.toLocaleString(), currency: 'مشترك', trend: 'منتهي', isPositive: false, icon: UserX, section: 'internet' },
    { title: 'مبيعات المكتب', value: totalOfficeSales.toLocaleString(undefined, { maximumFractionDigits: 0 }), currency: 'د.ع', trend: 'قسم المكتب', isPositive: true, icon: Briefcase, section: 'office' },
    { title: 'مبيعات البطاقات', value: totalCardSales.toLocaleString(undefined, { maximumFractionDigits: 0 }), currency: 'د.ع', trend: 'قسم البطاقات', isPositive: true, icon: CreditCard, section: 'cards' },
    { title: 'إجمالي المصروفات', value: totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 }), currency: 'د.ع', trend: 'قسم المصروفات', isPositive: false, icon: Receipt, section: 'expenses' },
    { title: 'الديون المستحقة', value: totalDebts.toLocaleString(undefined, { maximumFractionDigits: 0 }), currency: 'د.ع', trend: 'زبائن المكتب', isPositive: false, icon: Wallet, section: 'office' },
  ].filter(k => canAccess(k.section));

  const handleExportSummary = () => {
    const csvContent = [
      ['التقرير', 'القيمة', 'العملة', 'الاتجاه'],
      ...kpis.map(kpi => [kpi.title, kpi.value.replace(/,/g, ''), kpi.currency, kpi.trend])
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `ملخص_التقارير_${filterPeriod.replace(' ', '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">لوحة التحكم</h1>
          <p className="text-slate-500 dark:text-slate-300 text-sm mt-1">نظرة عامة على أداء مكتب الملك {filterPeriod}</p>
        </div>
        <div className="flex gap-2">
          <select 
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
          >
            <option>اليوم</option>
            <option>هذا الأسبوع</option>
            <option>هذا الشهر</option>
            <option>هذا العام</option>
          </select>
          <button 
            onClick={handleExportSummary}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            تصدير الملخص
          </button>
        </div>
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {modules.map((module, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="h-full"
          >
            <Link 
              to={module.path}
              className="block bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-900 transition-all group h-full"
            >
              <div className="flex items-center gap-4">
                <div className={`${module.color} w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-inner group-hover:scale-110 transition-transform shrink-0`}>
                  <module.icon size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{module.name}</h3>
                  <p className="text-slate-500 dark:text-slate-300 text-sm mt-0.5">{module.desc}</p>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <h2 className="text-lg font-bold text-slate-800 dark:text-white mt-8 mb-4">التقارير والإحصائيات</h2>

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => (
          <motion.div 
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col justify-between"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <kpi.icon size={20} className="text-slate-500 dark:text-slate-300" />
              </div>
              <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                kpi.isPositive ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
              }`}>
                {kpi.isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span dir="ltr">{kpi.trend}</span>
              </div>
            </div>
            <div>
              <h3 className="text-slate-500 dark:text-slate-300 text-sm font-medium mb-1">{kpi.title}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800 dark:text-white">{kpi.value}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">{kpi.currency}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Recent Activity & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 dark:text-white">تنبيهات النظام</h3>
            <Link to="/settings" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">الإعدادات</Link>
          </div>
          <div className="space-y-4">
            {(swigBalance ?? 0) < (systemSettings?.swigThreshold ?? 50000) && (
              <div className="flex gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/50">
                <div className="mt-0.5"><Wallet size={16} className="text-amber-600 dark:text-amber-400" /></div>
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">رصيد محفظة Switch منخفض</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">الرصيد الحالي {(swigBalance ?? 0).toLocaleString()} د.ع أقل من الحد الأدنى ({(systemSettings?.swigThreshold ?? 50000).toLocaleString()} د.ع)</p>
                </div>
              </div>
            )}
            {(qiBalance ?? 0) < (systemSettings?.qiThreshold ?? 50000) && (
              <div className="flex gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/50">
                <div className="mt-0.5"><Wallet size={16} className="text-amber-600 dark:text-amber-400" /></div>
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">رصيد محفظة Qi منخفض</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">الرصيد الحالي {(qiBalance ?? 0).toLocaleString()} د.ع أقل من الحد الأدنى ({(systemSettings?.qiThreshold ?? 50000).toLocaleString()} د.ع)</p>
                </div>
              </div>
            )}
            {(cardInventoryCount ?? 0) < (systemSettings?.cardsThreshold ?? 5) && (
              <div className="flex gap-3 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-100 dark:border-rose-800/50">
                <div className="mt-0.5"><CreditCard size={16} className="text-rose-600 dark:text-rose-400" /></div>
                <div>
                  <p className="text-sm font-medium text-rose-800 dark:text-rose-200">نفاذ مخزون البطاقات</p>
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">المتبقي {(cardInventoryCount ?? 0)} بطاقة فقط في المخزن</p>
                </div>
              </div>
            )}
            {(!(swigBalance ?? 0) || ((swigBalance ?? 0) >= (systemSettings?.swigThreshold ?? 50000))) && (!(qiBalance ?? 0) || ((qiBalance ?? 0) >= (systemSettings?.qiThreshold ?? 50000))) && ((cardInventoryCount ?? 0) >= (systemSettings?.cardsThreshold ?? 5)) && (
              <p className="text-sm text-slate-500 dark:text-slate-400">لا توجد تنبيهات حالية</p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 dark:text-white">الديون المستحقة (الزبائن)</h3>
            <Link to="/office" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">تقرير الديون</Link>
          </div>
          <div className="space-y-3">
            {(officeCustomers ?? []).filter((c: any) => Number(c?.debt ?? 0) > 0).slice(0, 5).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-600">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-200 text-xs font-bold">
                    {String(c?.name ?? "").charAt(0) || "ز"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{c?.name ?? "-"}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{c?.phone ?? "-"}</p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-rose-600 dark:text-rose-400" dir="ltr">{Number(c?.debt ?? 0).toLocaleString()} د.ع</p>
                  <Link to="/office" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5">تسديد</Link>
                </div>
              </div>
            ))}
            {(officeCustomers ?? []).filter((c: any) => Number(c?.debt ?? 0) > 0).length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">لا يوجد زبائن مدينون</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
