import { 
  Users, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  CreditCard, 
  TrendingUp, 
  ShieldCheck, 
  AlertCircle
} from 'lucide-react';

interface StatsProps {
  totalSubscribers: number;
  ftthSubscribers: number;
  walletBalance: number;
  wirelessWalletBalance: number;
  totalDebts: number;
  cashCollected: number;
  totalProfits: number;
  activeTab: string;
}

export function InternetDashboardStats({
  totalSubscribers,
  ftthSubscribers,
  walletBalance,
  wirelessWalletBalance,
  totalDebts,
  cashCollected,
  totalProfits,
  activeTab
}: StatsProps) {
  
  const stats = [
    {
      label: 'إجمالي المشتركين',
      value: totalSubscribers.toLocaleString(),
      subValue: `${ftthSubscribers} FTTH`,
      icon: Users,
      gradient: 'premium-gradient-indigo',
      trend: '+2% هذا الشهر',
      showOn: ['subscribers', 'reports']
    },
    {
      label: 'رصيد المحفظة (FTTH)',
      value: `${walletBalance.toLocaleString()} د.ع`,
      subValue: 'المبلغ المتوفر للتجديد',
      icon: Wallet,
      gradient: 'premium-gradient-amber',
      trend: 'رصيد آمن',
      showOn: ['subscribers', 'wallet']
    },
    {
      label: 'الديون المستحقة',
      value: `${totalDebts.toLocaleString()} د.ع`,
      subValue: 'بذمة المشتركين',
      icon: AlertCircle,
      gradient: 'premium-gradient-rose',
      trend: 'بحاجة للمتابعة',
      showOn: ['subscribers', 'debts', 'reports']
    },
    {
      label: 'إجمالي الأرباح',
      value: `${totalProfits.toLocaleString()} د.ع`,
      subValue: 'الفترة المحددة',
      icon: TrendingUp,
      gradient: 'premium-gradient-indigo',
      trend: '+15% زيادة',
      showOn: ['reports']
    }
  ];

  // تصفية البطاقات حسب التبويب النشط (أو إظهار الكل في المشتركين كلوحة تحكم)
  const displayStats = stats.filter(s => s.showOn.includes(activeTab) || activeTab === 'subscribers');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
      {displayStats.slice(0, 4).map((stat, i) => (
        <div 
          key={i} 
          className="glass-card p-6 rounded-[2rem] hover-scale relative overflow-hidden group"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          {/* Subtle Background Ornament */}
          <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-10 group-hover:scale-150 transition-transform duration-700 ${stat.gradient.split(' ')[0]}`} />
          
          <div className="relative z-10 space-y-4">
            <div className="flex justify-between items-start">
              <div className={`p-3 rounded-2xl ${stat.gradient} shadow-lg shadow-indigo-500/20`}>
                <stat.icon size={22} />
              </div>
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">
                <ArrowUpRight size={12} />
                {stat.trend}
              </div>
            </div>
            
            <div>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">{stat.label}</p>
              <h4 className="text-2xl font-black text-slate-800 dark:text-white tabular-nums tracking-tight">
                {stat.value}
              </h4>
            </div>
            
            <div className="pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-medium">{stat.subValue}</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
