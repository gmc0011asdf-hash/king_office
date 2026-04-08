import { useEffect, useState } from 'react';
import { MessageCircle, Bell, Loader2, RefreshCw, Layers, Users } from 'lucide-react';
import { officeApi } from '../../api/office.api';
import { templatesApi, type MessageTemplate } from '../../../settings/api/templates.api';

interface OfficeAlert {
  id: number;
  name: string;
  phone: string | null;
  debt: number;
}

interface QueueItem {
  id: number;
  name: string;
  phone: string;
  debt: number;
}

function formatPhoneForWhatsApp(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.startsWith('964')) return digits;
  return '964' + digits;
}

export function OfficeAlertsTab() {
  const [alerts, setAlerts] = useState<OfficeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState<number | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  
  // Bulk Queue State
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bulkCount, setBulkCount] = useState(5);

  const load = async () => {
    setLoading(true);
    try {
      const data = await officeApi.getDebtAlerts();
      setAlerts(data);
      
      const templates = await templatesApi.getAll();
      const match = templates.find((t: MessageTemplate) => t.key === 'office_debt_msg');
      if (match) setTemplate(match.body);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getMessage = (name: string, debt: number) => {
    if (template) {
      return template
        .replace(/\[Name\]/g, name)
        .replace(/\[Amount\]/g, debt.toLocaleString() + ' د.ع');
    }
    return `مرحباً ${name}، نود تذكيرك بوجود مبالغ مستحقة بذمتكم بقيمة ${debt.toLocaleString()} د.ع. يرجى مراجعة المكتب للتسديد. شكراً لكم.`;
  };

  const handleSendAlert = async (alertData: OfficeAlert) => {
    const phone = formatPhoneForWhatsApp(alertData.phone);
    if (!phone) {
      alert('لا يوجد رقم هاتف صالح لهذا الزبون');
      return;
    }

    const message = getMessage(alertData.name, alertData.debt);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    
    setNotifying(alertData.id);
    try {
      await officeApi.markDebtNotified(alertData.id);
      setAlerts((prev: OfficeAlert[]) => prev.filter((a: OfficeAlert) => a.id !== alertData.id));
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      alert('فشل في تسجيل التنبيه');
    } finally {
      setNotifying(null);
    }
  };

  const startBulkQueue = () => {
    const qualified = alerts
      .filter((a: OfficeAlert) => a.phone)
      .slice(0, bulkCount)
      .map((a: OfficeAlert) => ({
        id: a.id,
        name: a.name,
        phone: a.phone!,
        debt: a.debt
      }));

    if (qualified.length === 0) {
      alert('لا يوجد زبائن برقم هاتف صالح في القائمة');
      return;
    }

    setQueue(qualified);
    setCurrentIndex(0);
    setQueueModalOpen(true);
  };

  const handleNextInQueue = async () => {
    const current = queue[currentIndex];
    const phone = formatPhoneForWhatsApp(current.phone);
    if (phone) {
      const message = getMessage(current.name, current.debt);
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      
      try {
        await officeApi.markDebtNotified(current.id);
        setAlerts((prev: OfficeAlert[]) => prev.filter((a: OfficeAlert) => a.id !== current.id));
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (e) {
        console.error('Failed to mark notified', e);
      }
    }

    if (currentIndex < queue.length - 1) {
      setCurrentIndex((prev: number) => prev + 1);
    } else {
      setQueueModalOpen(false);
      load();
    }
  };

  if (loading && alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
        <Loader2 size={40} className="animate-spin opacity-20" />
        <p className="text-sm">جاري تحميل تنبيهات الديون...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bell size={20} className="text-rose-500" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">تنبيهات ديون المكتب</h2>
            <span className="bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs px-2 py-0.5 rounded-full font-bold">
              {alerts.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            الزبائن الذين لديهم ديون ولم يتم تنبيههم خلال آخر 3 أيام.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-slate-700 p-1 rounded-xl border border-slate-200 dark:border-slate-600">
            <select
              value={bulkCount}
              onChange={(e) => setBulkCount(Number(e.target.value))}
              className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 px-2 outline-none"
            >
              <option value={5}>5 زبائن</option>
              <option value={10}>10 زبائن</option>
              <option value={20}>20 زبوناً</option>
            </select>
            <button
              onClick={startBulkQueue}
              disabled={alerts.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Layers size={14} />
              بدء إرسال جماعي
            </button>
          </div>
          <button
            onClick={load}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all"
            title="تحديث"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-bold">الزبون</th>
                <th className="px-6 py-4 font-bold text-center">المبلغ المستحق</th>
                <th className="px-6 py-4 font-bold text-left">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-slate-400 text-sm">
                    لا توجد تنبيهات ديون حالياً.
                  </td>
                </tr>
              ) : (
                alerts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 dark:text-white text-sm">{a.name}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-500 font-mono tracking-tight" dir="ltr">{a.phone || 'بدون رقم'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm font-black text-rose-600 dark:text-rose-400 tabular-nums">
                        {a.debt.toLocaleString()} د.ع
                      </span>
                    </td>
                    <td className="px-6 py-4 text-left">
                      <button
                        onClick={() => handleSendAlert(a)}
                        disabled={notifying === a.id || !a.phone}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                      >
                        {notifying === a.id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                        إرسال WhatsApp
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Queue Modal (Same design as Internet) */}
      {queueModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <Layers size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 dark:text-white">طابور الإرسال الجماعي (المكتب)</h3>
                  <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                    إرسال {queue.length} رسالة تذكير
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setQueueModalOpen(false)}
                className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
              >
                إغلاق
              </button>
            </div>

            <div className="p-6">
               <div className="space-y-4">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">التقدم</span>
                    <span className="text-lg font-black text-rose-600" dir="ltr">
                      {currentIndex + 1} / {queue.length}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-rose-600 transition-all duration-300" 
                      style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }}
                    />
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center mx-auto shadow-sm">
                      <Users size={30} className="text-slate-400" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-slate-800 dark:text-white">{queue[currentIndex].name}</h4>
                      <p className="text-sm font-mono text-slate-500" dir="ltr">{queue[currentIndex].phone}</p>
                    </div>
                    <div className="inline-block px-4 py-1.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-sm font-black">
                      {queue[currentIndex].debt.toLocaleString()} د.ع
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
                {currentIndex === queue.length - 1 ? 'إرسال وإنهاء' : 'إرسال والزبون التالي'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
