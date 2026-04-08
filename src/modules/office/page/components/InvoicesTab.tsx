import { Search, Plus, Printer, Trash2 } from 'lucide-react';
import type { Invoice } from './types';

export interface InvoicesTabProps {
  invoiceSearch: string;
  setInvoiceSearch: (v: string) => void;
  invoiceStatusFilter: string;
  setInvoiceStatusFilter: (v: string) => void;
  invoiceDateFrom: string;
  setInvoiceDateFrom: (v: string) => void;
  invoiceDateTo: string;
  setInvoiceDateTo: (v: string) => void;
  invoices: Invoice[];
  loadInvoices: () => void;
  canOffice: (action: string) => boolean;
  onOpenInvoice: () => void;
  onPrintInvoice: (inv: Invoice) => void;
  onDeleteInvoice: (inv: Invoice) => void;
}

export function InvoicesTab({
  invoiceSearch,
  setInvoiceSearch,
  invoiceStatusFilter,
  setInvoiceStatusFilter,
  invoiceDateFrom,
  setInvoiceDateFrom,
  invoiceDateTo,
  setInvoiceDateTo,
  invoices,
  loadInvoices,
  canOffice,
  onOpenInvoice,
  onPrintInvoice,
  onDeleteInvoice,
}: InvoicesTabProps): React.ReactElement {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Printer size={18} />
          <h2 className="font-semibold text-slate-900 dark:text-white">الفواتير</h2>
        </div>
        {canOffice('createInvoice') && (
          <button onClick={onOpenInvoice} className="px-4 py-2 rounded-xl bg-slate-900 text-white flex items-center gap-2 text-sm">
            <Plus size={16} />
            إنشاء فاتورة
          </button>
        )}
      </div>
      <div className="p-4 space-y-3 border-b border-slate-200 dark:border-slate-600">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-slate-500 mb-1">بحث (اسم أو رقم فاتورة)</label>
            <input
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadInvoices()}
              placeholder="ابحث..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800"
            />
          </div>
          <div className="min-w-[120px]">
            <label className="block text-xs text-slate-500 mb-1">الحالة</label>
            <select
              value={invoiceStatusFilter}
              onChange={(e) => setInvoiceStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800"
            >
              <option value="">الكل</option>
              <option value="paid">مسدد</option>
              <option value="unpaid">غير مسدد</option>
              <option value="partial">مسدد جزئيًا</option>
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs text-slate-500 mb-1">من تاريخ</label>
            <input
              type="date"
              value={invoiceDateFrom}
              onChange={(e) => setInvoiceDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800"
              dir="ltr"
            />
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs text-slate-500 mb-1">إلى تاريخ</label>
            <input
              type="date"
              value={invoiceDateTo}
              onChange={(e) => setInvoiceDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800"
              dir="ltr"
            />
          </div>
          <button onClick={loadInvoices} className="px-4 py-2 rounded-xl bg-slate-700 text-white text-sm flex items-center gap-2">
            <Search size={16} />
            بحث
          </button>
        </div>
      </div>
      <div className="p-4">
        {invoices.length === 0 ? (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400">لا توجد فواتير. اضغط إنشاء فاتورة للبدء.</div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-600 rounded-2xl">
              <table className="w-full text-sm tabular-nums table-fixed border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                  <tr className="text-slate-700 dark:text-slate-200">
                    <th className="px-4 py-3 text-right w-[12%]">رقم الفاتورة</th>
                    <th className="px-4 py-3 text-right w-[18%]">الزبون</th>
                    <th className="px-4 py-3 text-center w-[12%]">التاريخ</th>
                    <th className="px-4 py-3 text-right w-[14%]">المجموع</th>
                    <th className="px-4 py-3 text-right w-[14%]">المدفوع</th>
                    <th className="px-4 py-3 text-center w-[12%]">الحالة</th>
                    <th className="px-4 py-3 text-center w-[18%]">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: Invoice) => {
                    const cn = inv?.customerName ?? inv?.customer_name ?? '-';
                    const dateStr = inv?.date ? String(inv.date).split('T')[0] : '-';
                    const total = Number(inv?.totalAmount ?? inv?.total_amount ?? 0);
                    const paid = Number(inv?.paidAmount ?? inv?.paid_amount ?? 0);
                    const status = inv?.isPaid ?? inv?.is_paid ? 'مسدد' : paid > 0 ? 'جزئي' : 'غير مسدد';
                    return (
                      <tr key={inv.id} className="border-t border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100 text-right" dir="ltr">
                          {inv?.invoiceNo ?? inv?.invoice_no ?? inv.id}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-right">{cn}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-center" dir="ltr">
                          {dateStr}
                        </td>
                        <td className="px-4 py-3 font-bold text-right" dir="ltr">
                          {total.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right" dir="ltr">
                          {paid.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">{status}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => onPrintInvoice(inv)}
                              className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 touch-manipulation"
                              title="طباعة"
                            >
                              <Printer size={16} />
                            </button>
                            {canOffice('createInvoice') && (
                              <button
                                type="button"
                                onClick={() => onDeleteInvoice(inv)}
                                className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 touch-manipulation"
                                title="حذف"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-3">
              {invoices.map((inv: Invoice) => {
                const cn = inv?.customerName ?? inv?.customer_name ?? '-';
                const dateStr = inv?.date ? String(inv.date).split('T')[0] : '-';
                const total = Number(inv?.totalAmount ?? inv?.total_amount ?? 0);
                const paid = Number(inv?.paidAmount ?? inv?.paid_amount ?? 0);
                const status = inv?.isPaid ?? inv?.is_paid ? 'مسدد' : paid > 0 ? 'جزئي' : 'غير مسدد';
                return (
                  <div key={inv.id} className="rounded-xl border border-slate-200 dark:border-slate-600 p-4 bg-white dark:bg-slate-800">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-slate-100" dir="ltr">
                          {inv?.invoiceNo ?? inv?.invoice_no ?? inv.id}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">{cn}</div>
                        <div className="text-xs text-slate-500 mt-1" dir="ltr">
                          {dateStr}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          status === 'مسدد' ? 'bg-emerald-100 text-emerald-700' : status === 'جزئي' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                    <div className="mt-3 flex justify-between text-sm tabular-nums">
                      <span>
                        المجموع: <strong dir="ltr">{total.toLocaleString()}</strong>
                      </span>
                      <span>
                        المدفوع: <strong dir="ltr">{paid.toLocaleString()}</strong>
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => onPrintInvoice(inv)}
                        className="flex-1 py-2.5 rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 touch-manipulation min-h-[44px]"
                      >
                        <Printer size={18} />
                        طباعة
                      </button>
                      {canOffice('createInvoice') && (
                        <button
                          type="button"
                          onClick={() => onDeleteInvoice(inv)}
                          className="flex-1 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 flex items-center justify-center gap-2 touch-manipulation min-h-[44px]"
                        >
                          <Trash2 size={18} />
                          حذف
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
