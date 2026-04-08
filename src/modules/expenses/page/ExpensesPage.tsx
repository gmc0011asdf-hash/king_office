import { useState, useMemo } from 'react';
import { Receipt, Plus, Filter, Download, Calendar, ArrowUpRight, X, Printer } from 'lucide-react';
import { useAppContext, type Expense } from '@/context/AppContext';
import { canAction } from '@/utils/permissions';
import { expensesApi } from '@/api/expenses';
import { notifyPersistence } from '@/utils/persistence';

const EXPENSE_TYPES = [
  'إيجار', 
  'سحب نقدي', 
  'كهرباء', 
  'رواتب', 
  'شراء مواد مكتب', 
  'شراء مواد إنترنت', 
  'تعبئة محفظة إنترنت', 
  'تعبئة محفظة Switch', 
  'تعبئة محفظة Qi', 
  'شراء بطاقات'
];

export default function Expenses() {
  const { expenses = [], setExpenses, addNotification, logActivity, currentUser } = useAppContext();
  const expenseList: Expense[] = Array.isArray(expenses) ? expenses : [];
  const canAddExpense = canAction(currentUser, 'expenses', 'addExpense');

  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newExpense, setNewExpense] = useState<any>({
    date: new Date().toISOString().split('T')[0],
    type: EXPENSE_TYPES[0],
    amount: '',
    payee: '',
    notes: '',
    user: 'المدير'
  });

  const filteredExpenses = useMemo(() => {
    return expenseList.filter((expense: Expense) => {
      const matchType = filterType ? expense.category === filterType : true;
      const matchStartDate = filterStartDate ? expense.date >= filterStartDate : true;
      const matchEndDate = filterEndDate ? expense.date <= filterEndDate : true;
      return matchType && matchStartDate && matchEndDate;
    }).sort((a: Expense, b: Expense) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenseList, filterType, filterStartDate, filterEndDate]);

  const totalAmount = useMemo(() => {
    return filteredExpenses.reduce((sum: number, exp: Expense) => sum + exp.amount, 0);
  }, [filteredExpenses]);

  const topCategory = useMemo(() => {
    if (filteredExpenses.length === 0) return { type: 'لا يوجد', amount: 0 };
    
    const categoryTotals = filteredExpenses.reduce((acc: Record<string, number>, exp: Expense) => {
      acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
      return acc;
    }, {} as Record<string, number>);

    let maxType = '';
    let maxAmount = 0;
    
    for (const [type, amount] of Object.entries(categoryTotals)) {
      if ((amount as number) > maxAmount) {
        maxAmount = amount as number;
        maxType = type;
      }
    }

    return { type: maxType, amount: maxAmount };
  }, [filteredExpenses]);

  const handleAddExpense = async () => {
    if (!newExpense.amount || !newExpense.type || !newExpense.date) {
      alert('يرجى تعبئة الحقول المطلوبة (المبلغ، التصنيف، التاريخ)');
      return;
    }

    try {
      const result = await expensesApi.createExpenseTracked({
        date: newExpense.date,
        category: newExpense.type,
        amount: Number(newExpense.amount),
        description: [
          newExpense.payee ? `الجهة: ${newExpense.payee}` : '',
          newExpense.notes || ''
        ].filter(Boolean).join(' - ')
      });

      if (!result.ok || !result.data) {
        notifyPersistence(result);
        return;
      }
      const row = result.data as { id: number; date?: string; amount?: number };
      const expense: Expense = {
        id: row.id,
        date: (row.date || newExpense.date).split('T')[0],
        category: newExpense.type,
        amount: Number(row.amount),
        description: newExpense.notes || '',
        payee: newExpense.payee,
        user: newExpense.user,
      };
      setExpenses([expense, ...(Array.isArray(expenses) ? expenses : [])]);
      addNotification?.('إضافة مصروف', `تم إضافة مصروف ${newExpense.type} بمبلغ ${Number(newExpense.amount).toLocaleString()} د.ع`, 'info');
      logActivity?.('expenses', 'add_expense', `إضافة مصروف ${newExpense.type} بمبلغ ${Number(newExpense.amount).toLocaleString()} د.ع`);
      notifyPersistence(result);
      setIsModalOpen(false);
      setNewExpense({
        date: new Date().toISOString().split('T')[0],
        type: EXPENSE_TYPES[0],
        amount: '',
        payee: '',
        notes: '',
        user: 'المدير'
      });
    } catch (error) {
      console.error("Failed to add expense", error);
      alert("حدث خطأ أثناء إضافة المصروف");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">قسم المصروفات</h1>
            <p className="text-slate-500 dark:text-slate-300 text-sm mt-1">إدارة وتسجيل النفقات التشغيلية للمكتب</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2">
              <Printer size={16} />
              <span>طباعة التقرير</span>
            </button>
            {canAddExpense && (
            <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
              <Plus size={16} />
              <span>إضافة مصروف</span>
            </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3 shrink-0">
        <div className="bg-white dark:bg-slate-800 print:bg-white p-5 rounded-xl border border-slate-200 dark:border-slate-700 print:border-slate-300 shadow-sm print:shadow-none">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg print:bg-transparent print:p-0">
              <ArrowUpRight size={20} />
            </div>
            <h3 className="text-slate-600 dark:text-slate-300 font-medium">إجمالي المصروفات</h3>
          </div>
          <p className="text-3xl font-bold text-slate-800 dark:text-white mt-2" dir="ltr">{totalAmount.toLocaleString()} <span className="text-sm text-slate-500 dark:text-slate-400 font-normal">د.ع</span></p>
        </div>
        <div className="bg-white dark:bg-slate-800 print:bg-white p-5 rounded-xl border border-slate-200 dark:border-slate-700 print:border-slate-300 shadow-sm print:shadow-none">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg print:bg-transparent print:p-0">
              <Receipt size={20} />
            </div>
            <h3 className="text-slate-600 dark:text-slate-300 font-medium">عدد العمليات</h3>
          </div>
          <p className="text-3xl font-bold text-slate-800 dark:text-white mt-2" dir="ltr">{filteredExpenses.length} <span className="text-sm text-slate-500 dark:text-slate-400 font-normal">عملية</span></p>
        </div>
        <div className="bg-white dark:bg-slate-800 print:bg-white p-5 rounded-xl border border-slate-200 dark:border-slate-700 print:border-slate-300 shadow-sm print:shadow-none">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg print:bg-transparent print:p-0">
              <Calendar size={20} />
            </div>
            <h3 className="text-slate-600 dark:text-slate-300 font-medium">أعلى تصنيف</h3>
          </div>
          <p className="text-xl font-bold text-slate-800 dark:text-white mt-2">{topCategory.type}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1" dir="ltr">{topCategory.amount.toLocaleString()} د.ع</p>
        </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col mt-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden print:shadow-none print:border-slate-300 print:bg-white">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-700/50 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-400 dark:text-slate-300" />
            <span className="font-medium text-slate-700 dark:text-slate-200">تصفية المصروفات</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <select 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none min-w-[150px]"
            >
              <option value="">جميع التصنيفات</option>
              {EXPENSE_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">من</span>
              <input 
                type="date" 
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">إلى</span>
              <input 
                type="date" 
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            {(filterType || filterStartDate || filterEndDate) && (
              <button 
                onClick={() => {
                  setFilterType('');
                  setFilterStartDate('');
                  setFilterEndDate('');
                }}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                مسح الفلاتر
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 dark:bg-slate-700 print:bg-slate-100 border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
              <tr>
                <th className="px-4 py-3 font-medium">التاريخ</th>
                <th className="px-4 py-3 font-medium">التصنيف</th>
                <th className="px-4 py-3 font-medium">المبلغ</th>
                <th className="px-4 py-3 font-medium">المستفيد / الجهة</th>
                <th className="px-4 py-3 font-medium">ملاحظات</th>
                <th className="px-4 py-3 font-medium">بواسطة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredExpenses.length > 0 ? (
                filteredExpenses.map((item: Expense) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{item.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-200 print:border print:border-slate-300">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-rose-600 dark:text-rose-400" dir="ltr">{item.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{item.payee || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[200px] truncate print:whitespace-normal print:break-words" title={item.description}>{item.description || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{item.user}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    لا توجد مصروفات مطابقة للفلاتر المحددة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Add Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">إضافة مصروف جديد</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleAddExpense(); }}>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">التصنيف *</label>
                <select 
                  value={newExpense.type}
                  onChange={(e) => setNewExpense({...newExpense, type: e.target.value})}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {EXPENSE_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">المبلغ (د.ع) *</label>
                <input 
                  type="number" 
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  dir="ltr" 
                  placeholder="0" 
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">التاريخ *</label>
                <input 
                  type="date" 
                  value={newExpense.date}
                  onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">المستفيد / الجهة</label>
                <input 
                  type="text" 
                  value={newExpense.payee}
                  onChange={(e) => setNewExpense({...newExpense, payee: e.target.value})}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="اسم الشخص أو الشركة..." 
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">ملاحظات والتفاصيل</label>
                <textarea 
                  value={newExpense.notes}
                  onChange={(e) => setNewExpense({...newExpense, notes: e.target.value})}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px] resize-none" 
                  placeholder="أي تفاصيل إضافية عن المصروف..." 
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">حفظ المصروف</button>
            </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

