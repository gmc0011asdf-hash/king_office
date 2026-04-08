import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  Globe,
  Briefcase,
  Users,
  BarChart3,
  Settings,
  Bell,
  Menu,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Shield,
  Moon,
  Sun,
  Loader2,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { useAppContext } from '@/context/AppContext';
import { canAccessSection } from '@/utils/permissions';
import { authStorage } from '@/utils/authStorage';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';

export default function Layout() {
  const { currentUser, setCurrentUser, notifications, markNotificationAsRead, markAllNotificationsAsRead, darkMode, setDarkMode, isInitialLoading, suspendIdleLogout } = useAppContext();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;

  const handleLogout = useCallback((reason?: 'idle') => {
    authStorage.clear();
    setCurrentUser(null);
    navigate('/login', { replace: true, state: reason === 'idle' ? { message: 'تم تسجيل الخروج بسبب عدم النشاط لمدة 30 دقيقة' } : undefined });
  }, [navigate, setCurrentUser]);

  useIdleTimeout(30 * 60 * 1000, () => handleLogout('idle'), !!currentUser && !suspendIdleLogout);

  const navItems = [
    { path: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, key: 'dashboard' },
    { path: '/internet', label: 'قسم الإنترنت', icon: Globe, key: 'internet' },
    { path: '/office', label: 'قسم المكتب', icon: Briefcase, key: 'office' },
    { path: '/cards', label: 'قسم البطاقات', icon: CreditCard, key: 'cards' },
    { path: '/expenses', label: 'قسم المصروفات', icon: Receipt, key: 'expenses' },
    { path: '/partners', label: 'قسم الشركاء', icon: Users, key: 'partners' },
    { path: '/reports', label: 'قسم التقارير', icon: BarChart3, key: 'reports' },
    { path: '/settings', label: 'الإعدادات', icon: Settings, key: 'settings' },
  ].filter(item => canAccessSection(currentUser, item.key));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_collapsed', String(isSidebarCollapsed));
    } catch {}
  }, [isSidebarCollapsed]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex" dir="rtl">
      <aside
        className={clsx(
          'bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 transition-all duration-300 flex flex-col fixed inset-y-0 right-0 z-50 print:hidden',
          isSidebarCollapsed ? 'w-20' : 'w-64',
          isSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        )}
      >
        <div className={clsx('h-16 flex items-center justify-between border-b border-slate-200 dark:border-slate-700', isSidebarCollapsed ? 'px-3' : 'px-4')}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <Shield className="text-white w-6 h-6" />
            </div>
            <div className={clsx(isSidebarCollapsed && 'hidden')}>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">مكتب الملك</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">نظام الإدارة</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(v => !v)}
              className="hidden lg:inline-flex p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300"
              title={isSidebarCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
            >
              {isSidebarCollapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300">
              <Menu size={20} />
            </button>
          </div>
        </div>

        <nav className={clsx('flex-1 space-y-2 overflow-y-auto', isSidebarCollapsed ? 'p-2' : 'p-4')}>
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={({ isActive }) => clsx(
                  'flex items-center rounded-xl text-sm font-medium transition-all',
                  isSidebarCollapsed ? 'justify-center px-3 py-3' : 'gap-3 px-4 py-3',
                  isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
                )}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <Icon size={18} />
                <span className={clsx(isSidebarCollapsed && 'hidden')}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <main className={clsx('flex-1 min-w-0', isSidebarCollapsed ? 'lg:pr-20' : 'lg:pr-64')}>
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-40 print:hidden">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 lg:hidden">
              <Menu size={20} />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setDarkMode(v => !v)}
              className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              title={darkMode ? 'الوضع الفاتح' : 'الوضع الليلي'}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="relative" ref={notificationsRef}>
              <button onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} className="relative p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                <Bell size={20} />
                {unreadNotificationsCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>}
              </button>
              {isNotificationsOpen && (
                <div className="absolute left-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100">الإشعارات</h3>
                    {unreadNotificationsCount > 0 && (
                      <button onClick={markAllNotificationsAsRead} className="text-xs text-indigo-600 hover:text-indigo-700">تحديد الكل كمقروء</button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length > 0 ? notifications.map(notification => (
                      <div
                        key={notification.id}
                        className={clsx('px-4 py-3 border-b border-slate-50 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer', !notification.read && 'bg-indigo-50/30 dark:bg-indigo-900/20')}
                        onClick={() => markNotificationAsRead(notification.id)}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className={clsx('text-sm font-medium', !notification.read ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300')}>
                            {notification.title}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{new Date(notification.date).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{notification.message}</p>
                      </div>
                    )) : (
                      <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">لا توجد إشعارات</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={userMenuRef}>
              <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 p-1.5 rounded-lg transition-colors">
                <div className="h-8 w-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold">
                  {currentUser?.name?.charAt(0) || 'م'}
                </div>
                <div className="hidden md:block text-right">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{currentUser?.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{currentUser?.role === 'admin' ? 'مدير النظام' : 'موظف'}</p>
                </div>
                <ChevronDown size={16} className="text-slate-400 dark:text-slate-300" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
                  <button
                    onClick={() => handleLogout()}
                    className="w-full text-right px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                  >
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-4 lg:p-8 print:p-0 print:overflow-visible bg-slate-50 dark:bg-slate-900 relative">
          {isInitialLoading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">جاري تحميل البيانات...</p>
              </div>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-auto">
            <Outlet />
          </div>
        </div>
      </main>

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-40 lg:hidden print:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}
    </div>
  );
}
