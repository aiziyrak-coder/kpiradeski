'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { uz } from '@/locales/uz';
import { ru } from '@/locales/ru';

export type Lang = 'uz' | 'ru';

const STORAGE_KEY = 'klinikpi_lang';

const dicts: Record<Lang, Record<string, unknown>> = { uz, ru };

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  roleLabel: (role: string) => string;
  positionName: (pos: { nameUz: string; nameRu: string } | null | undefined) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('uz');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved === 'uz' || saved === 'ru') setLangState(saved);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next === 'ru' ? 'ru' : 'uz';
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'ru' ? 'ru' : 'uz';
  }, [lang]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text = getNested(dicts[lang] as unknown as Record<string, unknown>, key) ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [lang],
  );

  const roleLabel = useCallback(
    (role: string) => {
      const label = (dicts[lang].roles as Record<string, string> | undefined)?.[role];
      return label ?? role;
    },
    [lang],
  );

  const positionName = useCallback(
    (pos: { nameUz: string; nameRu: string } | null | undefined) => {
      if (!pos) return '';
      return lang === 'ru' ? pos.nameRu : pos.nameUz;
    },
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, t, roleLabel, positionName }),
    [lang, setLang, t, roleLabel, positionName],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
