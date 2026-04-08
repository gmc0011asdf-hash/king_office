import { X, Wallet, Printer } from 'lucide-react';
import type { OfficeCustomer } from '../types';

export interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomer: OfficeCustomer | null;
  payDebtAmount: string;
  setPayDebtAmount: (v: string) => void;
  customerHistory: unknown[];
  customerSales: unknown[];
  customerInvoices: unknown[];
  customerInstallments: unknown[];
  canOffice: (action: string) => boolean;
  onPayDebt: () => void;
  onPrintReport: () => void;
  onPrintInvoice: (inv: unknown) => void;
  onPayInstallment: (installmentId: number) => void;
}

export function CustomerModal(props: CustomerModalProps): React.ReactElement | null {
  const {
    isOpen,
    onClose,
    selectedCustomer,
    payDebtAmount,
    setPayDebtAmount,
    customerHistory,
    customerSales,
    customerInvoices,
    customerInstallments,
    canOffice,
    onPayDebt,
    onPrintReport,
    onPrintInvoice,
    onPayInstallment,
  } = props;

  if (!isOpen || !selectedCustomer) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl overflow-hidden max-h-[85vh] flex flex-col border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 sticky top-0 z-10">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-white">تفاصيل الزبون</h3>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {selectedCustomer?.name ?? '-'} {selectedCustomer?.phone ? `- ${selectedCustomer.phone}` : ''}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">الدين الحالي</div>
                <div className="text-2xl font-black text-rose-600 tabular-nums" dir="ltr">
                  {Number(selectedCustomer?.debt ?? 0).toLocaleString()} د.ع
                </div>
              </div>
              <div className="md:col-span-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4">
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">تسديد دين (مبلغ)</label>
                    <input
                      dir="ltr"
                      value={payDebtAmount}
                      onChange={(e) => setPayDebtAmount(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                    />
                  </div>
                  {canOffice('debtEdit') && (
                    <button
                      onClick={onPayDebt}
                      disabled={Number(payDebtAmount || 0) <= 0 || Number(selectedCustomer?.debt ?? 0) <= 0}
                      className="px-4 py-2 rounded-xl bg-slate-900 text-white flex items-center gap-2 text-sm disabled:opacity-50"
                      type="button"
                    >
                      <Wallet size={16} />
                      تسديد
                    </button>
                  )}
                  <button
                    onClick={onPrintReport}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-600"
                    type="button"
                  >
                    <Printer size={16} />
                    طباعة تقرير
                  </button>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  يمكنك تسديد جزء من الدين أو تسديده بالكامل، وسيتم احتساب المبلغ ضمن المستحصلة في التقارير.
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-bold flex items-center justify-between text-slate-900 dark:text-white">
              <span>سجل حركات الأموال</span>
            </div>
            <div className="p-4">
              {customerHistory.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">لا توجد حركات.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums table-fixed border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
                      <tr className="text-right">
                        <th className="px-3 py-2 text-right">التاريخ</th>
                        <th className="px-3 py-2 text-center">النوع</th>
                        <th className="px-3 py-2 text-right">المبلغ</th>
                        <th className="px-3 py-2 text-right">الوصف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerHistory.map((raw: unknown) => {
                        const h = raw as Record<string, unknown>;
                        return (
                        <tr key={String(h.id)} className="border-b border-slate-100 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400 text-right" dir="ltr">
                            {h?.date ? String(h.date).slice(0, 10) : '-'}
                          </td>
                          <td className="px-3 py-2 text-center">{String(h?.type ?? '-')}</td>
                          <td
                            className={`px-3 py-2 font-bold text-right ${Number(h?.amount ?? 0) < 0 ? 'text-emerald-600' : 'text-slate-900 dark:text-slate-100'}`}
                            dir="ltr"
                          >
                            {Number(h?.amount ?? 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400 text-right">{String(h?.description ?? '-')}</td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-bold flex items-center justify-between">
              <span>الفواتير</span>
              <span className="text-xs text-slate-500">
                عدد الفواتير: <span className="font-black tabular-nums" dir="ltr">{Number(customerInvoices?.length ?? 0).toLocaleString()}</span>
              </span>
            </div>
            <div className="p-4">
              {customerInvoices.length === 0 ? (
                <div className="text-sm text-slate-500">لا توجد فواتير.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums table-fixed border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
                      <tr className="text-right">
                        <th className="px-3 py-2 text-right">رقم الفاتورة</th>
                        <th className="px-3 py-2 text-center">التاريخ</th>
                        <th className="px-3 py-2 text-right">المجموع</th>
                        <th className="px-3 py-2 text-right">المدفوع</th>
                        <th className="px-3 py-2 text-right">المتبقي</th>
                        <th className="px-3 py-2 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerInvoices.map((raw: unknown) => {
                        const inv = raw as Record<string, unknown>;
                        const total = Number(inv?.totalAmount ?? inv?.total_amount ?? 0);
                        const paid = Number(inv?.paidAmount ?? inv?.paid_amount ?? 0);
                        const remaining = Math.max(0, total - paid);
                        const dateStr = inv?.date ? String(inv.date).slice(0, 10) : '-';
                        return (
                          <tr key={String(inv.id)} className="border-b border-slate-100 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">
                            <td className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100 text-right" dir="ltr">
                              {String(inv?.invoiceNo ?? inv?.invoice_no ?? inv.id ?? '-')}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400 text-center" dir="ltr">
                              {dateStr}
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100 text-right" dir="ltr">
                              {total.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right" dir="ltr">
                              {paid.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-rose-600 font-bold text-right" dir="ltr">
                              {remaining.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => onPrintInvoice(inv)}
                                className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600"
                                title="طباعة"
                              >
                                <Printer size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-bold flex items-center justify-between">
              <span>المشتريات</span>
              <span className="text-xs text-slate-500">
                عدد العمليات: <span className="font-black tabular-nums" dir="ltr">{Number(customerSales?.length ?? 0).toLocaleString()}</span>
              </span>
            </div>
            <div className="p-4">
              {customerSales.length === 0 ? (
                <div className="text-sm text-slate-500">لا توجد مشتريات.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead className="bg-slate-50 border border-slate-200">
                      <tr className="text-right">
                        <th className="px-3 py-2 text-right">تاريخ الشراء</th>
                        <th className="px-3 py-2 text-center">المادة / الوصف</th>
                        <th className="px-3 py-2 text-center">نوع الدفع</th>
                        <th className="px-3 py-2 text-center">المبلغ</th>
                        <th className="px-3 py-2 text-center">الأقساط</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerSales.map((raw: unknown) => {
                        const s = raw as Record<string, unknown>;
                        const rawDate = s?.purchaseDate ?? s?.purchase_date ?? s?.date ?? '';
                        const purchaseDate = rawDate ? String(rawDate).slice(0, 10) : '-';
                        const name = String(s?.materialName ?? s?.material_name ?? '-');
                        const pm = String(s?.paymentMethod ?? s?.payment_method ?? '');
                        const pmLabel = pm === 'installments' ? 'أقساط' : pm === 'debt' ? 'آجل' : 'نقد';
                        const total = Number(s?.totalWithCommission ?? s?.total_with_commission ?? s?.totalAmount ?? s?.total_amount ?? 0);
                        const months = Number(s?.installmentsMonths ?? s?.installments_months ?? 0);
                        return (
                          <tr key={String(s.id)} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-700 text-right" dir="ltr">
                              {purchaseDate}
                            </td>
                            <td className="px-3 py-2 text-slate-900 text-center">{name}</td>
                            <td className="px-3 py-2 text-center">
                              <span
                                className={`inline-flex px-2 py-1 rounded-full text-xs font-bold ${
                                  pm === 'installments' ? 'bg-amber-50 text-amber-700' : pm === 'debt' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {pmLabel}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-900 text-center" dir="ltr">
                              {total.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-center" dir="ltr">
                              {months > 0 ? `${months} شهر` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 font-bold flex items-center justify-between">
              <span>الأقساط</span>
              <span className="text-xs text-slate-500">
                عدد الأقساط: <span className="font-black tabular-nums" dir="ltr">{Number(customerInstallments?.length ?? 0).toLocaleString()}</span>
              </span>
            </div>
            <div className="p-4">
              {customerInstallments.length === 0 ? (
                <div className="text-sm text-slate-500">لا توجد أقساط.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead className="bg-slate-50 border border-slate-200">
                      <tr className="text-right">
                        <th className="px-3 py-2 text-right">الشهر</th>
                        <th className="px-3 py-2 text-center">تاريخ الاستحقاق</th>
                        <th className="px-3 py-2 text-center">المبلغ</th>
                        <th className="px-3 py-2 text-center">المتبقي</th>
                        <th className="px-3 py-2 text-center">تاريخ التسديد</th>
                        <th className="px-3 py-2 text-center">الحالة</th>
                        <th className="px-3 py-2 text-center">الإجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerInstallments.map((raw: unknown) => {
                        const it = raw as Record<string, unknown>;
                        const amount = Number(it?.amount ?? 0);
                        const paid = Number(it?.paidAmount ?? it?.paid_amount ?? 0);
                        const remaining = Math.max(0, amount - paid);
                        const isPaid = Boolean(it?.isPaid ?? it?.is_paid ?? remaining === 0);
                        const paidDateRaw = it?.paidDate ?? it?.paid_date ?? null;
                        const paidDate = paidDateRaw ? String(paidDateRaw).slice(0, 19).replace('T', ' ') : '-';
                        const dueDateRaw = it?.dueDate ?? it?.due_date ?? '-';
                        return (
                          <tr key={String(it.id)} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-2 font-black text-slate-900 text-right">
                              #{Number(it?.installmentIndex ?? it?.installment_index ?? 0)}
                            </td>
                            <td className="px-3 py-2 text-slate-700 text-center" dir="ltr">
                              {String(dueDateRaw)}
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-900 text-center" dir="ltr">
                              {amount.toLocaleString()}
                            </td>
                            <td
                              className={`px-3 py-2 font-black text-center ${remaining > 0 ? 'text-rose-600' : 'text-emerald-700'}`}
                              dir="ltr"
                            >
                              {remaining.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-slate-700 text-center" dir="ltr">
                              {paidDate}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-black border ${
                                  isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                {isPaid ? 'مسدد' : 'غير مسدد'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => onPayInstallment(Number(it.id))}
                                disabled={isPaid}
                                className={`px-3 py-2 rounded-xl text-sm font-bold border inline-flex items-center justify-center gap-2 min-w-[110px] ${
                                  isPaid ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800'
                                }`}
                                type="button"
                              >
                                <Wallet size={16} />
                                {isPaid ? 'تم التسديد' : 'تسديد القسط'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
