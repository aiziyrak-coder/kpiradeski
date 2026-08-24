'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, SectionHeader, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { api, downloadReport } from '@/lib/api';
import { formatTashkent, todayISO, weekStartISO } from '@/types';
import { cn } from '@/lib/utils';

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type Tab = 'analytics' | 'audit';

function monthStartISO(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function monthEndISO(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function weekEndISO(from: string) {
  const [y, m, d] = weekStartISO(from).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 6)).toISOString().slice(0, 10);
}

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
  const initialTab = (search.get('tab') === 'audit' ? 'audit' : 'analytics') as Tab;
  const [tab, setTab] = useState<Tab>(initialTab);

  const [freq, setFreq] = useState<Freq>('DAILY');
  const [date, setDate] = useState(todayISO());
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [audit, setAudit] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [aFrom, setAFrom] = useState('');
  const [aTo, setATo] = useState('');
  const [openMeta, setOpenMeta] = useState<string | null>(null);

  const range = useMemo(() => {
    if (freq === 'WEEKLY') {
      const from = weekStartISO(date);
      return { from, to: weekEndISO(date) };
    }
    if (freq === 'MONTHLY') {
      return { from: monthStartISO(date), to: monthEndISO(date) };
    }
    return { from: date, to: date };
  }, [freq, date]);

  useEffect(() => {
    setTab(search.get('tab') === 'audit' ? 'audit' : 'analytics');
  }, [search]);

  useEffect(() => {
    api<any[]>('/branches/mine')
      .then((list) => setBranches(Array.isArray(list) ? list : []))
      .catch(() => setBranches([]));
  }, []);

  function switchTab(next: Tab) {
    setTab(next);
    router.replace(next === 'audit' ? '/reports?tab=audit' : '/reports');
  }

  async function loadAnalytics() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
        frequency: freq,
      });
      if (branchId) params.set('branchId', branchId);
      setData(await api(`/reports/analytics?${params}`));
    } catch (e: any) {
      toast.error(t('reports.loadFail'), e.message);
    } finally {
      setLoading(false);
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
    if (tab === 'analytics') loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, branchId, freq, tab]);

  useEffect(() => {
    if (tab === 'audit') loadAudit(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, tab]);

  async function exportFile(kind: 'excel' | 'pdf') {
    setBusy(true);
    try {
      await downloadReport(kind, range.from, range.to);
      toast.success(t('reports.exportOk'));
    } catch (e: any) {
      toast.error(t('reports.exportFail'), e.message);
    } finally {
      setBusy(false);
    }
  }

  const s = data?.summary;
  const periodLabel =
    range.from === range.to ? range.from : `${range.from} — ${range.to}`;

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
            tab === 'analytics' ? (
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

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-teal-950/[0.05] mb-5 w-full sm:max-w-sm">
          <button
            type="button"
            onClick={() => switchTab('analytics')}
            className={cn(
              'rounded-lg py-2.5 min-h-11 text-sm font-medium',
              tab === 'analytics' ? 'bg-white text-teal-950 shadow-sm' : 'text-ink-muted',
            )}
          >
            {t('reports.tabAnalytics')}
          </button>
          <button
            type="button"
            onClick={() => switchTab('audit')}
            className={cn(
              'rounded-lg py-2.5 min-h-11 text-sm font-medium',
              tab === 'audit' ? 'bg-white text-teal-950 shadow-sm' : 'text-ink-muted',
            )}
          >
            {t('reports.tabAudit')}
          </button>
        </div>

        {tab === 'analytics' && (
          <>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-teal-950/[0.05] mb-4">
              {(['DAILY', 'WEEKLY', 'MONTHLY'] as Freq[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFreq(id)}
                  className={cn(
                    'rounded-lg py-2.5 text-sm font-semibold transition',
                    freq === id
                      ? id === 'DAILY'
                        ? 'bg-teal-800 text-white shadow-sm'
                        : id === 'WEEKLY'
                          ? 'bg-amber-700 text-white shadow-sm'
                          : 'bg-indigo-800 text-white shadow-sm'
                      : 'text-ink-muted',
                  )}
                >
                  {id === 'DAILY'
                    ? t('today.daily')
                    : id === 'WEEKLY'
                      ? t('today.weekly')
                      : t('today.monthly')}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 mb-5 grid grid-cols-1 sm:flex sm:flex-wrap gap-3 items-end">
              <label className="text-sm w-full sm:w-auto">
                <span className="text-ink-muted block mb-1">{t('reports.pickDate')}</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-11 w-full sm:w-auto px-3 rounded-xl border border-teal-200 bg-white"
                />
              </label>
              <div className="w-full sm:min-w-[180px] sm:w-auto">
                <Select
                  label={t('branches.branch')}
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  <option value="">{t('reports.allBranches')}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="text-sm text-ink-muted sm:ml-auto tabular-nums">{periodLabel}</p>
            </div>

            {loading && (
              <div className="py-16 text-center text-ink-muted">{t('common.loading')}</div>
            )}

            {!loading && data && (
              <div className="space-y-5">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-teal-100 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold">
                      {t('reports.tasksDone')}
                    </p>
                    <p className="font-display text-3xl mt-1 tabular-nums">
                      {s?.entriesDone ?? 0}
                      <span className="text-lg text-ink-muted font-sans font-semibold">
                        /{s?.entriesTotal ?? 0}
                      </span>
                    </p>
                    <p className="text-xs text-ink-muted mt-1">
                      {t('reports.completion')}: {s?.completionPct ?? 0}%
                    </p>
                  </div>
                  <div className="rounded-2xl border border-teal-100 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold">
                      {t('reports.avgScore')}
                    </p>
                    <p className="font-display text-3xl mt-1 tabular-nums">
                      {s?.avgScore ?? 0}
                    </p>
                    <p className="text-xs text-ink-muted mt-1">/ 100</p>
                  </div>
                  <div className="rounded-2xl border border-teal-100 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold">
                      {t('reports.scope')}
                    </p>
                    <p className="font-display text-3xl mt-1 tabular-nums">
                      {s?.branches ?? 0}
                    </p>
                    <p className="text-xs text-ink-muted mt-1">
                      {t('reports.managersUnit')}: {s?.managers ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4 sm:col-span-3">
                    <p className="text-xs uppercase tracking-wide text-rose-800 font-semibold">
                      {t('reports.missedOnTime')}
                    </p>
                    <p className="font-display text-3xl mt-1 tabular-nums text-rose-950">
                      {s?.missedOnTime ?? 0}
                    </p>
                    <p className="text-xs text-ink-muted mt-1">{t('reports.missedOnTimeHint')}</p>
                    {(s?.missedOnTimeSamples || []).length > 0 && (
                      <ul className="mt-3 space-y-1 text-sm text-rose-950">
                        {s.missedOnTimeSamples.map(
                          (x: { title: string; branch: string; date: string }, i: number) => (
                            <li key={`${x.date}-${x.branch}-${i}`}>
                              {x.date} · {x.branch}: {x.title}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                </div>

                <section className="rounded-2xl border border-teal-100 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-teal-50">
                    <h2 className="text-sm font-semibold">{t('reports.byBranch')}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-ink-muted bg-teal-950/[0.03]">
                          <th className="p-3 font-medium">{t('branches.branch')}</th>
                          <th className="p-3 font-medium">{t('reports.tasksDone')}</th>
                          <th className="p-3 font-medium">{t('reports.avgScore')}</th>
                          <th className="p-3 font-medium">{t('reports.managers')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.byBranch || []).length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-6 text-center text-ink-muted">
                              {t('reports.noData')}
                            </td>
                          </tr>
                        )}
                        {(data.byBranch || []).map((b: any) => (
                          <tr key={b.branchId} className="border-t border-teal-900/[0.06]">
                            <td className="p-3 font-medium">{b.name}</td>
                            <td className="p-3 tabular-nums">
                              {b.entriesDone}/{b.entriesTotal}
                              <span className="text-ink-muted text-xs ml-1">
                                ({b.completionPct}%)
                              </span>
                            </td>
                            <td className="p-3 tabular-nums font-semibold">
                              {b.score ?? b.avgScore ?? '—'}
                            </td>
                            <td className="p-3 text-xs text-ink-muted">
                              {(b.managers || []).map((m: any) => m.name).join(', ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-2xl border border-teal-100 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-teal-50">
                    <h2 className="text-sm font-semibold">{t('reports.byManager')}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-ink-muted bg-teal-950/[0.03]">
                          <th className="p-3 font-medium">{t('reports.manager')}</th>
                          <th className="p-3 font-medium">{t('branches.branch')}</th>
                          <th className="p-3 font-medium">{t('reports.tasksDone')}</th>
                          <th className="p-3 font-medium">{t('reports.avgScore')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.byManager || []).length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-6 text-center text-ink-muted">
                              {t('reports.noData')}
                            </td>
                          </tr>
                        )}
                        {(data.byManager || []).map((m: any) => (
                          <tr key={m.id} className="border-t border-teal-900/[0.06]">
                            <td className="p-3 font-medium">{m.name}</td>
                            <td className="p-3 text-xs text-ink-muted">
                              {(m.branches || []).join(', ') || '—'}
                            </td>
                            <td className="p-3 tabular-nums">
                              {m.done}/{m.total}
                              <span className="text-ink-muted text-xs ml-1">
                                ({m.completionPct}%)
                              </span>
                            </td>
                            <td className="p-3 tabular-nums font-semibold">
                              {m.avgTaskScore || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
          </>
        )}

        {tab === 'audit' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-sm">
                <span className="text-ink-muted block mb-1">{t('reports.auditSearch')}</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="h-11 w-full px-3 rounded-xl border border-teal-200"
                />
              </label>
              <label className="text-sm">
                <span className="text-ink-muted block mb-1">{t('reports.auditAction')}</span>
                <input
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="h-11 w-full px-3 rounded-xl border border-teal-200"
                />
              </label>
              <label className="text-sm">
                <span className="text-ink-muted block mb-1">{t('common.from')}</span>
                <input
                  type="date"
                  value={aFrom}
                  onChange={(e) => setAFrom(e.target.value)}
                  className="h-11 w-full px-3 rounded-xl border border-teal-200"
                />
              </label>
              <div className="flex items-end gap-2">
                <label className="text-sm flex-1">
                  <span className="text-ink-muted block mb-1">{t('common.to')}</span>
                  <input
                    type="date"
                    value={aTo}
                    onChange={(e) => setATo(e.target.value)}
                    className="h-11 w-full px-3 rounded-xl border border-teal-200"
                  />
                </label>
                <Button
                  onClick={() => {
                    setPage(1);
                    loadAudit(1);
                  }}
                >
                  {t('common.search')}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-teal-100 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-xs text-ink-muted border-b">
                      <th className="p-3">{t('common.date')}</th>
                      <th className="p-3">{t('reports.auditAction')}</th>
                      <th className="p-3">{t('users.name')}</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {(audit?.items || []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-ink-muted">
                          {t('reports.auditEmpty')}
                        </td>
                      </tr>
                    )}
                    {(audit?.items || []).map((row: any) => (
                      <tr key={row.id} className="border-t border-teal-900/[0.06] align-top">
                        <td className="p-3 text-xs tabular-nums whitespace-nowrap">
                          {formatTashkent(row.createdAt)}
                        </td>
                        <td className="p-3">{actionLabel(row.action)}</td>
                        <td className="p-3 text-xs">
                          {row.user?.name || '—'}
                          {row.user?.role ? (
                            <span className="text-ink-muted"> · {roleLabel(row.user.role)}</span>
                          ) : null}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            className="text-xs text-teal-800 underline"
                            onClick={() =>
                              setOpenMeta((id) => (id === row.id ? null : row.id))
                            }
                          >
                            {openMeta === row.id ? t('reports.metaHide') : t('reports.metaShow')}
                          </button>
                          {openMeta === row.id && (
                            <pre className="mt-2 text-[11px] bg-sand-50 rounded-xl p-3 overflow-x-auto text-ink-soft">
                              {JSON.stringify(row.meta || {}, null, 2)}
                            </pre>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(audit?.pages || 0) > 1 && (
                <div className="flex justify-center gap-2 p-3 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ‹
                  </Button>
                  <span className="text-sm tabular-nums self-center">
                    {page}/{audit.pages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= audit.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    ›
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </RoleGate>
    </AppShell>
  );
}
