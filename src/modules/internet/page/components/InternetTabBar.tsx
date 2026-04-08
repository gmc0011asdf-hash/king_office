import { Users, DollarSign, Package, Map, Wallet, Tags, BarChart3, Phone, Globe2, Bell } from 'lucide-react';
import type { InternetTab } from './types';

export interface InternetTabBarProps {
  activeTab: InternetTab;
  setActiveTab: (t: InternetTab) => void;
  subscribersWithDebtCount: number;
  showFtthPortal?: boolean;
  /** إن كان false يُخفى تبويب دليل الهواتف (صلاحية من الإعدادات) */
  showPhoneDirectory?: boolean;
}

const TAB_CONFIG_BASE: { key: InternetTab; label: string; icon: React.ReactNode }[] = [
  { key: 'subscribers', label: 'المشتركين', icon: <Users size={18} /> },
  { key: 'debts', label: 'الديون', icon: <DollarSign size={18} /> },
  { key: 'materials', label: 'مواد الإنترنت', icon: <Package size={18} /> },
  { key: 'zones', label: 'المناطق و FAT', icon: <Map size={18} /> },
  { key: 'wallet', label: 'محفظة الإنترنت', icon: <Wallet size={18} /> },
  { key: 'categories', label: 'فئات الاشتراك', icon: <Tags size={18} /> },
  { key: 'phoneDirectory', label: 'دليل الهواتف', icon: <Phone size={18} /> },
  { key: 'ftthPortal', label: 'بوابة FTTH', icon: <Globe2 size={18} /> },
  { key: 'reports', label: 'تقارير الأرباح', icon: <BarChart3 size={18} /> },
  { key: 'alerts', label: 'التنبيهات', icon: <Bell size={18} /> },
];

export function InternetTabBar({
  activeTab,
  setActiveTab,
  subscribersWithDebtCount,
  showFtthPortal = false,
  showPhoneDirectory = true,
}: InternetTabBarProps): React.ReactElement {
  let TAB_CONFIG = TAB_CONFIG_BASE;
  if (!showFtthPortal) {
    TAB_CONFIG = TAB_CONFIG.filter((t) => t.key !== 'ftthPortal');
  }
  if (!showPhoneDirectory) {
    TAB_CONFIG = TAB_CONFIG.filter((t) => t.key !== 'phoneDirectory');
  }
  return (
    <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto bg-slate-50 dark:bg-slate-900 z-30 pt-1 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      {TAB_CONFIG.map(({ key, label, icon }) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === key
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {icon}
            {label}
            {key === 'debts' && subscribersWithDebtCount > 0 && (
              <span className="bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs px-1.5 py-0.5 rounded">
                {subscribersWithDebtCount}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
