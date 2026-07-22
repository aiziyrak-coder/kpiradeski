'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Button, Input } from '@/components/ui';
import { homeForRole } from '@/types';
import { useTelegram } from '@/components/TelegramProvider';
import { haptic } from '@/lib/telegram';
import { useI18n } from '@/lib/i18n';

export default function LoginPage() {
  const { login, loginTelegram, linkTelegram, user, loading } = useAuth();
  const { ready, isMiniApp, webApp, tgUser } = useTelegram();
  const { t, roleLabel } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);
  const showDemo = process.env.NEXT_PUBLIC_DEMO === 'true';

  const demos = [
    { email: 'manager@klinikpi.uz', role: 'MANAGER' as const },
    { email: 'super@klinikpi.uz', role: 'SUPER_ADMIN' as const },
  ];

  useEffect(() => {
    if (!loading && user) router.replace(homeForRole(user.role));
  }, [loading, user, router]);

  useEffect(() => {
    if (!ready || loading || user || !isMiniApp || !webApp?.initData) return;
    let cancelled = false;
    (async () => {
      setTgBusy(true);
      try {
        const u = await loginTelegram(webApp.initData);
        if (cancelled) return;
        haptic('success');
        router.replace(homeForRole(u.role));
      } catch {
        // email/parol kerak
      } finally {
        if (!cancelled) setTgBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, loading, user, isMiniApp, webApp, loginTelegram, router, tgUser]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(email, password);
      if (isMiniApp && webApp?.initData && !u.telegramId) {
        try {
          await linkTelegram(webApp.initData);
        } catch {
          /* ignore */
        }
      }
      haptic('success');
      router.push(homeForRole(u.role));
    } catch (err: any) {
      haptic('error');
      setError(err.message || t('login.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh] relative overflow-hidden safe-pad">
      <div className="absolute inset-0 bg-gradient-to-br from-teal-900 via-teal-800 to-teal-950" />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(167,213,204,0.35), transparent 40%), radial-gradient(circle at 80% 70%, rgba(61,150,136,0.4), transparent 45%)',
        }}
      />

      <div className="relative min-h-[100dvh] grid lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
          className="hidden lg:flex flex-col justify-center p-12 text-white"
        >
          <p className="font-display text-4xl xl:text-5xl tracking-tight leading-tight">
            {t('app.title')}
            <span className="block text-2xl xl:text-3xl text-teal-100/90 font-normal mt-1">
              {t('app.subtitle')}
            </span>
          </p>
        </motion.div>

        <div className="flex items-center justify-center p-4 sm:p-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full max-w-md rounded-[24px] sm:rounded-[28px] bg-white/95 shadow-glow border border-white/40 p-5 sm:p-8"
          >
            <div className="mb-6">
              <p className="font-display text-3xl sm:text-4xl text-teal-800 leading-tight">
                {t('app.title')}
              </p>
              <p className="text-sm text-ink-muted mt-1">{t('app.subtitle')}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3.5">
              <Input
                label={t('login.email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                inputMode="email"
                className="h-12 text-base"
              />
              <Input
                label={t('login.password')}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-12 text-base"
              />
              {error && (
                <p className="text-sm text-status-red bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full min-h-12" size="lg" disabled={busy || tgBusy}>
                {busy ? t('login.checking') : t('login.submit')}
              </Button>
            </form>

            {showDemo && !isMiniApp && (
              <div className="mt-7 pt-5 border-t border-teal-50 grid grid-cols-2 gap-2">
                {demos.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => {
                      setEmail(d.email);
                      setPassword('klinikpi123');
                    }}
                    className="text-left px-3 py-2.5 rounded-xl border border-teal-100 hover:border-teal-300 hover:bg-teal-50/50 transition"
                  >
                    <span className="block text-xs font-semibold text-teal-800">
                      {roleLabel(d.role)}
                    </span>
                    <span className="block text-[11px] text-ink-muted truncate">{d.email}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
