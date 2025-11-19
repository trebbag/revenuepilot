import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { login as apiLogin, register as apiRegister, AuthResponse } from '../api/auth';
import { putUserSession } from '../api.js';
import { parseJwt } from '../utils/jwt.js';

interface AuthContextValue {
  token: string | null;
  refreshToken: string | null;
  settings: any | null;
  session: any | null;
  login: (u: string, p: string, lang?: string) => Promise<void>;
  register: (u: string, p: string, lang?: string) => Promise<void>;
  logout: () => void;
  updateSession: (s: any) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => (typeof window !== 'undefined' ? localStorage.getItem('token') : null));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => (typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null));
  const [settings, setSettings] = useState<any | null>(null);
  const [session, setSession] = useState<any | null>(null);

  const persist = (data: AuthResponse) => {
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    setSettings(data.settings);
    setSession(data.session || null);
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', data.token);
      localStorage.setItem('refreshToken', data.refreshToken);
    }
  };

  const login = useCallback(async (u: string, p: string, lang: string = 'en') => {
    const resp = await apiLogin(u, p, lang);
    persist(resp);
  }, []);

  const register = useCallback(async (u: string, p: string, lang: string = 'en') => {
    const resp = await apiRegister(u, p, lang);
    persist(resp);
  }, []);

  const logout = useCallback(() => {
    if (session) {
      putUserSession(session).catch(() => {});
    }
    setToken(null);
    setRefreshToken(null);
    setSettings(null);
    setSession(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    }
  }, [session]);

  const updateSession = useCallback((s: any) => {
    setSession(s);
  }, []);

  // Simple token expiry watcher (decode exp from JWT)
  useEffect(() => {
    if (!token || !refreshToken) return;
    const payload = parseJwt(token);
    if (!payload?.exp) return;
    const timeout = payload.exp * 1000 - Date.now() - 60000; // refresh 1m early by relying on global fetch logic
    if (timeout <= 0) {
      // Let global refresh logic in api.js handle actual refresh on next request
      return;
    }
    const id = setTimeout(() => {
      // Trigger a no-op to allow consumer to re-render; actual refresh occurs transparently in fetch wrapper
      setToken((t) => (t ? t : null));
    }, timeout);
    return () => clearTimeout(id);
  }, [token, refreshToken]);

  useEffect(() => {
    if (!token || !session) return;
    const id = setInterval(() => {
      putUserSession(session).catch(() => {});
    }, 60000);
    return () => clearInterval(id);
  }, [token, session]);

  const value: AuthContextValue = {
    token,
    refreshToken,
    settings,
    session,
    login,
    register,
    logout,
    updateSession,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
