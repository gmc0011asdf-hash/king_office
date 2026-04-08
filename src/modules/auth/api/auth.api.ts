import { fetchApi } from '@/api/client';

export const authApi = {
  login: (email: string, password: string) => {
    const data = new URLSearchParams();
    data.append('username', email);
    data.append('password', password);
    return fetchApi('/api/auth/login', {
      method: 'POST',
      body: data,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      skipAuth: true,
    });
  },
  getCurrentUser: () => fetchApi('/api/auth/me'),
  forgotPassword: (email: string) =>
    fetchApi('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    fetchApi('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
      skipAuth: true,
    }),
  forceChangePassword: (newPassword: string) =>
    fetchApi<{ ok: boolean; message: string; user?: { requires_password_change?: boolean } }>('/api/auth/force-change-password', {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    }),
};
