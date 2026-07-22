'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { api, downloadReport } from '@/lib/api';
import { formatTashkent, todayISO, type Role } from '@/types';
import { cn } from '@/lib/utils';

function daysBefore(n: number) {
  const [y, m, d] = todayISO().split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - n);
  return utc.toISOString().slice(0, 10);
}

type Tab = 'scores' | 'audit';

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-ink-muted">...</div>}>
      <ReportsInner />
    </Suspense>
  );
}

function ReportsInner() {
  const toast = useToast();
  const { t, roleLabel } = useI18n();
  const search = useSearchParams();
  const router = useRouter();
  const initialTab = (search.get('tab') === 'audit' ? 'audit' : 'scores') as Tab;
  const [tab, setTab] = useState<Tab>(initialTab);

  const [from, setFrom] = useState(daysBefore(30));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const [audit, setAudit] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [aFrom, setAFrom] = useState('');
  const [aTo, setATo] = useState('');
  const [openMeta, setOpenMeta] = useState<string | null>(null);

  useEffect(() => {
    const next = search.get('tab') === 'audit' ? 'audit' : 'scores';
    setTab(next);
  }, [search]);

  function switchTab(next: Tab) {
    setTab(next);
    router.replace(next === 'audit' ? '/reports?tab=audit' : '/reports');
  }

  async function loadScores() {
    try {
      setData(await api(`/reports?from=${from}&to=${to}`));
    } catch (e: any) {
      toast.error(t('reports.loadFail'), e.message);
    }
  }

  async function loadAudit(p = page) {
    try {
      const params = new URLSearchParams({ page: String(p), limit: '40' });
      if (q.trim()) params.set('q', q.trim());
      if (action.trim()) params.set('action', action.trim());
      if (aFrom) params.set('from', aFrom);
      if (aTo) params.set('to', aTo);
      setAudit(await api(`/audit?${params}`));
    } catch (e: any) {
      toast.error(t('reports.loadFail'), e.message);
    }
  }

  useEffect(() => {
    if (tab === 'scores') loadScores();
  }, [from, to, tab]);

  useEffect(() => {
    if (tab === 'audit') loadAudit(page);
  }, [page, tab]);

  async function exportFile(kind: 'excel' | 'pdf') {
    setBusy(true);
    try {
      await downloadReport(kind, from, to);
      toast.success(t('reports.exportOk'));
    } catch (e: any) {
      toast.error(t('reports.exportFail'), e.message);
    } finally {
      setBusy(false);
    }
  }

  const chart = useMemo(
    () =>
      (data?.scores || []).map((s: any) => ({
        date: String(s.date).slice(5, 10),
        score: s.totalScore,
      })),
    [data],
  );

  function statusLabel(color: string) {
    if (color === 'green') return t('reports.good');
    if (color === 'yellow') return t('reports.mid');
    if (color === 'red') return t('reports.low');
    return color;
  }

  function actionLabel(a: string) {
    return t(`reports.actions.${a}`) !== `reports.actions.${a}`
      ? t(`reports.actions.${a}`)
      : a;
  }

  return (
    <AppShell>
      <RoleGate allow={['ADMIN', 'SUPER_ADMIN', 'MANAGER']}>
        <SectionHeader
          title={t('reports.title')}
          action={
            tab === 'scores' ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => exportFile('pdf')}>
                  {t('reports.pdf')}
                </Button>
                <Button disabled={busy} onClick={() => exportFile('excel')}>
                  {t('reports.excel')}
                </Button>
              </div>
            ) : undefined
          }
        />

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-teal-950/[0.05] mb-5 max-w-sm">
          <button
            type="button"
            onClick={() => switchTab('scores')}
            className={cn(
              'rounded-lg py-2 text-sm font-medium',
              tab === 'scores' ? 'bg-white text-teal-950 shadow-sm' : 'text-ink-muted',
            )}
          >
            {t('reports.tabScores')}
          </button>
          <button
            type="button"
            onClick={() => switchTab('audit')}
            className={cn(
              'rounded-lg py-2 text-sm font-medium',
              tab === 'audit' ? 'bg-white text-teal-950 shadow-sm' : 'text-ink-muted',
            )}
          >
            {t('reports.tabAudit')}
          </button>
        </div>

        {tab === 'scores' && (
          <>
            <div className="flex flex-wrap gap-3 mb-5">
              <label className="text-sm">
                <span className="text-ink-muted block mb-1">{t('common.from')}</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-11 px-3 rounded-xl border border-teal-200 bg-white"
                />
              </label>
              <label className="text-sm">
                <span className="text-ink-muted block mb-1">{t('common.to')}</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-11 px-3 rounded-xl border border-teal-200 bg-white"
                />
              </label>
              <div className="flex items-end gap-2">
                {[7, 30, 90].map((n) => (
                  <Button key={n} variant="ghost" size="sm" onClick={() => setFrom(daysBefore(n))}>
                    {t('reports.days', { n })}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-4 mb-5">
              <div className="rounded-2xl bg-gradient-to-br from-teal-800 to-teal-900 text-white p-5">
                <p className="text-teal-100/80 text-sm">{t('reports.avg')}</p>
                <p className="font-display text-5xl mt-1 tabular-nums">{data?.avg ?? 0}%</p>
              </div>
              <div className="lg:col-span-2 rounded-2xl border border-teal-100 bg-white p-4">
                <p className="text-sm font-semibold mb-3">{t('reports.trend')}</p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#D5EBE6" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="score" stroke="#0F5F54" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-teal-100 bg-white overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-ink-muted border-b border-teal-50">
                    <th className="p-3">{t('common.date')}</th>
                    <th className="p-3">{t('reports.score')}</th>
                    <th className="p-3">{t('reports.status')}</th>
                    <th className="p-3">{t('reports.clinic')}</th>
                    <th className="p-3">{t('reports.reception')}</th>
                    <th className="p-3">{t('reports.calls')}</th>
                    <th className="p-3">{t('reports.uniform')}</th>
                    <th className="p-3">{t('reports.smm')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.scores || []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-ink-muted">
                        {t('reports.noData')}
                      </td>
                    </tr>
                  )}
                  {(data?.scores || []).map((s: any) => {
                    const b = s.blockScores || {};
                    return (
                      <tr key={s.id || s.date} className="border-b border-teal-50/80">
                        <td className="px-3 py-2.5">{String(s.date).slice(0, 10)}</td>
                        <td className="px-3 py-2.5 font-semibold tabular-nums">{s.totalScore}%</td>
                        <td className="px-3 py-2.5">{statusLabel(s.colorStatus)}</td>
                        <td className="px-3 py-2.5">{b.clinic ?? b.clinic_inspection ?? '—'}</td>
                        <td className="px-3 py-2.5">{b.reception ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          {b.calls ?? b.calls_new ?? '—'}
                        </td>
                        <td className="px-3 py-2.5">{b.uniform ?? '—'}</td>
                        <td className="px-3 py-2.5">{b.smm ?? b.seo ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'audit' && (
          <>
            <div className="rounded-2xl border border-teal-100 bg-white p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Input
                label={t('reports.auditSearch')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <Input
                label={t('reports.auditAction')}
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
              <Input
                label={t('common.from')}
                type="date"
                value={aFrom}
                onChange={(e) => setAFrom(e.target.value)}
              />
              <Input
                label={t('common.to')}
                type="date"
                value={aTo}
                onChange={(e) => setATo(e.target.value)}
              />
              <div className="flex items-end">
                <Button
                  className="w-full min-h-11"
                  onClick={() => {
                    setPage(1);
                    loadAudit(1);
                  }}
                >
                  {t('common.filter')}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {(audit?.items || []).length === 0 && (
                <div className="rounded-2xl border border-dashed border-teal-200 p-10 text-center text-ink-muted">
                  {t('reports.auditEmpty')}
                </div>
              )}
              {(audit?.items || []).map((a: any) => (
                <article
                  key={a.id}
                  className="rounded-xl border border-teal-100 bg-white p-4"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">{actionLabel(a.action)}</p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {a.user?.name || '—'}
                        {a.user?.role ? ` · ${roleLabel(a.user.role as Role)}` : ''}
                      </p>
                    </div>
                    <p className="text-xs text-ink-muted whitespace-nowrap">
                      {formatTashkent(a.createdAt)}
                    </p>
                  </div>
                  <p className="text-xs text-teal-800 mt-2">
                    {a.entity}
                    {a.entityId ? ` · ${String(a.entityId).slice(0, 12)}…` : ''}
                  </p>
                  {a.meta && (
                    <button
                      type="button"
                      className="text-xs text-teal-700 underline mt-2"
                      onClick={() => setOpenMeta(openMeta === a.id ? null : a.id)}
                    >
                      {openMeta === a.id ? t('reports.metaHide') : t('reports.metaShow')}
                    </button>
                  )}
                  {openMeta === a.id && a.meta && (
                    <pre className="mt-2 text-[11px] bg-sand-50 rounded-xl p-3 overflow-x-auto text-ink-soft">
                      {JSON.stringify(a.meta, null, 2)}
                    </pre>
                  )}
                </article>
              ))}
            </div>

            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-ink-muted">
                {t('common.total')}: {audit?.total ?? 0}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('common.prev')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= (audit?.pages || 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('common.next')}
                </Button>
              </div>
            </div>
          </>
        )}
      </RoleGate>
    </AppShell>
  );
}
