const TOKEN_KEY = "token";
const USER_KEY = "currentUser";

export const authStorage = {
  getToken(): string | null {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  setToken(token: string) {
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch {}
  },
  getUser<T = any>(): T | null {
    try {
      const raw = sessionStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) as T : null;
    } catch {
      return null;
    }
  },
  setUser(user: any) {
    try { sessionStorage.setItem(USER_KEY, JSON.stringify(user)); } catch {}
  },
  setSession(token: string, user: any) {
    this.setToken(token);
    this.setUser(user);
  },
  clearUser() {
    try { sessionStorage.removeItem(USER_KEY); } catch {}
  },
  clear() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch {}
  }
};
