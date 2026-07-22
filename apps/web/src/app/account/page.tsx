'use client';

import { FormEvent, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, Input, SectionHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { useTelegram } from '@/components/TelegramProvider';
import { haptic } from '@/lib/telegram';
import { useI18n } from '@/lib/i18n';

export default function AccountPage() {
  const toast = useToast();
  const { t, roleLabel } = useI18n();
  const { user, linkTelegram, refresh } = useAuth();
  const { isMiniApp, webApp, tgUser } = useTelegram();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirm) {
      toast.error(t('account.passwordMismatch'));
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
      toast.success(t('account.passwordUpdated'));
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err: any) {
      toast.error(t('common.error'), err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onLinkTelegram() {
    if (!webApp?.initData) {
      toast.error(t('account.openInTelegram'));
      return;
    }
    setTgBusy(true);
    try {
      await linkTelegram(webApp.initData);
      await refresh();
      haptic('success');
      toast.success(t('account.linkedOk'));
    } catch (err: any) {
      haptic('error');
      toast.error(t('account.linkFail'), err.message);
    } finally {
      setTgBusy(false);
    }
  }

  return (
    <AppShell>
      <SectionHeader title={t('account.title')} />

      <div className="space-y-4 max-w-md">
        <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft">
          <p className="font-display text-2xl text-teal-900">{user?.name}</p>
          <p className="text-sm text-ink-muted mt-1">{user?.email}</p>
          <p className="text-sm text-teal-800 mt-2 font-medium">
            {user?.role ? roleLabel(user.role) : t('common.none')}
          </p>
          {user?.telegramId && (
            <p className="text-xs text-ink-muted mt-2">Telegram ID: {user.telegramId}</p>
          )}
        </div>

        {(isMiniApp || user?.telegramId) && (
          <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft space-y-3">
            <p className="text-sm font-semibold text-ink">{t('account.telegramMini')}</p>
            {user?.telegramId ? (
              <p className="text-sm text-teal-800">
                {t('account.linked')}
                {tgUser?.username ? ` · @${tgUser.username}` : ''}
              </p>
            ) : (
              <Button
                type="button"
                onClick={onLinkTelegram}
                disabled={tgBusy || !isMiniApp}
                className="w-full min-h-12"
              >
                {tgBusy ? '...' : t('account.telegram')}
              </Button>
            )}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-teal-100 bg-white/90 p-4 sm:p-6 shadow-soft space-y-3"
        >
          <p className="text-sm font-semibold text-ink mb-1">{t('account.changePassword')}</p>
          <Input
            label={t('account.currentPassword')}
            type="password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            required
            className="h-12"
          />
          <Input
            label={t('account.newPassword')}
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            required
            minLength={8}
            className="h-12"
          />
          <Input
            label={t('account.confirmPassword')}
            type="password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            required
            minLength={8}
            className="h-12"
          />
          <Button type="submit" disabled={busy} className="w-full min-h-12">
            {busy ? t('account.saving') : t('account.update')}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
