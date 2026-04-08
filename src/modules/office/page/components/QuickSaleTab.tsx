import { Search, ShoppingCart, Trash2, CheckCircle2, Printer } from 'lucide-react';
import type { OfficeMaterial, CartCalc } from './types';

export interface QuickSaleTabProps {
  search: string;
  setSearch: (v: string) => void;
  officeMaterials: OfficeMaterial[];
  cartItems: Array<{ materialId: number; quantity: number }>;
  setCartItems: React.Dispatch<React.SetStateAction<Array<{ materialId: number; quantity: number }>>>;
  cartCalc: CartCalc;
  salePayment: 'cash' | 'debt' | 'installments';
  setSalePayment: (v: 'cash' | 'debt' | 'installments') => void;
  saleCustomerName: string;
  setSaleCustomerName: (v: string) => void;
  saleCustomerPhone: string;
  setSaleCustomerPhone: (v: string) => void;
  salePurchaseDate: string;
  setSalePurchaseDate: (v: string) => void;
  saleCommissionPercent: string;
  setSaleCommissionPercent: (v: string) => void;
  saleMonths: number;
  setSaleMonths: (v: number) => void;
  materialsThreshold: number;
  canOffice: (action: string) => boolean;
  onOpenInvoice: () => void;
  onConfirmSale: () => void;
}

