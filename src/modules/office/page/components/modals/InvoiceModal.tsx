import { X, Plus, Trash2, Printer } from 'lucide-react';
import type { Invoice, InvoiceItem, InvoiceCalc, OfficeMaterial } from '../types';

export interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  officeName: string;
  invoiceCustomerName: string;
  setInvoiceCustomerName: (v: string) => void;
  invoiceCustomerPhone: string;
  setInvoiceCustomerPhone: (v: string) => void;
  invoiceCustomerId: number | '';
  setInvoiceCustomerId: (v: number | '') => void;
  invoicePaymentMethod: 'cash' | 'debt';
  setInvoicePaymentMethod: (v: 'cash' | 'debt') => void;
  invoicePaidAmount: string;
  setInvoicePaidAmount: (v: string) => void;
  invoiceNotes: string;
  setInvoiceNotes: (v: string) => void;
  invoiceItems: InvoiceItem[];
  setInvoiceItems: React.Dispatch<React.SetStateAction<InvoiceItem[]>>;
  invoiceCalc: InvoiceCalc;
  invoiceCustomerSuggestions: { id: number; name?: string; phone?: string }[];
  customerNameFocused: boolean;
  setCustomerNameFocused: (v: boolean) => void;
  materialsWithStock: OfficeMaterial[];
  officeMaterials: OfficeMaterial[];
  lastCreatedInvoice: Invoice | null;
  isSavingInvoice: boolean;
  onSave: () => void;
  onPrint: (inv: Invoice) => void;
}

