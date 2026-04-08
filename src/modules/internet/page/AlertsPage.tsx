import { useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, Bell, CreditCard, Layers, X, Users, Loader2 } from 'lucide-react';
import { alertsApi, type ExpiringSubscriber } from '../api/alerts.api';
import { templatesApi, type MessageTemplate } from '../../settings/api/templates.api';
import { InternetDebtAlerts } from './components/InternetDebtAlerts';

type AlertTab = 'expiry' | 'debt';

function formatPhoneForWhatsApp(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.startsWith('964')) return digits;
  return '964' + digits;
}

function ExpiryAlertsTable({ rows, load, loading, template }: { rows: ExpiringSubscriber[], load: () => void, loading: boolean, template: string | null }) {
  const [notifying, setNotifying] = useState<number | null>(null);

  const urgencyClass = (days: number) => {
    if (days <= 0) return 'text-rose-600 dark:text-rose-400 font-bold';
    if (days === 1) return 'text-amber-500 dark:text-amber-400 font-semibold';
    return 'text-indigo-600 dark:text-indigo-400';
  };

  const buildWhatsAppUrl = (
    phone: string | null,
    name: string | null,
    expirationDate: string | null,
    remainingDays: number,
    template: string | null
  ): string | null => {
    const formatted = formatPhoneForWhatsApp(phone);
    if (!formatted) return null;

    const displayName = name || 'عزيزي المشترك';
    const dateStr = expirationDate ?? '';
    const daysStr =
      remainingDays === 0
        ? 'اليوم'
        : remainingDays === 1
          ? 'يوم واحد'
          : `${remainingDays} أيام`;

    let message = '';
    if (template) {
      message = template
        .replace(/\[Name\]/g, displayName)
        .replace(/\[Date\]/g, dateStr)
        .replace(/\[Days\]/g, daysStr);
    } else {
      message = `مرحباً ${displayName}، نود تذكيرك بأن اشتراكك في خدمة الإنترنت سينتهي خلال ${daysStr} بتاريخ ${dateStr}. يرجى التجديد لتجنب انقطاع الخدمة.`;
    }

    return `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
  };

  const handleSendAlert = async (sub: ExpiringSubscriber) => {
    const url = buildWhatsAppUrl(sub.phone, sub.real_name, sub.expiration_date, sub.remaining_days, template);
    if (!url) {
      alert('لا يوجد رقم هاتف صالح لهذا المشترك');
      return;
    }

    setNotifying(sub.id);
    try {
      await alertsApi.markExpiryNotified(sub.id);
      load(); // Refresh list
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      alert('فشل تسجيل التنبيه في قاعدة البيانات');
    } finally {
      setNotifying(null);
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <RefreshCw size={20} className="animate-spin ml-2" />
        جاري التحميل...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
        <Bell size={40} className="opacity-30" />
        <p className="text-sm">لا توجد اشتراكات منتهية تستوجب تنبيهاً الآن</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
              <th className="px-6 py-4 font-bold">المشترك</th>
              <th className="px-6 py-4 font-bold">تاريخ الانتهاء</th>
              <th className="px-6 py-4 font-bold">باقي</th>
              <th className="px-6 py-4 font-bold text-left">الإجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {rows.map((sub) => (
              <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800 dark:text-white text-sm">
                      {sub.real_name || sub.user_code || '—'}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono tracking-tight" dir="ltr">{sub.phone || '—'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                  {sub.expiration_date || '—'}
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 ${urgencyClass(sub.remaining_days)}`}>
                    {sub.remaining_days <= 0
                      ? 'منتهي'
                      : sub.remaining_days === 1
                        ? 'يوم واحد'
                        : `${sub.remaining_days} أيام`}
                  </span>
                </td>
                <td className="px-6 py-4 text-left">
                  <button
                    onClick={() => handleSendAlert(sub)}
                    disabled={notifying === sub.id || !sub.phone}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-all disabled:opacity-30 shadow-sm"
                  >
                    {notifying === sub.id ? <RefreshCw size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                    إرسال WhatsApp
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState<AlertTab>('expiry');
  const [rows, setRows] = useState<ExpiringSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<string | null>(null);

  // Bulk Queue State
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [queue, setQueue] = useState<ExpiringSubscriber[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bulkCount, setBulkCount] = useState(5);

  const fetchTemplate = async () => {
    try {
      const all = await templatesApi.getAll();
      const match = all.find((t: MessageTemplate) => t.key === 'internet_expiry_msg');
      if (match) setTemplate(match.body);
    } catch (e) {
      console.error('Failed to fetch template', e);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await alertsApi.getExpiringSubscribers();
      setRows(data);
    } catch {
      setError('تعذّر تحميل قائمة المشتركين المنتهية اشتراكاتهم');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    fetchTemplate();
  }, []);

  const startBulkQueue = () => {
    const qualified = rows
      .filter((r) => r.phone)
      .slice(0, bulkCount);

    if (qualified.length === 0) {
      alert('لا يوجد مشتركين برقم هاتف صالح في القائمة');
      return;
    }

    setQueue(qualified);
    setCurrentIndex(0);
    setQueueModalOpen(true);
  };

  const handleNextInQueue = async () => {
    const current = queue[currentIndex];
    
    // Build URL logic duplicated for simplicity or lifted if refactored
    const formatted = formatPhoneForWhatsApp(current.phone);
    if (formatted) {
      const displayName = current.real_name || current.user_code || 'عزيزي المشترك';
      const dateStr = current.expiration_date ?? '';
      const remDays = current.remaining_days;
      const daysStr = remDays === 0 ? 'اليوم' : remDays === 1 ? 'يوم واحد' : `${remDays} أيام`;

      let msg = '';
      if (template) {
        msg = template
          .replace(/\[Name\]/g, displayName)
          .replace(/\[Date\]/g, dateStr)
          .replace(/\[Days\]/g, daysStr);
      } else {
        msg = `مرحباً ${displayName}، نود تذكيرك بأن اشتراكك في خدمة الإنترنت سينتهي خلال ${daysStr} بتاريخ ${dateStr}. يرجى التجديد لتجنب انقطاع الخدمة.`;
      }

      const url = `https://wa.me/${formatted}?text=${encodeURIComponent(msg)}`;
      
      try {
        await alertsApi.markExpiryNotified(current.id);
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (e) {
        console.error('Failed to mark notified', e);
      }
    }

    if (currentIndex < queue.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setQueueModalOpen(false);
      load();
    }
  };

  return (
    <div className="p-2 space-y-6">
      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl w-fit border border-slate-200 dark:border-slate-700 shadow-inner">
        <button
          onClick={() => setActiveTab('expiry')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'expiry'
              ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Bell size={18} />
          تنبيهات انتهاء الاشتراك
          {rows.length > 0 && (
             <span className="bg-rose-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full">
               {rows.length}
             </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('debt')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'debt'
              ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <CreditCard size={18} />
          تنبيهات ديون الإنترنت
        </button>
      </div>

      {activeTab === 'expiry' ? (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
              تنبيهات المشتركين المنتهين
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <select
                  value={bulkCount}
                  onChange={(e) => setBulkCount(Number(e.target.value))}
                  className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 px-2 outline-none"
                >
                  <option value={5}>5 مشتركين</option>
                  <option value={10}>10 مشتركين</option>
                  <option value={20}>20 مشتركاً</option>
                </select>
                <button
                  onClick={startBulkQueue}
                  disabled={rows.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <Layers size={14} />
                  بدء إرسال جماعي
                </button>
              </div>
              <button
                 onClick={load}
                 disabled={loading}
                 className="p-2 text-slate-400 hover:text-indigo-600 transition-all rounded-xl hover:bg-slate-100"
              >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <ExpiryAlertsTable rows={rows} load={load} loading={loading} template={template} />
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
           <InternetDebtAlerts />
        </div>
      )}

      {/* Bulk Queue Modal */}
      {queueModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Layers size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 dark:text-white">طابور الإرسال الجماعي</h3>
                  <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                    إرسال {queue.length} تنبيهاً لانتهاء الصلاحية
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setQueueModalOpen(false)}
                className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
               <div className="space-y-4">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">التقدم</span>
                    <span className="text-lg font-black text-indigo-600" dir="ltr">
                      {currentIndex + 1} / {queue.length}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-300" 
                      style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }}
                    />
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center mx-auto shadow-sm">
                      <Users size={30} className="text-slate-400" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-slate-800 dark:text-white">
                        {queue[currentIndex].real_name || queue[currentIndex].user_code || '—'}
                      </h4>
                      <p className="text-sm font-mono text-slate-500" dir="ltr">{queue[currentIndex].phone}</p>
                    </div>
                    <div className="inline-block px-4 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm font-black">
                      ينتهي خلال: {queue[currentIndex].remaining_days} يوم
                    </div>
                  </div>
               </div>
            </div>

            <div className="p-6 bg-slate-50/50 dark:bg-slate-900/20 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={handleNextInQueue}
                className="w-full h-14 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-black text-lg flex items-center justify-center gap-3 transition-all"
              >
                <MessageCircle size={24} />
                {currentIndex === queue.length - 1 ? 'إرسال وإنهاء' : 'إرسال والمشترك التالي'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
