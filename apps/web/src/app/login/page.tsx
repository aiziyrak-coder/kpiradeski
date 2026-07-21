'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Button, Input } from '@/components/ui';
import { homeForRole } from '@/types';
import { useTelegram } from '@/components/TelegramProvider';
import { haptic } from '@/lib/telegram';

const DEMOS = [
  { email: 'manager@klinikpi.uz', role: 'Menejer' },
  { email: 'super@klinikpi.uz', role: 'Super Admin' },
];

export default function LoginPage() {
  const { login, loginTelegram, linkTelegram, user, loading } = useAuth();
  const { ready, isMiniApp, webApp, tgUser } = useTelegram();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgHint, setTgHint] = useState('');
  const showDemo = process.env.NEXT_PUBLIC_DEMO === 'true';

  useEffect(() => {
    if (!loading && user) router.replace(homeForRole(user.role));
  }, [loading, user, router]);

  // Mini App: avtomatik Telegram kirish (akkaunt bogʻlangan boʻlsa)
  useEffect(() => {
    if (!ready || loading || user || !isMiniApp || !webApp?.initData) return;
    let cancelled = false;
    (async () => {
      setTgBusy(true);
      setTgHint('Telegram orqali kirilmoqda...');
      try {
        const u = await loginTelegram(webApp.initData);
        if (cancelled) return;
        haptic('success');
        router.replace(homeForRole(u.role));
      } catch (err: any) {
        if (cancelled) return;
        const msg = String(err?.message || '');
        if (msg.includes('TELEGRAM_NOT_LINKED') || msg.includes('Unauthorized')) {
          setTgHint(
            tgUser?.first_name
              ? `Salom, ${tgUser.first_name}! Avval email/parol bilan kiring — keyin Telegram bogʻlanadi.`
              : 'Avval email/parol bilan kiring. Keyin Profil → Telegram bogʻlash.',
          );
        } else {
          setTgHint('');
          setError(msg || 'Telegram kirish amalga oshmadi');
        }
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
          // bogʻlash keyinroq Profil orqali
        }
      }
      haptic('success');
      router.push(homeForRole(u.role));
    } catch (err: any) {
      haptic('error');
      setError(err.message || 'Kirish amalga oshmadi');
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
          className="hidden lg:flex flex-col justify-between p-12 text-white"
        >
          <div>
            <p className="font-display text-5xl xl:text-6xl tracking-tight">KliniKPI</p>
            <p className="mt-3 text-teal-100/80 text-lg max-w-md leading-relaxed">
              Dermatologiya klinikasi maʼmuriyati va menejmenti uchun yagona KPI-monitoring platformasi
            </p>
          </div>
          <div className="space-y-6 max-w-md">
            <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-md p-6">
              <p className="text-sm uppercase tracking-[0.2em] text-teal-200/80 mb-2">Real vaqt</p>
              <p className="font-display text-3xl">Kunlik ball · Dashboard · AI tahlil</p>
              <p className="mt-2 text-teal-100/70 text-sm">
                Chek-listlar, qoʻngʻiroqlar voronkasi, SMM monitoring va rahbariyat hisobotlari.
              </p>
            </div>
            <p className="text-teal-200/60 text-sm">Radeski Dermatologiya · 2026</p>
          </div>
        </motion.div>

        <div className="flex items-center justify-center p-4 sm:p-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full max-w-md rounded-[24px] sm:rounded-[28px] bg-white/95 shadow-glow border border-white/40 p-5 sm:p-8"
          >
            <div className="mb-5 sm:mb-6">
              <p className="font-display text-3xl sm:text-4xl text-teal-800">KliniKPI</p>
              <p className="text-sm text-ink-muted mt-1">
                {isMiniApp ? 'Telegram Mini App' : 'KPI monitoring platformasi'}
              </p>
            </div>

            {isMiniApp && (tgBusy || tgHint) && (
              <div className="mb-4 rounded-xl border border-teal-100 bg-teal-50/80 px-3 py-2.5 text-sm text-teal-900">
                {tgBusy ? 'Telegram orqali kirilmoqda...' : tgHint}
              </div>
            )}

            <h1 className="font-display text-2xl sm:text-3xl text-ink">Tizimga kirish</h1>
            <p className="text-ink-muted text-sm mt-1 mb-5">
              {isMiniApp
                ? 'Birinchi marta — email/parol. Keyin Telegram avtomatik ochiladi.'
                : 'Rolingizga mos hisob bilan kiring'}
            </p>

            <form onSubmit={onSubmit} className="space-y-3.5">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                inputMode="email"
                className="h-12 text-base"
              />
              <Input
                label="Parol"
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
                {busy ? 'Tekshirilmoqda...' : 'Kirish'}
              </Button>
            </form>

            {showDemo && !isMiniApp && (
              <div className="mt-7 pt-5 border-t border-teal-50">
                <p className="text-xs uppercase tracking-wider text-ink-muted mb-3">
                  Demo hisoblar · parol: klinikpi123
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {DEMOS.map((d) => (
                    <button
                      key={d.email}
                      type="button"
                      onClick={() => {
                        setEmail(d.email);
                        setPassword('klinikpi123');
                      }}
                      className="text-left px-3 py-2.5 rounded-xl border border-teal-100 hover:border-teal-300 hover:bg-teal-50/50 transition"
                    >
                      <span className="block text-xs font-semibold text-teal-800">{d.role}</span>
                      <span className="block text-[11px] text-ink-muted truncate">{d.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