export function InvoiceModal(props: InvoiceModalProps): React.ReactElement | null {
  const {
    isOpen,
    onClose,
    officeName,
    invoiceCustomerName,
    setInvoiceCustomerName,
    invoiceCustomerPhone,
    setInvoiceCustomerPhone,
    invoiceCustomerId,
    setInvoiceCustomerId,
    invoicePaymentMethod,
    setInvoicePaymentMethod,
    invoicePaidAmount,
    setInvoicePaidAmount,
    invoiceNotes,
    setInvoiceNotes,
    invoiceItems,
    setInvoiceItems,
    invoiceCalc,
    invoiceCustomerSuggestions,
    customerNameFocused,
    setCustomerNameFocused,
    materialsWithStock,
    lastCreatedInvoice,
    isSavingInvoice,
    onSave,
    onPrint,
  } = props;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-3xl overflow-hidden max-h-[85vh] flex flex-col border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-white">فاتورة مبيعات</h3>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">العنوان: {officeName}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <label className="block text-xs font-medium text-slate-600 mb-1">اسم الزبون (اختياري)</label>
              <input
                value={invoiceCustomerName}
                onChange={(e) => {
                  setInvoiceCustomerName(e.target.value);
                  setInvoiceCustomerId('');
                }}
                onFocus={() => setCustomerNameFocused(true)}
                onBlur={() => setTimeout(() => setCustomerNameFocused(false), 150)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                placeholder="ابحث أو اكتب اسم زبون جديد..."
              />
              {customerNameFocused && (
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {invoiceCustomerSuggestions.length > 0 ? (
                    invoiceCustomerSuggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setInvoiceCustomerName(c?.name ?? '');
                          setInvoiceCustomerPhone(c?.phone ?? '');
                          setInvoiceCustomerId(c?.id ?? '');
                          setCustomerNameFocused(false);
                        }}
                        className="w-full text-right px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex justify-between items-center"
                      >
                        <span>{c?.name ?? '-'}</span>
                        <span className="text-slate-500 text-xs" dir="ltr">
                          {c?.phone ?? ''}
                        </span>
                      </button>
                    ))
                  ) : invoiceCustomerName.trim() ? (
                    <div className="px-3 py-2 text-sm text-slate-500">لا يوجد مطابق. سيتم إضافة زبون جديد عند الحفظ.</div>
                  ) : (
                    <div className="px-3 py-2 text-sm text-slate-500">اكتب للبحث في الزبائن</div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">رقم الهاتف (اختياري)</label>
              <input
                value={invoiceCustomerPhone}
                onChange={(e) => setInvoiceCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">نوع الدفع</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setInvoicePaymentMethod('cash')}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm border ${
                    invoicePaymentMethod === 'cash' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  نقدًا
                </button>
                <button
                  onClick={() => setInvoicePaymentMethod('debt')}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm border ${
                    invoicePaymentMethod === 'debt' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  آجل
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-600 rounded-xl">
            <table className="w-full text-sm tabular-nums table-fixed border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                <tr className="text-right text-slate-700 dark:text-slate-200">
                  <th className="px-3 py-2 text-right min-w-[160px]">المادة</th>
                  <th className="px-3 py-2 text-center w-[80px]">الكمية</th>
                  <th className="px-3 py-2 text-right w-[100px]">سعر البيع</th>
                  <th className="px-3 py-2 text-right w-[100px]">المجموع</th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {invoiceCalc.items.map((it, idx) => (
                  <tr key={idx} className="border-t border-slate-200 dark:border-slate-600">
                    <td className="px-3 py-2">
                      <select
                        value={it.materialId ?? ''}
                        onChange={(e) => {
                          const materialId = e.target.value ? Number(e.target.value) : '';
                          const material = materialId ? materialsWithStock.find((m) => Number(m.id) === Number(materialId)) : null;
                          const next = [...invoiceItems];
                          next[idx] = {
                            ...next[idx],
                            materialId: materialId as number | '',
                            materialName: material?.name ?? next[idx]?.materialName ?? '',
                            sellingPrice: Number(material?.sellingPrice ?? material?.selling_price ?? next[idx]?.sellingPrice ?? 0),
                          };
                          setInvoiceItems(next);
                        }}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                      >
                        <option value="">اختر المادة...</option>
                        {materialsWithStock.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} (متوفر: {m.quantity})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) => {
                          const next = [...invoiceItems];
                          next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                          setInvoiceItems(next);
                        }}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                        dir="ltr"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={it.sellingPrice}
                        onChange={(e) => {
                          const next = [...invoiceItems];
                          next[idx] = { ...next[idx], sellingPrice: Number(e.target.value) };
                          setInvoiceItems(next);
                        }}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                        dir="ltr"
                      />
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100" dir="ltr">
                      {Number(it.lineTotal ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => {
                          const next = [...invoiceItems];
                          next.splice(idx, 1);
                          setInvoiceItems(next.length ? next : [{ materialId: '', materialName: '', quantity: 1, sellingPrice: 0 }]);
                        }}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                        title="حذف"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <button
              onClick={() => setInvoiceItems([...invoiceItems, { materialId: '', materialName: '', quantity: 1, sellingPrice: 0 }])}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
            >
              <Plus size={16} />
              إضافة مادة
            </button>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full md:w-auto">
              <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">المجموع</div>
                <div className="text-lg font-black text-slate-900 dark:text-white" dir="ltr">
                  {Number(invoiceCalc.totalAmount).toLocaleString()} د.ع
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">المدفوع</label>
                <input
                  dir="ltr"
                  value={invoicePaidAmount}
                  onChange={(e) => setInvoicePaidAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                />
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  الحالة: {invoiceCalc.status === 'paid' ? 'مسدد' : invoiceCalc.status === 'partial' ? 'مسدد جزئيًا' : 'غير مسدد'} | المتبقي:{' '}
                  <span dir="ltr">{Number(invoiceCalc.remaining).toLocaleString()}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات (اختياري)</label>
                <input
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                />
              </div>
            </div>
          </div>

          {lastCreatedInvoice && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm text-emerald-900 dark:text-emerald-200">
                تم إنشاء الفاتورة بنجاح:{' '}
                <span className="font-black" dir="ltr">
                  {String(lastCreatedInvoice?.invoiceNo ?? lastCreatedInvoice?.invoice_no ?? '')}
                </span>
              </div>
              <button onClick={() => onPrint(lastCreatedInvoice)} className="px-4 py-2 rounded-xl bg-emerald-700 text-white flex items-center gap-2">
                <Printer size={16} />
                طباعة الفاتورة
              </button>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            إغلاق
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={invoiceCalc.totalAmount <= 0 || isSavingInvoice || !!lastCreatedInvoice}
          >
            {lastCreatedInvoice ? 'تم الحفظ' : isSavingInvoice ? 'جاري الحفظ...' : 'حفظ الفاتورة'}
          </button>
        </div>
      </div>
    </div>
  );
}
