import { useEffect, useState } from 'react';
import { MessageCircle, Bell, Loader2, RefreshCw, Layers, X, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { alertsApi, type DebtSubscriber, type BroadcastItem } from '../../api/alerts.api';
import { templatesApi, type MessageTemplate } from '../../../settings/api/templates.api';

function formatPhoneForWhatsApp(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.startsWith('964')) return digits;
  return '964' + digits;
}

export function InternetDebtAlerts() {
  const [alerts, setAlerts] = useState<DebtSubscriber[]>([]);
  const [broadcastQueue, setBroadcastQueue] = useState<BroadcastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [threshold, setThreshold] = useState(50000);
  const [template, setTemplate] = useState<string | null>(null);

  // Sequential Sender State
  const [senderModalOpen, setSenderModalOpen] = useState(false);
  const [senderQueue, setSenderQueue] = useState<DebtSubscriber[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bulkCount, setBulkCount] = useState(5);

  const load = async () => {
    setLoading(true);
    try {
      const data = await alertsApi.getDebtAlerts();
      setAlerts(data);
      const qData = await alertsApi.getBroadcastQueue('pending');
      setBroadcastQueue(qData);

      const templates = await templatesApi.getAll();
      const match = templates.find((t: MessageTemplate) => t.key === 'internet_debt_msg');
      if (match) setTemplate(match.body);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => {
        alertsApi.getBroadcastQueue('pending').then(setBroadcastQueue).catch(console.error);
    }, 10000); // تحديث الطابور كل 10 ثوانٍ
    return () => clearInterval(interval);
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await alertsApi.triggerDebtScan(threshold);
      alert(`تمت جدولة ${res.queued_count} تنبيه جديد في الطابور.`);
      load();
    } catch (e) {
      alert('فحص الديون فشل');
    } finally {
      setScanning(false);
    }
  };

  const cancelItem = async (id: number) => {
    try {
      await alertsApi.cancelBroadcast(id);
      setBroadcastQueue(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      alert('فشل في إلغاء الإرسال');
    }
  };

  const startSequentialSender = () => {
    const qualified = alerts
        .filter(a => a.phone)
        .slice(0, bulkCount);

    if (qualified.length === 0) {
        alert('لا يوجد مشتركين برقم هاتف صالح في القائمة');
        return;
    }

    setSenderQueue(qualified);
    setCurrentIndex(0);
    setSenderModalOpen(true);
  };

  const handleNextInQueue = async () => {
    const current = senderQueue[currentIndex];
    const phone = formatPhoneForWhatsApp(current.phone);

    if (phone) {
      let msg = '';
      if (template) {
        msg = template
          .replace(/\[Name\]/g, current.real_name || current.user_code || 'عزيزي المشترك')
          .replace(/\[Amount\]/g, current.debt.toLocaleString() + ' د.ع');
      } else {
        const displayName = current.real_name || current.user_code || 'عزيزي المشترك';
        msg = `مرحباً ${displayName}، نود تذكيرك بوجود مبالغ مستحقة بذمتكم بقيمة ${current.debt.toLocaleString()} د.ع. يرجى مراجعة المكتب للتسديد. شكراً لكم.`;
      }

      const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
      
      try {
        await alertsApi.markDebtNotified(current.id);
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (e) {
        console.error('Failed to mark notified', e);
      }
    }

    if (currentIndex < senderQueue.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setSenderModalOpen(false);
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
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Premium Header Card */}
      <div className="premium-gradient-rose p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/20 transition-all duration-700" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl animate-float">
                <Bell size={28} className="text-white" />
              </div>
              <h2 className="text-3xl font-black tracking-tight text-white">تنبيهات الديون الذكية</h2>
            </div>
            <p className="text-rose-100/80 text-lg max-w-md">
              فحص تلقائي وجدولة رسائل التذكير للمشتركين الذين تجاوزوا الحد المسموح.
            </p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-xl p-6 rounded-3xl border border-white/20 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold tracking-widest text-rose-200">الحد الأدنى (د.ع)</span>
              <input 
                type="number" 
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="bg-transparent border-b-2 border-white/30 focus:border-white outline-none text-xl font-black w-32 pb-1 text-white"
              />
            </div>
            <button
               onClick={handleScan}
               disabled={scanning}
               className="h-14 px-8 rounded-2xl bg-white text-rose-600 font-black hover:bg-rose-50 transition-all hover-scale shadow-lg flex items-center gap-3 disabled:opacity-50"
            >
              {scanning ? <Loader2 size={24} className="animate-spin" /> : <RefreshCw size={24} />}
              بدء الفحص الآلي
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Statistics & Queue Status */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6 rounded-[2rem] border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Layers size={20} className="text-indigo-500" />
              طابور الإرسال التلقائي
            </h3>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {broadcastQueue.length === 0 ? (
                <div className="py-10 text-center space-y-3">
                  <CheckCircle2 size={40} className="mx-auto text-green-500 opacity-20" />
                  <p className="text-slate-400 text-sm italic">لا توجد رسائل معلقة</p>
                </div>
              ) : (
                broadcastQueue.map(item => (
                  <div key={item.id} className="p-4 bg-white dark:bg-slate-700/50 rounded-2xl border border-slate-100 dark:border-slate-600 flex justify-between items-center group hover:border-indigo-300 dark:hover:border-indigo-900 transition-all">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono" dir="ltr">{item.recipient}</span>
                      <span className="text-[10px] text-slate-400 truncate w-32">{item.message}</span>
                    </div>
                    <button 
                      onClick={() => cancelItem(item.id)}
                      className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-indigo-600 p-6 rounded-[2rem] text-white shadow-xl shadow-indigo-500/20">
             <div className="flex justify-between items-start">
                <div>
                   <p className="text-indigo-100 text-xs font-bold uppercase tracking-wider mb-1">المستحقين للتنبيه</p>
                   <h4 className="text-4xl font-black">{alerts.length}</h4>
                </div>
                <div className="p-3 bg-white/20 rounded-2xl">
                   <AlertCircle size={24} />
                </div>
             </div>
             <p className="mt-4 text-xs text-indigo-100 leading-relaxed">
               يتم عرض المشتركين الذين تجاوزوا حد {threshold.toLocaleString()} د.ع. يمكنك البدء بإرسال يدوي متتابع الآن.
             </p>
          </div>
        </div>

        {/* Alerts Table */}
        <div className="lg:col-span-2">
          <div className="glass-card rounded-[2.5rem] overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/20 text-slate-800 dark:text-white">
               <div className="flex items-center gap-4">
                  <h3 className="font-black flex items-center gap-2">
                    <MessageCircle size={20} className="text-rose-500" />
                    قائمة الديون
                  </h3>
                  
                  <div className="flex items-center bg-white/50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
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
                      onClick={startSequentialSender}
                      disabled={alerts.length === 0}
                      className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      <Layers size={14} />
                      إرسال جماعي
                    </button>
                  </div>
               </div>
               <button onClick={load} className="text-slate-400 hover:text-indigo-600 transition-colors">
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
               </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                    <th className="px-6 py-4">المشترك</th>
                    <th className="px-6 py-4">المنطقة</th>
                    <th className="px-6 py-4">الدين المستحق</th>
                    <th className="px-6 py-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {alerts.map(sub => (
                    <tr key={sub.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group">
                      <td className="px-6 py-5">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 font-bold text-sm">
                               {sub.real_name?.[0] || '?'}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 dark:text-white text-sm">
                                {sub.real_name || sub.user_code || '—'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono tracking-tight" dir="ltr">{sub.phone || 'بدون رقم'}</span>
                            </div>
                         </div>
                      </td>
                      <td className="px-6 py-5">
                         <div className="flex flex-col">
                           <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{sub.zone || '—'}</span>
                           <span className="text-[9px] text-slate-400">{sub.fat || ''}</span>
                         </div>
                      </td>
                      <td className="px-6 py-5">
                         <span className="text-sm font-black text-rose-600 tabular-nums">
                           {sub.debt.toLocaleString()} د.ع
                         </span>
                      </td>
                      <td className="px-6 py-5">
                         <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700">
                            بانتظار الإجراء
                         </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Sequential Sender Modal */}
      {senderModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/20 text-slate-800 dark:text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <Layers size={20} />
                </div>
                <div>
                  <h3 className="font-black">طابور التنبيه المتتابع</h3>
                  <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                    إرسال {senderQueue.length} رسالة تذكير بالدين
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSenderModalOpen(false)}
                className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
               <div className="space-y-4">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">التقدم</span>
                    <span className="text-lg font-black text-rose-600" dir="ltr">
                      {currentIndex + 1} / {senderQueue.length}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-rose-600 transition-all duration-300" 
                      style={{ width: `${((currentIndex + 1) / senderQueue.length) * 100}%` }}
                    />
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center mx-auto shadow-sm">
                      <Users size={30} className="text-slate-400" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-slate-800 dark:text-white">
                        {senderQueue[currentIndex].real_name || senderQueue[currentIndex].user_code || '—'}
                      </h4>
                      <p className="text-sm font-mono text-slate-500" dir="ltr">{senderQueue[currentIndex].phone}</p>
                    </div>
                    <div className="inline-block px-4 py-1.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-sm font-black">
                      المبلغ: {senderQueue[currentIndex].debt.toLocaleString()} د.ع
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
                {currentIndex === senderQueue.length - 1 ? 'إرسال وإنهاء' : 'إرسال والمشترك التالي'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
