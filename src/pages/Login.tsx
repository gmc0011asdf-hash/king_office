import React, { useState } from 'react';
import { Shield, Lock, Mail, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { authApi } from '@/modules/auth/api/auth.api';
import { ApiRequestError, getApiBaseUrl, NETWORK_HTTP_STATUS } from '@/api/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { authStorage } from '@/utils/authStorage';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const { setCurrentUser, addNotification, logActivity } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response: any = await authApi.login(email, password);
      authStorage.setSession(response.accessToken || response.access_token, response.user);
      setCurrentUser(response.user);
      const needsPasswordChange = response.user?.requires_password_change ?? response.user?.requiresPasswordChange;
      if (needsPasswordChange) {
        addNotification?.('تغيير كلمة المرور مطلوب', 'يجب تغيير كلمة المرور عند أول تسجيل دخول', 'info');
        navigate('/force-change-password', { replace: true });
      } else {
        addNotification?.('تسجيل الدخول', `تم تسجيل الدخول بنجاح باسم ${response.user?.name || response.user?.email || 'المستخدم'}`, 'info');
        logActivity?.('auth', 'login', `تسجيل دخول ${response.user?.name || response.user?.email || 'المستخدم'}`);
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === NETWORK_HTTP_STATUS) {
          setError(err.message);
        } else if (err.status === 401) {
          setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        } else if (err.status === 403) {
          setError(`${err.message || 'الوصول مرفوض (403).'}`);
        } else if (err.status === 404) {
          setError(
            `مسار تسجيل الدخول غير موجود (404). تحقق من أن VITE_API_URL يشير إلى خادم Maktab Al-Malik API (${getApiBaseUrl()}) وليس إلى واجهة ثابتة فقط.`,
          );
        } else if (err.status >= 500) {
          setError(`${err.message || 'خطأ في الخادم'}. تأكد من تشغيل PostgreSQL وقاعدة البيانات.`);
        } else {
          setError(err.message || 'حدث خطأ أثناء تسجيل الدخول');
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        const isNetworkError = /fetch|network|connection|refused|timeout|load failed/i.test(msg);
        if (isNetworkError) {
          setError(
            `تعذر إتمام الطلب (شبكة أو CORS). عنوان الـ API الحالي: ${getApiBaseUrl()}. تحقق من الاتصال وإعدادات النشر والـ CORS.`,
          );
        } else {
          setError(msg || 'حدث خطأ أثناء تسجيل الدخول');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage('');
    try {
      const result: any = await authApi.forgotPassword(forgotEmail);
      setForgotMessage(result?.message || 'تم إرسال رابط إعادة التعيين إلى بريدكم الإلكتروني');
      setForgotSuccess(true);
    } catch (err: any) {
      setForgotMessage(err?.message || 'تعذر إرسال الطلب، تأكد من صحة البريد');
    } finally {
      setForgotLoading(false);
    }
  };

  const openForgotModal = () => {
    setForgotOpen(true);
    setForgotEmail(email);
    setForgotMessage('');
    setForgotSuccess(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8" dir="rtl">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3">
            <Shield className="text-white w-10 h-10 transform -rotate-3" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">تسجيل الدخول</h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-slate-300">نظام مكتب الملك لإدارة الاشتراكات</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200 dark:border-slate-700">
          <form className="space-y-6" onSubmit={handleLogin}>
            {(location.state as { message?: string })?.message && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border-r-4 border-amber-400 p-4 rounded-md">
                <p className="text-sm text-amber-800 dark:text-amber-200">{(location.state as { message: string }).message}</p>
              </div>
            )}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border-r-4 border-red-400 p-4 rounded-md">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">البريد الإلكتروني</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400 dark:text-slate-500" />
                </div>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pr-10 sm:text-sm border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-md py-2 px-3 border" placeholder="admin@maktabalmalik.com" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">كلمة المرور</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 right-0 pr-10 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400 dark:text-slate-500" />
                </div>
                <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pr-10 pl-12 sm:text-sm border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-md py-2 px-3 border" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300" title={showPassword ? "إخفاء" : "إظهار"}>
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={openForgotModal} className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 whitespace-nowrap">نسيت كلمة المرور؟</button>
              <button type="submit" disabled={loading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50">
                {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {forgotOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-white">استعادة كلمة المرور</h3>
              <button onClick={() => setForgotOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">✕</button>
            </div>

            <form onSubmit={handleForgotPassword} className="p-4 space-y-4">
              {!forgotSuccess ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">البريد الإلكتروني المسجل في النظام</label>
                    <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" dir="ltr" />
                  </div>
                  {forgotMessage && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg p-3">{forgotMessage}</div>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setForgotOpen(false)} className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200">إلغاء</button>
                    <button type="submit" disabled={forgotLoading} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">{forgotLoading ? 'جاري الإرسال...' : 'إرسال رابط الاستعادة'}</button>
                  </div>
                </>
              ) : (
                <div className="py-6 text-center space-y-4">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-800 dark:text-white">تحقق من بريدك الإلكتروني</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{forgotMessage}</p>
                  <button type="button" onClick={() => setForgotOpen(false)} className="mt-4 px-6 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">حسناً</button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
