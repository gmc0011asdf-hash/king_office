import { canAccessLines } from '@/utils/permissions';
import type { User } from '@/context/AppContext';
import type { OfficeTab } from './types';

export interface OfficeTabBarProps {
  tab: OfficeTab;
  setTab: (t: OfficeTab) => void;
  customersWithDebtCount: number;
  loadInvoices: () => void;
  currentUser: User | null | undefined;
}

export function OfficeTabBar({
  tab,
  setTab,
  customersWithDebtCount,
  loadInvoices,
  currentUser,
}: OfficeTabBarProps): React.ReactElement {
  const btn = (t: OfficeTab, label: string, badge?: React.ReactNode) => (
    <button
      onClick={() => {
        if (t === 'invoices') loadInvoices();
        setTab(t);
      }}
      className={`px-3 py-2.5 sm:px-4 rounded-xl text-sm font-medium touch-manipulation min-h-[44px] ${
        tab === t
          ? 'bg-slate-900 text-white'
          : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600'
      }`}
    >
      {label}
      {badge ?? null}
    </button>
  );

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 p-2 shadow-sm border border-slate-200 dark:border-slate-700 overflow-x-auto">
      <div className="flex flex-wrap gap-2 min-w-0">
        {btn('quick_sale', 'البيع السريع')}
        {btn('inventory', 'المخزون')}
        {btn('customers', 'سجل الزبائن')}
        {btn('invoices', 'الفواتير')}
        {btn(
          'debts',
          'الديون',
          customersWithDebtCount > 0 ? (
            <span className="mr-1 px-1.5 py-0.5 text-xs bg-rose-500 text-white rounded-full">
              {customersWithDebtCount}
            </span>
          ) : undefined
        )}
        {canAccessLines(currentUser) && btn('lines', 'الخطوط')}
        {btn('reports', 'التقارير')}
        {btn('alerts', 'تنبيهات الديون')}
      </div>
    </div>
  );
}
