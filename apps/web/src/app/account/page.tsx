'use client';

import { FormEvent, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, Input, SectionHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { useTelegram } from '@/components/TelegramProvider';
import { haptic } from '@/lib/telegram';
import { ROLE_LABELS } from '@/types';

export default function AccountPage() {
  const toast = useToast();
  const { user, linkTelegram, refresh } = useAuth();
  const { isMiniApp, webApp, tgUser } = useTelegram();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirm) {
      toast.error('Parollar mos emas');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      toast.success('Parol yangilandi');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err: any) {
      toast.error('Xatolik', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onLinkTelegram() {
    if (!webApp?.initData) {
      toast.error('Telegram Mini App ichidan oching');
      return;
    }
    setTgBusy(true);
    try {
      await linkTelegram(webApp.initData);
      await refresh();
      haptic('success');
      toast.success('Telegram akkaunt bogʻlandi');
    } catch (err: any) {
      haptic('error');
      toast.error('Bogʻlanmadi', err.message);
    } finally {
      setTgBusy(false);
    }
  }

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Profil"
        title="Hisob sozlamalari"
        description="Shaxsiy maʼlumot, parol va Telegram"
      />

      <div className="space-y-4 max-w-md">
        <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft">
          <p className="font-display text-2xl text-teal-900">{user?.name}</p>
          <p className="text-sm text-ink-muted mt-1">{user?.email}</p>
          <p className="text-sm text-teal-800 mt-2 font-medium">
            {user?.role ? ROLE_LABELS[user.role] : '—'}
          </p>
          {user?.telegramId && (
            <p className="text-xs text-ink-muted mt-2">Telegram ID: {user.telegramId}</p>
          )}
        </div>

        {(isMiniApp || user?.telegramId) && (
          <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft space-y-3">
            <p className="text-sm font-semibold text-ink">Telegram Mini App</p>
            {user?.telegramId ? (
              <p className="text-sm text-teal-800">
                Bogʻlangan
                {tgUser?.username ? ` · @${tgUser.username}` : ''}
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-muted">
                  Bir marta bogʻlang — keyingi ochilishlarda email/parolsiz kirasiz.
                </p>
                <Button
                  type="button"
                  onClick={onLinkTelegram}
                  disabled={tgBusy || !isMiniApp}
                  className="w-full min-h-12"
                >
                  {tgBusy ? 'Bogʻlanmoqda...' : isMiniApp ? 'Telegramni bogʻlash' : 'Mini Appdan oching'}
                </Button>
              </>
            )}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-teal-100 bg-white/90 p-4 sm:p-6 shadow-soft space-y-3"
        >
          <p className="text-sm font-semibold text-ink mb-1">Parolni o‘zgartirish</p>
          <Input
            label="Joriy parol"
            type="password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            required
            className="h-12"
          />
          <Input
            label="Yangi parol"
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            required
            minLength={8}
            className="h-12"
          />
          <Input
            label="Yangi parol (takror)"
            type="password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            required
            minLength={8}
            className="h-12"
          />
          <Button type="submit" disabled={busy} className="w-full min-h-12">
            {busy ? 'Saqlanmoqda...' : 'Yangilash'}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
