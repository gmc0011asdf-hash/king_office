import { Wallet, Printer } from 'lucide-react';
import type { OfficeCustomer } from './types';

export interface DebtsTabProps {
  customersWithDebt: OfficeCustomer[];
  onCustomerDetails: (c: OfficeCustomer) => void;
  onPrintReport: (c: OfficeCustomer) => void;
}

export function DebtsTab({ customersWithDebt, onCustomerDetails, onPrintReport }: DebtsTabProps): React.ReactElement {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <Wallet size={18} />
        <h2 className="font-semibold text-slate-900 dark:text-white">الديون</h2>
        <span className="text-sm text-slate-500">الزبائن الذين عليهم ديون</span>
      </div>
      <div className="p-4">
        {customersWithDebt.length === 0 ? (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400">لا يوجد زبائن مدينون.</div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-600 rounded-2xl">
            <table className="w-full text-sm tabular-nums table-fixed border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                <tr className="text-slate-700 dark:text-slate-200">
                  <th className="px-4 py-3 text-right w-[8%]">رقم</th>
                  <th className="px-4 py-3 text-right w-[25%]">اسم الزبون</th>
                  <th className="px-4 py-3 text-center w-[20%]">الهاتف</th>
                  <th className="px-4 py-3 text-right w-[22%]">الدين</th>
                  <th className="px-4 py-3 text-center w-[25%]">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {customersWithDebt.map((c: OfficeCustomer, idx: number) => (
                  <tr key={c.id} className="border-t border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="px-4 py-3 text-slate-600 text-right" dir="ltr">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100 text-right">{c?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-center" dir="ltr">
                      {c?.phone ?? '-'}
                    </td>
                    <td className="px-4 py-3 font-black text-rose-600 text-right" dir="ltr">
                      {Number(c?.debt ?? 0).toLocaleString()} د.ع
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => onCustomerDetails(c)}
                          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm"
                          title="تفاصيل"
                        >
                          تفاصيل
                        </button>
                        <button
                          type="button"
                          onClick={() => onPrintReport(c)}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                          title="طباعة"
                        >
                          <Printer size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
