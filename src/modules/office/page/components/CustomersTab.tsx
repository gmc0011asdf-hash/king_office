import { Search, Users } from 'lucide-react';
import type { OfficeCustomer } from './types';

export interface CustomersTabProps {
  customersSearch: string;
  setCustomersSearch: (v: string) => void;
  filteredCustomers: OfficeCustomer[];
  onCustomerClick: (c: OfficeCustomer) => void;
}

export function CustomersTab({
  customersSearch,
  setCustomersSearch,
  filteredCustomers,
  onCustomerClick,
}: CustomersTabProps): React.ReactElement {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <Users size={18} />
        <h2 className="font-semibold text-slate-900 dark:text-white">سجل الزبائن</h2>
      </div>
      <div className="p-4">
        <div className="relative w-full max-w-md mb-4">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={customersSearch}
            onChange={(e) => setCustomersSearch(e.target.value)}
            placeholder="بحث في الزبائن..."
            className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-2 outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-600 rounded-2xl">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
              <tr className="text-right text-slate-700 dark:text-slate-200">
                <th className="px-4 py-3 text-right">الاسم</th>
                <th className="px-4 py-3 text-center">الهاتف</th>
                <th className="px-4 py-3 text-center">الدين</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    لا يوجد زبائن بعد.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c: OfficeCustomer) => (
                  <tr
                    key={c.id}
                    className="border-t border-slate-100 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                    onClick={() => onCustomerClick(c)}
                  >
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100 text-right">{c.name}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-center" dir="ltr">
                      {c.phone}
                    </td>
                    <td className="px-4 py-3 font-black text-rose-600 text-center" dir="ltr">
                      {Number(c.debt ?? 0).toLocaleString()} د.ع
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
