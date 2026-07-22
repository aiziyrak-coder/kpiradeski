'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, SectionHeader } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { todayISO, weekStartISO } from '@/types';
import { cn } from '@/lib/utils';

type Period = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM';
type ReportType = 'KPI' | 'CALLS' | 'SERVICES';

export default function AiPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [reports, setReports] = useState<any[]>([]);
  const [period, setPeriod] = useState<Period>('WEEK');
  const [type, setType] = useState<ReportType>('KPI');
  const [from, setFrom] = useState(weekStartISO());
  const [to, setTo] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState('');

  const PERIODS: { id: Period; label: string }[] = [
    { id: 'DAY', label: t('ai.day') },
    { id: 'WEEK', label: t('ai.week') },
    { id: 'MONTH', label: t('ai.month') },
    { id: 'YEAR', label: t('ai.year') },
    { id: 'CUSTOM', label: t('ai.custom') },
  ];
  const TYPES: { id: ReportType; label: string }[] = [
    { id: 'KPI', label: t('ai.kpi') },
    { id: 'CALLS', label: t('ai.calls') },
    { id: 'SERVICES', label: t('ai.services') },
  ];

  async function load() {
    try {
      const [r, b] = await Promise.all([
        api('/kpi/ai-reports'),
        api('/branches/mine').catch(() => api('/branches').catch(() => [])),
      ]);
      setReports(r);
      setBranches(b || []);
      if (!branchId && b?.[0]) setBranchId(b[0].id);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    setBusy(true);
    try {
      const q = new URLSearchParams({
        period,
        from,
        to: period === 'CUSTOM' ? to : from,
      });
      if (branchId) q.set('branchId', branchId);
      await api(`/kpi/ai-reports/${type}?${q}`, { method: 'POST' });
      toast.success(t('ai.ready'));
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <RoleGate allow={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <AppShell>
        <SectionHeader
          title={t('ai.title')}
          action={
            <Button disabled={busy} onClick={generate}>
              {busy ? '...' : t('ai.create')}
            </Button>
          }
        />

        <div className="rounded-2xl border border-black/8 bg-white p-4 mb-5 space-y-3">
          <div className="flex flex-wrap gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={cn(
                  'rounded-xl px-3 py-1.5 text-sm font-medium',
                  period === p.id ? 'bg-teal-900 text-white' : 'bg-black/[0.04] text-ink-muted',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {TYPES.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setType(x.id)}
                className={cn(
                  'rounded-xl px-3 py-1.5 text-sm font-medium',
                  type === x.id ? 'bg-teal-800 text-white' : 'bg-black/[0.04] text-ink-muted',
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl border border-black/10 px-3 py-2 text-sm"
            />
            {period === 'CUSTOM' && (
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm"
              />
            )}
            {branches.length > 0 && (
              <select
                className="rounded-xl border border-black/10 px-3 py-2 text-sm"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">{t('ai.allBranches')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {reports.length === 0 && (
            <div className="rounded-2xl border border-dashed border-black/10 p-8 text-center text-ink-muted">
              {t('common.none')}
            </div>
          )}
          {reports.map((r) => (
            <article
              key={r.id}
              className="rounded-2xl border border-black/8 bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap justify-between gap-2 mb-3 text-xs text-ink-muted">
                <span>
                  {r.period || 'WEEK'} · {r.type}
                </span>
                <span>
                  {String(r.weekStart).slice(0, 10)}
                  {r.periodEnd ? ` — ${String(r.periodEnd).slice(0, 10)}` : ''}
                </span>
              </div>
              <div className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">
                {r.content}
              </div>
            </article>
          ))}
        </div>
      </AppShell>
    </RoleGate>
  );
}
