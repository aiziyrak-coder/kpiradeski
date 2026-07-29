'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastApi {
  push: (kind: ToastKind, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const MAX_TOASTS = 3;
const DEDUPE_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const lastErrorRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  const push = useCallback((kind: ToastKind, title: string, message?: string) => {
    if (kind === 'error') {
      const key = `${title}|${message || ''}`;
      const now = Date.now();
      if (key === lastErrorRef.current.key && now - lastErrorRef.current.at < DEDUPE_MS) {
        return;
      }
      lastErrorRef.current = { key, at: now };
    }

    const id = `${Date.now()}-${Math.random()}`;
    setItems((prev) => {
      const next = [...prev, { id, kind, title, message }];
      return next.slice(-MAX_TOASTS);
    });
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (t, m) => push('success', t, m),
      error: (t, m) => push('error', t, m),
      info: (t, m) => push('info', t, m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-20 sm:bottom-4 inset-x-3 sm:inset-x-auto sm:right-4 z-[100] flex flex-col gap-2 w-auto sm:w-[min(100%-2rem,360px)] pointer-events-none">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              className={cn(
                'pointer-events-auto rounded-2xl border px-4 py-3 shadow-glow bg-white/95 backdrop-blur',
                t.kind === 'success' && 'border-emerald-200',
                t.kind === 'error' && 'border-rose-200',
                t.kind === 'info' && 'border-teal-200',
              )}
            >
              <p
                className={cn(
                  'text-sm font-semibold',
                  t.kind === 'success' && 'text-status-green',
                  t.kind === 'error' && 'text-status-red',
                  t.kind === 'info' && 'text-teal-800',
                )}
              >
                {t.title}
              </p>
              {t.message && <p className="text-xs text-ink-muted mt-0.5">{t.message}</p>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast within ToastProvider');
  return ctx;
}
