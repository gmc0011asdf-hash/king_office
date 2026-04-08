import { BarChart3 } from 'lucide-react';

export interface OfficeSummary {
  totalSales?: number;
  totalRevenue?: number;
  totalProfit?: number;
  totalCollected?: number;
  office?: { sales?: number; revenue?: number; profit?: number; sectionId?: number };
  lines?: { sales?: number; revenue?: number; profit?: number; sectionId?: number };
}

export interface ReportsTabProps {
  officeSummary: OfficeSummary | null;
  sales: unknown[];
}

function saleRowAmount(x: unknown): number {
  const r = x as Record<string, unknown>;
  return Number(r?.totalAmount ?? r?.total_amount ?? r?.total ?? 0);
}

function saleRowProfit(x: unknown): number {
  const r = x as Record<string, unknown>;
  return Number(r?.profit ?? 0);
}

export function ReportsTab({ officeSummary, sales }: ReportsTabProps): React.ReactElement {
  const salesList = sales as unknown[];
  const totalSales = Number(officeSummary?.totalSales ?? salesList.length);
  const totalRevenue = Number(
    officeSummary?.totalRevenue ?? salesList.reduce((s: number, x: unknown) => s + saleRowAmount(x), 0)
  );
  const totalProfit = Number(
    officeSummary?.totalProfit ?? salesList.reduce((s: number, x: unknown) => s + saleRowProfit(x), 0)
  );
  const totalCollected = Number(officeSummary?.totalCollected ?? 0);

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <BarChart3 size={18} />
        <h2 className="font-semibold text-slate-900 dark:text-white">تقارير المكتب</h2>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-300">إجمالي المبيعات</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white" dir="ltr">
            {totalSales.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-300">إجمالي الإيرادات</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white" dir="ltr">
            {totalRevenue.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-300">إجمالي الأرباح</div>
          <div className="text-2xl font-black text-emerald-700" dir="ltr">
            {totalProfit.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-300">المبالغ المستحصلة</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white" dir="ltr">
            {totalCollected.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="p-4 pt-0">
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-600 rounded-2xl">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
              <tr className="text-right">
                <th className="px-4 py-3 text-right">القسم</th>
                <th className="px-4 py-3 text-center">عدد العمليات</th>
                <th className="px-4 py-3 text-center">الإيرادات</th>
                <th className="px-4 py-3 text-center">الأرباح</th>
                <th className="px-4 py-3 text-center">رقم القسم</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'المكتب', d: officeSummary?.office },
                { name: 'الخطوط', d: officeSummary?.lines },
              ].map((row: { name: string; d?: { sales?: number; revenue?: number; profit?: number; sectionId?: number } }, idx: number) => (
                <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100 text-right">{row.name}</td>
                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200 text-center" dir="ltr">
                    {Number(row?.d?.sales ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200 text-center" dir="ltr">
                    {Number(row?.d?.revenue ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-black text-emerald-700 text-center" dir="ltr">
                    {Number(row?.d?.profit ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-black text-slate-900 dark:text-slate-100 text-center" dir="ltr">
                    {Number(row?.d?.sectionId ?? 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
