import React, { useState, useEffect, useCallback } from 'react';
import { Search, Upload, Download, X, Phone, Plus, Pencil, Trash2, Wrench, MessageCircle, Layers, Users, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { ApiRequestError } from '@/api/client';
import { internetPhonesApi } from '@/modules/internet/api/phones.api';
import { templatesApi, type MessageTemplate } from '@/modules/settings/api/templates.api';
import { IRAQ_PHONE_HINT_AR, requireIraqMobile } from '@/utils/iraqPhone';
import type { InternetPhone, InternetPhoneStats } from './types';

const PAGE_SIZE = 50;

export function PhoneDirectoryTab(): React.ReactElement {
  const { addNotification, logActivity } = useAppContext();
  const [phones, setPhones] = useState<InternetPhone[]>([]);
  const [stats, setStats] = useState<InternetPhoneStats>({ total: 0, unique_prefixes: 0 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [normalizeLoading, setNormalizeLoading] = useState(false);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formSequence, setFormSequence] = useState('0');

  // WhatsApp Promo State
  const [promoTemplate, setPromoTemplate] = useState<string | null>(null);
  const [senderModalOpen, setSenderModalOpen] = useState(false);
  const [senderQueue, setSenderQueue] = useState<InternetPhone[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bulkCount, setBulkCount] = useState(20);

  const loadPhones = useCallback(async () => {
    setLoading(true);
    try {
      const [data, statsData] = await Promise.all([
        internetPhonesApi.getAll({ skip: page * PAGE_SIZE, limit: PAGE_SIZE, search: search || undefined }),
        internetPhonesApi.getStats(),
      ]);
      setPhones(data);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load phones', err);
      setPhones([]);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadPhones();
    templatesApi.getAll().then(ts => {
      const match = ts.find((t: MessageTemplate) => t.key === 'promo_msg');
      if (match) setPromoTemplate(match.body);
    }).catch(console.error);
  }, [loadPhones]);

  const handleSendPromo = (p: InternetPhone) => {
    const raw = (p.phone_number || '').replace(/\D/g, '');
    let formatted = raw;
    if (formatted.startsWith('0')) formatted = formatted.slice(1);
    if (!formatted.startsWith('964')) formatted = '964' + formatted;

    let msg = '';
    if (promoTemplate) {
      msg = promoTemplate.replace(/\[Name\]/g, p.name || 'عزيزي المشترك');
    } else {
      msg = `مرحباً ${p.name || ''}، نود إعلامكم بوجود عروض جديدة لدينا. يرجى التواصل معنا للمزيد من التفاصيل.`;
    }

    const url = `https://wa.me/${formatted}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const startBulkPromo = () => {
    const qualified = phones.filter(p => p.phone_number);
    if (qualified.length === 0) {
      addNotification?.('دليل الهواتف', 'لا توجد أرقام صالحة في القائمة الحالية', 'alert');
      return;
    }
    setSenderQueue(qualified.slice(0, bulkCount));
    setCurrentIndex(0);
    setSenderModalOpen(true);
  };

  const handleNextInQueue = () => {
    handleSendPromo(senderQueue[currentIndex]);
    if (currentIndex < senderQueue.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setSenderModalOpen(false);
    }
  };

  /** إن أصبحت الصفحة فارغة بعد حذف آخر عنصر في صفحة لاحقة */
  useEffect(() => {
    if (!loading && phones.length === 0 && page > 0) {
      setPage((p) => Math.max(0, p - 1));
    }
  }, [loading, phones.length, page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    loadPhones();
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormName('');
    setFormPhone('');
    setFormSequence('0');
    setFormModalOpen(true);
  };

  const openEditForm = (p: InternetPhone) => {
    setEditingId(p.id);
    setFormName(p.name ?? '');
    setFormPhone(p.phone_number ?? '');
    setFormSequence(String(p.sequence ?? 0));
    setFormModalOpen(true);
  };

  const closeFormModal = () => {
    setFormModalOpen(false);
    setEditingId(null);
    setFormSaving(false);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let phone: string;
    try {
      phone = requireIraqMobile(formPhone);
    } catch {
      addNotification?.('دليل الهواتف', IRAQ_PHONE_HINT_AR, 'alert');
      return;
    }
    const seq = parseInt(formSequence, 10);
    const sequence = Number.isFinite(seq) ? seq : 0;

    setFormSaving(true);
    try {
      if (editingId != null) {
        await internetPhonesApi.update(editingId, {
          phone_number: phone,
          name: formName.trim(),
          sequence,
        });
        addNotification?.('دليل الهواتف', `تم تعديل السجل: ${phone}`, 'info');
        logActivity?.(
          'internet',
          'phone_directory_edit',
          `تعديل دليل هاتف — ${formName.trim() || '—'} / ${phone}`,
        );
      } else {
        await internetPhonesApi.create({
          phone_number: phone,
          name: formName.trim() || undefined,
          sequence,
        });
        addNotification?.('دليل الهواتف', `تمت إضافة السجل: ${phone}`, 'info');
        logActivity?.(
          'internet',
          'phone_directory_add',
          `إضافة دليل هاتف — ${formName.trim() || '—'} / ${phone}`,
        );
      }
      closeFormModal();
      setPage(0);
      await loadPhones();
    } catch (err: any) {
      const msg = err?.message ?? 'فشل الحفظ';
      addNotification?.('دليل الهواتف', msg, 'alert');
      logActivity?.(
        'internet',
        editingId != null ? 'phone_directory_edit_failed' : 'phone_directory_add_failed',
        msg,
      );
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (p: InternetPhone) => {
    if (!window.confirm(`حذف السجل؟\n${p.name ? `${p.name} — ` : ''}${p.phone_number}`)) return;
    try {
      await internetPhonesApi.delete(p.id);
      addNotification?.('دليل الهواتف', `تم حذف: ${p.phone_number}`, 'info');
      logActivity?.('internet', 'phone_directory_delete', `حذف دليل هاتف — ${p.name || '—'} / ${p.phone_number}`);
      await loadPhones();
    } catch (err: any) {
      const msg = err?.message ?? 'فشل الحذف';
      addNotification?.('دليل الهواتف', msg, 'alert');
      logActivity?.('internet', 'phone_directory_delete_failed', msg);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      setImportMessage('يرجى اختيار ملف Excel');
      return;
    }
    if (!importFile.name.endsWith('.xlsx') && !importFile.name.endsWith('.xls')) {
      setImportMessage('يرجى رفع ملف Excel (.xlsx أو .xls)');
      return;
    }
    setImportLoading(true);
    setImportMessage('');
    try {
      const result = await internetPhonesApi.importExcel(importFile);
      const msg = result?.message ?? `تم: ${result?.inserted ?? 0} إضافة، ${result?.updated ?? 0} تحديث`;
      setImportMessage(msg);
      setImportFile(null);
      loadPhones();
      addNotification?.('دليل الهواتف', `استيراد Excel — ${msg}`, 'info');
      logActivity?.(
        'internet',
        'phone_directory_import',
        `استيراد دليل الهواتف من Excel — ${result?.inserted ?? 0} إضافة، ${result?.updated ?? 0} تحديث`,
      );
    } catch (err: any) {
      const fail = err?.message ?? 'فشل الاستيراد';
      setImportMessage(fail);
      addNotification?.('دليل الهواتف', fail, 'alert');
      logActivity?.('internet', 'phone_directory_import_failed', fail);
    } finally {
      setImportLoading(false);
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const blob = await internetPhonesApi.exportExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'internet_phones.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      addNotification?.('دليل الهواتف', 'تم تصدير دليل الهواتف إلى Excel بنجاح', 'info');
      logActivity?.('internet', 'phone_directory_export', 'تصدير دليل الهواتف إلى ملف Excel');
    } catch (err: any) {
      console.error('Export failed', err);
      const fail = err?.message ?? 'فشل تصدير دليل الهواتف';
      addNotification?.('دليل الهواتف', fail, 'alert');
      logActivity?.('internet', 'phone_directory_export_failed', fail);
    } finally {
      setExportLoading(false);
    }
  };

  const handleNormalizeStored = async () => {
    if (
      !window.confirm(
        'سيتم تحديث كل أرقام دليل الهواتف في قاعدة البيانات إلى الصيغة 077/078 (إضافة الصفر عند الحاجة، مثل 7712345678 → 07712345678). المتابعة؟',
      )
    ) {
      return;
    }
    setNormalizeLoading(true);
    try {
      const result = await internetPhonesApi.normalizeStored();
      const extra =
        result.skipped_count > 0
          ? ` — تخطي ${result.skipped_count} (تعارض أو رقم غير صالح؛ راجع سجل الحركات أو الطرفية)`
          : '';
      addNotification?.('دليل الهواتف', `${result.message || 'تم التصحيح'}${extra}`, 'info');
      logActivity?.(
        'internet',
        'phone_directory_normalize_stored',
        `تصحيح أرقام دليل الهواتف في DB — محدّث ${result.updated}، متخطى ${result.skipped_count}`,
      );
      setPage(0);
      await loadPhones();
    } catch (err: unknown) {
      const fail =
        err instanceof ApiRequestError
          ? err.message || `خطأ ${err.status}`
          : String((err as { message?: string })?.message ?? 'فشل تصحيح الأرقام');
      addNotification?.('دليل الهواتف', fail, 'alert');
      console.error('normalize-stored failed', err);
      logActivity?.('internet', 'phone_directory_normalize_stored_failed', fail);
    } finally {
      setNormalizeLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-700/50">
        <div className="flex items-center gap-4">
          <h3 className="font-bold text-slate-800 dark:text-white">دليل الهواتف</h3>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            إجمالي: {stats.total} | بادئات: {stats.unique_prefixes}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الرقم..."
                className="pr-10 pl-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 w-48 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          <button
            type="submit"
            className="bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-500"
          >
            بحث
          </button>
        </form>
        <div className="flex items-center bg-slate-100 dark:bg-slate-700 p-1 rounded-lg border border-slate-200 dark:border-slate-600">
          <select
            value={bulkCount}
            onChange={(e) => setBulkCount(Number(e.target.value))}
            className="bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 outline-none px-2"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <button
            onClick={startBulkPromo}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2"
          >
            <Layers size={14} />
            إرسال ترويجي
          </button>
        </div>
        <button
          type="button"
          onClick={openAddForm}
            className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            إضافة سجل
          </button>
          <button
            type="button"
            onClick={handleNormalizeStored}
            disabled={normalizeLoading}
            title="يحدّث الأرقام المحفوظة في القاعدة (إضافة 0 عند 77/78 بدون صفر)"
            className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Wrench size={16} />
            {normalizeLoading ? 'جاري التصحيح...' : 'تصحيح الأرقام في القاعدة'}
          </button>
          <button
            type="button"
            onClick={() => { setImportModalOpen(true); setImportMessage(''); setImportFile(null); }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <Upload size={16} />
            استيراد Excel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportLoading}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Download size={16} />
            {exportLoading ? 'جاري التصدير...' : 'تصدير Excel'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 font-sans">جاري التحميل...</div>
        ) : (
          <table className="w-full text-right border-collapse font-sans">
            <thead className="bg-slate-50 dark:bg-slate-700/80 border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">#</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">الترتيب</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">الاسم</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200" dir="ltr">رقم الهاتف</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200 w-[1%] whitespace-nowrap">واتساب</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200 w-[1%] whitespace-nowrap">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-600 text-sm text-slate-800 dark:text-slate-100">
              {phones.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    لا توجد سجلات. أضف سجلاً يدوياً أو استورد من Excel.
                  </td>
                </tr>
              ) : (
                phones.map((p, i) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/60 border-b border-slate-100 dark:border-slate-700/80 transition-colors">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 tabular-nums">{page * PAGE_SIZE + i + 1}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 tabular-nums">{p.sequence ?? 0}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 leading-relaxed">{p.name || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[13px] tracking-wide text-slate-700 dark:text-slate-200" dir="ltr">{p.phone_number}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleSendPromo(p)}
                        className="p-2 rounded-lg text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                        title="إرسال رسالة ترويجية"
                      >
                        <MessageCircle size={18} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditForm(p)}
                          className="p-2 rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                          title="تعديل"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          className="p-2 rounded-lg text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                          title="حذف"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {stats.total > PAGE_SIZE && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            صفحة {page + 1} من {Math.ceil(stats.total / PAGE_SIZE)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50"
            >
              السابق
            </button>
            <button
              type="button"
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= stats.total}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50"
            >
              التالي
            </button>
          </div>
        </div>
      )}

      {formModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-[55] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700 font-sans">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/80 dark:bg-slate-700/40">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Phone size={20} className="text-violet-600 dark:text-violet-400" />
                {editingId != null ? 'تعديل سجل' : 'إضافة سجل'}
              </h3>
              <button type="button" onClick={closeFormModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">الاسم</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="اختياري"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  placeholder="077… أو 7712345678"
                  dir="ltr"
                  maxLength={15}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">الترتيب (للفرز)</label>
                <input
                  type="number"
                  value={formSequence}
                  onChange={(e) => setFormSequence(e.target.value)}
                  min={0}
                  step={1}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                11 رقمًا تبدأ بـ 077 أو 078؛ يُضاف 0 تلقائيًا إن أدخلت الرقم بدون الصفر. لا يُسمح بالتكرار مع سجل آخر.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <button type="button" onClick={closeFormModal} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {formSaving ? 'جاري الحفظ...' : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700 font-sans">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/80 dark:bg-slate-700/40">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Phone size={20} className="text-indigo-600 dark:text-indigo-400" />
                استيراد دليل الهواتف من Excel
              </h3>
              <button type="button" onClick={() => setImportModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                الأعمدة المتوقعة: name (الاسم)، phone_number (رقم الهاتف). الأرقام المكررة سيتم تحديثها.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate-600 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 dark:file:bg-indigo-900/30 dark:file:text-indigo-300"
              />
              {importMessage && (
                <div className={`p-3 rounded-lg text-sm ${importMessage.includes('فشل') ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'}`}>
                  {importMessage}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50/50 dark:bg-slate-900/20">
              <button type="button" onClick={() => setImportModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
                إلغاء
              </button>
              <button type="button" onClick={handleImport} disabled={importLoading || !importFile} className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 disabled:opacity-50">
                {importLoading ? 'جاري الاستيراد...' : 'استيراد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Promo Sequential Modal */}
      {senderModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/20 text-slate-800 dark:text-white font-sans">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-sans">
                  <Layers size={20} />
                </div>
                <div>
                  <h3 className="font-bold">إرسال حملة ترويجية</h3>
                  <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                    إرسال {senderQueue.length} رسالة عروض
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

            <div className="p-6 font-sans">
               <div className="space-y-4">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">التقدم</span>
                    <span className="text-lg font-black text-indigo-600" dir="ltr">
                      {currentIndex + 1} / {senderQueue.length}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-300" 
                      style={{ width: `${((currentIndex + 1) / senderQueue.length) * 100}%` }}
                    />
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center mx-auto shadow-sm">
                      <Users size={30} className="text-slate-400" />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-slate-800 dark:text-white">{senderQueue[currentIndex]?.name || '—'}</h4>
                      <p className="text-sm font-mono text-slate-500" dir="ltr">{senderQueue[currentIndex]?.phone_number}</p>
                    </div>
                  </div>
               </div>
            </div>

            <div className="p-6 bg-slate-50/50 dark:bg-slate-900/20 border-t border-slate-100 dark:border-slate-700 font-sans">
              <button
                onClick={handleNextInQueue}
                className="w-full h-14 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-bold text-lg flex items-center justify-center gap-3 transition-all"
              >
                <MessageCircle size={24} />
                {currentIndex === senderQueue.length - 1 ? 'إرسال وإنهاء' : 'إرسال والزبون التالي'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
