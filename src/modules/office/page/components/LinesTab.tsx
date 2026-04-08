import { Smartphone } from 'lucide-react';
import SimCards from '@/pages/SimCards';

export function LinesTab(): React.ReactElement {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <Smartphone size={18} />
        <h2 className="font-semibold text-slate-900 dark:text-white">قسم الخطوط</h2>
      </div>
      <div className="p-4">
        <SimCards />
      </div>
    </div>
  );
}
