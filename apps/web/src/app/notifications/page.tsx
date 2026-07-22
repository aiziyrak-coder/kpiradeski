'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, SectionHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { formatTashkent } from '@/types';
import { cn } from '@/lib/utils';

function linkForType(type?: string) {
  switch (type) {
    case 'AI_REPORT':
      return '/ai';
    case 'SCORE':
    case 'ALERT':
    case 'STOCK':
      return '/dashboard';
    case 'REMINDER':
    case 'MYSTERY':
      return '/today';
    default:
      return null;
  }
}

export default function NotificationsPage() {
  const toast = useToast();
  const { t } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const canTest = user && ['SUPER_ADMIN', 'MANAGER'].includes(user.role);
  const unread = items.filter((n) => !n.read).length;

  async function load() {
    try {
      setItems(await api('/notifications'));
    } catch (e: any) {
      toast.error(t('notifications.loadError'), e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markAll() {
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function markOne(id: string) {
    try {
      await api(`/notifications/${id}/read`, { method: 'PATCH' });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function testTelegram() {
    try {
      const res = await api('/notifications/telegram-test', { method: 'POST' });
      if (res.ok) toast.success(t('notifications.telegramSent'));
      else toast.error(t('notifications.telegramError'), res.error || t('common.error'));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <AppShell>
      <SectionHeader
        title={t('notifications.title')}
        action={
          <div className="flex flex-wrap gap-2">
            {canTest && (
              <Button variant="secondary" onClick={testTelegram}>
                {t('notifications.telegramTest')}
              </Button>
            )}
            <Button variant="secondary" onClick={markAll} disabled={unread === 0}>
              {t('notifications.markAll')}
            </Button>
          </div>
        }
      />

      <div className="mb-5 rounded-2xl border border-teal-100 bg-white/80 p-4 text-sm text-ink-soft">
        <p className="font-semibold text-teal-800 mb-2">{t('notifications.commands')}</p>
        <div className="flex flex-wrap gap-2">
          {['/bugun', '/holat', '/hafta', '/yordam'].map((c) => (
            <code key={c} className="text-xs bg-teal-50 px-2 py-1 rounded-lg">
              {c}
            </code>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-ink-muted text-sm p-6 rounded-3xl border border-dashed border-teal-200 text-center">
            {t('notifications.empty')}
          </p>
        )}
        {items.map((n) => {
          const href = linkForType(n.type);
          return (
            <div
              key={n.id}
              className={cn(
                'rounded-2xl border p-4 transition',
                n.read
                  ? 'bg-white/60 border-teal-50 opacity-70'
                  : 'bg-white border-teal-200 shadow-soft',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="text-left flex-1"
                  onClick={() => !n.read && markOne(n.id)}
                >
                  <p className="text-sm font-semibold text-ink">{n.title}</p>
                  <p className="text-sm text-ink-soft mt-0.5 whitespace-pre-wrap">{n.message}</p>
                  <p className="text-xs text-ink-muted mt-2">
                    {n.type} · {formatTashkent(n.createdAt)}
                  </p>
                </button>
                {!n.read && <span className="w-2.5 h-2.5 rounded-full bg-teal-600 mt-1.5 shrink-0" />}
              </div>
              {href && (
                <Link
                  href={href}
                  className="inline-block mt-2 text-xs font-semibold text-teal-700 underline"
                >
                  {t('notifications.open')}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
