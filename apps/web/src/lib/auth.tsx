'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api } from './api';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  loginTelegram: (initData: string) => Promise<User>;
  linkTelegram: (initData: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function persistSession(token: string, user: User) {
  localStorage.setItem('klinikpi_token', token);
  localStorage.setItem('klinikpi_role', user.role);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = localStorage.getItem('klinikpi_token');
    if (!t) {
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<User>('/auth/me');
      setUser(me);
      setToken(t);
      localStorage.setItem('klinikpi_role', me.role);
    } catch {
      localStorage.removeItem('klinikpi_token');
      localStorage.removeItem('klinikpi_role');
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    persistSession(res.accessToken, res.user);
    setToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const loginTelegram = useCallback(async (initData: string) => {
    const res = await api<{ accessToken: string; user: User }>('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    });
    persistSession(res.accessToken, res.user);
    setToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const linkTelegram = useCallback(async (initData: string) => {
    const me = await api<User>('/auth/link-telegram', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    });
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('klinikpi_token');
    localStorage.removeItem('klinikpi_role');
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, loginTelegram, linkTelegram, logout, refresh }),
    [user, token, loading, login, loginTelegram, linkTelegram, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
