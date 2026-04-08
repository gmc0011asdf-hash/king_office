import { X } from 'lucide-react';

export interface AddMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  materialName: string;
  setMaterialName: (v: string) => void;
  materialPurchasePrice: string;
  setMaterialPurchasePrice: (v: string) => void;
  materialSellingPrice: string;
  setMaterialSellingPrice: (v: string) => void;
  materialQty: string;
  setMaterialQty: (v: string) => void;
  onSubmit: () => void;
}

export function AddMaterialModal({
  isOpen,
  onClose,
  materialName,
  setMaterialName,
  materialPurchasePrice,
  setMaterialPurchasePrice,
  materialSellingPrice,
  setMaterialSellingPrice,
  materialQty,
  setMaterialQty,
  onSubmit,
}: AddMaterialModalProps): React.ReactElement | null {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
          <h3 className="font-bold text-slate-800 dark:text-white">إضافة مادة</h3>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">اسم المادة</label>
            <input
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">شراء</label>
              <input
                dir="ltr"
                value={materialPurchasePrice}
                onChange={(e) => setMaterialPurchasePrice(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">بيع</label>
              <input
                dir="ltr"
                value={materialSellingPrice}
                onChange={(e) => setMaterialSellingPrice(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">الكمية</label>
              <input
                dir="ltr"
                value={materialQty}
                onChange={(e) => setMaterialQty(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
              />
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            إلغاء
          </button>
          <button onClick={onSubmit} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-black">
            حفظ
          </button>
        </div>
      </div>
    </div>
  );
}