export function QuickSaleTab(props: QuickSaleTabProps): React.ReactElement {
  const {
    search,
    setSearch,
    officeMaterials,
    cartItems,
    setCartItems,
    cartCalc,
    salePayment,
    setSalePayment,
    saleCustomerName,
    setSaleCustomerName,
    saleCustomerPhone,
    setSaleCustomerPhone,
    salePurchaseDate,
    setSalePurchaseDate,
    saleCommissionPercent,
    setSaleCommissionPercent,
    saleMonths,
    setSaleMonths,
    materialsThreshold,
    canOffice,
    onOpenInvoice,
    onConfirmSale,
  } = props;

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <ShoppingCart size={18} />
        <h2 className="font-semibold text-slate-900 dark:text-white">البيع السريع</h2>
        <div className="flex-1" />
        {canOffice('createInvoice') && (
          <button onClick={onOpenInvoice} className="px-4 py-2 rounded-xl bg-slate-900 text-white flex items-center gap-2 text-sm">
            <Printer size={16} />
            إنشاء فاتورة
          </button>
        )}
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="relative w-full">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث عن مادة للبيع..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 pl-10 pr-4 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                />
              </div>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {officeMaterials.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
                  {search.trim()
                    ? 'لا توجد مواد مطابقة للبحث'
                    : 'لا توجد مواد في المخزون. أضف مواد من تبويب «المخزون» أو تحقق من تحميل البيانات.'}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {officeMaterials.map((m: OfficeMaterial) => {
                    const selling = Number(m?.sellingPrice ?? m?.selling_price ?? 0);
                    const available = Number(m?.quantity ?? 0);
                    const isOutOfStock = available <= 0;
                    const isAtThreshold = !isOutOfStock && available <= materialsThreshold;
                    const inCart = cartItems.find((x) => Number(x.materialId) === Number(m.id));
                    const boxClass = isOutOfStock
                      ? 'bg-slate-100 dark:bg-slate-800/50 border-2 border-dashed border-slate-300 dark:border-slate-600 opacity-75 cursor-not-allowed'
                      : isAtThreshold
                        ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/30'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700';
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (available <= 0) return;
                          setCartItems((prev) => {
                            const next = [...prev];
                            const idx = next.findIndex((x) => Number(x.materialId) === Number(m.id));
                            if (idx >= 0) next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
                            else next.push({ materialId: Number(m.id), quantity: 1 });
                            return next;
                          });
                        }}
                        className={`text-right rounded-2xl p-3 transition-colors ${boxClass}`}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className={`font-bold line-clamp-2 ${isOutOfStock ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                            {m?.name ?? '-'}
                          </div>
                          {inCart ? (
                            <div className="shrink-0 text-xs font-black bg-indigo-600 text-white rounded-full px-2 py-1" dir="ltr">
                              {inCart.quantity}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">سعر البيع</div>
                        <div className={`text-lg font-black tabular-nums ${isOutOfStock ? 'text-slate-400' : 'text-slate-900 dark:text-slate-100'}`} dir="ltr">
                          {selling.toLocaleString()} د.ع
                        </div>
                        <div className={`mt-2 text-xs font-medium ${isOutOfStock ? 'text-rose-600 dark:text-rose-400' : isAtThreshold ? 'text-red-600' : 'text-slate-500'}`}>
                          {isOutOfStock ? (
                            'نافذ'
                          ) : (
                            <>
                              المتوفر: <span className="font-bold tabular-nums" dir="ltr">{available.toLocaleString()}</span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden bg-white dark:bg-slate-800 flex flex-col max-h-[72vh]">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <ShoppingCart size={16} />
              سلة المبيعات
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              {cartCalc.rows.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">السلة فارغة</div>
              ) : (
                <div className="space-y-2">
                  {cartCalc.rows.map((r) => (
                    <div key={r.materialId} className="rounded-xl border border-slate-200 dark:border-slate-600 p-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-bold text-slate-900 dark:text-white">{r.name}</div>
                        <button
                          onClick={() => setCartItems((prev) => prev.filter((x) => x.materialId !== r.materialId))}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                          title="حذف"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          سعر: <span className="font-bold tabular-nums" dir="ltr">{Number(r.selling).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2" dir="ltr">
                          <button
                            type="button"
                            onClick={() =>
                              setCartItems((prev) =>
                                prev.map((x) => (x.materialId === r.materialId ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))
                              )
                            }
                            className="h-9 w-9 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                          >
                            -
                          </button>
                          <div
                            className={`h-9 min-w-[48px] px-3 rounded-xl border text-center flex items-center justify-center font-black tabular-nums ${
                              r.qty > r.available
                                ? 'border-rose-300 dark:border-rose-600 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {r.qty}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setCartItems((prev) => prev.map((x) => (x.materialId === r.materialId ? { ...x, quantity: x.quantity + 1 } : x)))
                            }
                            className="h-9 w-9 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className={Number(r.available) <= materialsThreshold ? 'text-red-600 dark:text-red-400' : ''}>
                          المتوفر: <span className="font-bold tabular-nums" dir="ltr">{Number(r.available).toLocaleString()}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">الإجمالي</span>
                  <span className="font-black tabular-nums" dir="ltr">
                    {Number(salePayment === 'installments' ? cartCalc.totalWithCommission : cartCalc.baseTotal).toLocaleString()} د.ع
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-600 dark:text-slate-300">الربح</span>
                  <span className="font-black text-emerald-700 tabular-nums" dir="ltr">{Number(cartCalc.profit || 0).toLocaleString()} د.ع</span>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-600 mb-1">طريقة الدفع</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSalePayment('cash')}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm border ${
                      salePayment === 'cash' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'
                    }`}
                    type="button"
                  >
                    نقدًا
                  </button>
                  <button
                    onClick={() => setSalePayment('debt')}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm border ${
                      salePayment === 'debt' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'
                    }`}
                    type="button"
                  >
                    آجل
                  </button>
                  <button
                    onClick={() => setSalePayment('installments')}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm border ${
                      salePayment === 'installments'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'
                    }`}
                    type="button"
                  >
                    أقساط
                  </button>
                </div>
              </div>

              {salePayment !== 'cash' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">اسم الزبون</label>
                      <input
                        value={saleCustomerName}
                        onChange={(e) => setSaleCustomerName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">رقم الهاتف</label>
                      <input
                        value={saleCustomerPhone}
                        onChange={(e) => setSaleCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">تاريخ الشراء</label>
                      <input
                        type="date"
                        value={salePurchaseDate}
                        onChange={(e) => setSalePurchaseDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>
              )}

              {salePayment === 'installments' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">عمولة %</label>
                      <input
                        type="number"
                        min={0}
                        value={saleCommissionPercent}
                        onChange={(e) => setSaleCommissionPercent(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">المدة (شهر)</label>
                      <input
                        type="number"
                        min={1}
                        value={saleMonths}
                        onChange={(e) => setSaleMonths(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">القسط الشهري</div>
                    <div className="text-lg font-black text-slate-800 dark:text-white tabular-nums" dir="ltr">
                      {Number(cartCalc.monthly || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} د.ع
                    </div>
                  </div>
                </div>
              )}
            </div>

            {canOffice('quickSale') && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
                <button
                  onClick={onConfirmSale}
                  disabled={cartItems.length === 0 || cartCalc.rows.some((r) => r.qty > r.available)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  type="button"
                >
                  <CheckCircle2 size={18} />
                  تأكيد البيع
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
