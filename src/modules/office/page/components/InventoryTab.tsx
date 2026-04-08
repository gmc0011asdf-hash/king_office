import { Search, Plus, Package, Edit, Trash2 } from 'lucide-react';
import type { OfficeMaterial } from './types';

export interface InventoryTabProps {
  search: string;
  setSearch: (v: string) => void;
  officeMaterials: OfficeMaterial[];
  materialsThreshold: number;
  canOffice: (action: string) => boolean;
  onAddMaterial: () => void;
  onEditMaterial: (item: OfficeMaterial) => void;
  onDeleteMaterial: (id: number) => void;
}

export function InventoryTab({
  search,
  setSearch,
  officeMaterials,
  materialsThreshold,
  canOffice,
  onAddMaterial,
  onEditMaterial,
  onDeleteMaterial,
}: InventoryTabProps): React.ReactElement {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <Package size={18} />
        <h2 className="font-semibold text-slate-900 dark:text-white">المخزون</h2>
        <div className="flex-1" />
        {canOffice('addMaterial') && (
          <button onClick={onAddMaterial} className="px-4 py-2 rounded-xl bg-slate-900 text-white flex items-center gap-2 text-sm">
            <Plus size={16} />
            إضافة مادة
          </button>
        )}
      </div>

      <div className="p-4">
        <div className="relative w-full max-w-md mb-4">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في مواد المكتب..."
            className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-2 outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-600 rounded-2xl">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
              <tr className="text-right text-slate-700 dark:text-slate-200">
                <th className="px-4 py-3 text-right">الاسم</th>
                <th className="px-4 py-3 text-center">سعر الشراء</th>
                <th className="px-4 py-3 text-center">سعر البيع</th>
                <th className="px-4 py-3 text-center">الكمية</th>
                <th className="px-4 py-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {officeMaterials.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    لا توجد بيانات حالياً
                  </td>
                </tr>
              ) : (
                officeMaterials.map((item: OfficeMaterial, idx: number) => {
                  const qty = Number(item?.quantity ?? 0);
                  const isOutOfStock = qty <= 0;
                  const isAtThreshold = !isOutOfStock && qty <= materialsThreshold;
                  const rowClass = isOutOfStock
                    ? 'border-t border-slate-100 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50'
                    : 'border-t border-slate-100 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700';
                  return (
                    <tr key={item?.id ?? idx} className={rowClass}>
                      <td className={`px-4 py-3 font-medium text-right ${isOutOfStock ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                        {item?.name ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-semibold text-center" dir="ltr">
                        {Number(item?.purchasePrice ?? item?.purchase_price ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-semibold text-center" dir="ltr">
                        {Number(item?.sellingPrice ?? item?.selling_price ?? 0).toLocaleString()}
                      </td>
                      <td
                        className={`px-4 py-3 font-black text-center ${isOutOfStock ? 'text-rose-600' : isAtThreshold ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}
                        dir="ltr"
                      >
                        {qty.toLocaleString()}
                        {isOutOfStock ? ' (نافذ)' : ''}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-2">
                          {canOffice('editMaterial') && (
                            <button
                              type="button"
                              onClick={() => onEditMaterial(item)}
                              className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                              title="تعديل"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                          {canOffice('deleteMaterial') && (
                            <button
                              type="button"
                              onClick={() => onDeleteMaterial(Number(item?.id))}
                              className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                              title="حذف"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
