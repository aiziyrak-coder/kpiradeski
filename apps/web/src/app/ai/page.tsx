'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, SectionHeader } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { weekStartISO } from '@/types';

export default function AiPage() {
  const toast = useToast();
  const { user } = useAuth();
  const canGenerate = user && ['MANAGER', 'SUPER_ADMIN'].includes(user.role);
  const [reports, setReports] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [weekStart, setWeekStart] = useState(weekStartISO());
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const [r, s] = await Promise.all([
        api('/kpi/ai-reports'),
        api('/kpi/ai-status').catch(() => null),
      ]);
      setReports(r);
      setStatus(s);
    } catch (e: any) {
      toast.error('Yuklanmadi', e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generate(type: 'CALLS' | 'SERVICES') {
    if (!canGenerate) {
      toast.error('Faqat menejer / super-admin generatsiya qiladi');
      return;
    }
    setBusy(type);
    try {
      await api(`/kpi/ai-reports/${type}?weekStart=${weekStart}`, { method: 'POST' });
      toast.success('AI hisobot tayyor', status?.configured ? 'OpenAI' : 'Shablon');
      await load();
    } catch (e: any) {
      toast.error('Generatsiya xatosi', e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <RoleGate allow={['MANAGER', 'DIRECTOR', 'SUPER_ADMIN']}>
        <SectionHeader
          eyebrow="Sunʼiy intellekt"
          title="Haftalik AI tahlil"
          description="Haftani tanlang → hisobot yarating. Natija Telegramga ham ketadi."
          action={
            canGenerate ? (
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  className="h-11 px-3 rounded-xl border border-teal-200 bg-white text-sm"
                />
                <Button variant="secondary" disabled={!!busy} onClick={() => generate('CALLS')}>
                  {busy === 'CALLS' ? '...' : 'Qoʻngʻiroqlar'}
                </Button>
                <Button disabled={!!busy} onClick={() => generate('SERVICES')}>
                  {busy === 'SERVICES' ? '...' : 'Xizmatlar'}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Faqat koʻrish huquqi</p>
            )
          }
        />

        {status && (
          <div
            className={`mb-5 rounded-2xl border p-4 text-sm ${
              status.configured
                ? 'border-teal-200 bg-teal-50/70 text-teal-900'
                : 'border-amber-200 bg-amber-50/70 text-amber-950'
            }`}
          >
            <p className="font-semibold">{status.configured ? 'OpenAI ulangan' : 'Shablon rejim'}</p>
            <p className="mt-1 opacity-90">{status.hint}</p>
            {status.configured && <p className="text-xs mt-1 opacity-70">Model: {status.model}</p>}
          </div>
        )}

        <div className="space-y-4">
          {reports.length === 0 && (
            <div className="rounded-3xl border border-dashed border-teal-200 p-10 text-center text-ink-muted">
              Hali hisobot yoʻq. Yuqoridagi tugmalar bilan yarating.
            </div>
          )}
          {reports.map((r) => (
            <article
              key={r.id}
              className="rounded-3xl border border-teal-100 bg-white/80 p-5 sm:p-6 shadow-soft"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <p className="text-xs uppercase tracking-[0.16em] text-teal-700 font-semibold">
                  {r.type === 'CALLS' ? 'Qoʻngʻiroqlar tahlili' : 'Xizmatlar tahlili'}
                </p>
                <p className="text-sm text-ink-muted">Hafta: {String(r.weekStart).slice(0, 10)}</p>
              </div>
              <div className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">{r.content}</div>
            </article>
          ))}
        </div>
      </RoleGate>
    </AppShell>
  );
}
