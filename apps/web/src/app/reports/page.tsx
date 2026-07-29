'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader, Select } from '@/components/ui';
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

type Tab = 'analytics' | 'audit';

const PIE_COLORS = ['#0F766E', '#D97706', '#E11D48'];
const LINE_COLORS = ['#0F766E', '#2563EB', '#C026D3', '#EA580C', '#0891B2'];

const CAT_LABEL: Record<string, { uz: string; ru: string }> = {
  clinic: { uz: 'Klinika', ru: 'Клиника' },
  reception: { uz: 'Administrator', ru: 'Администратор' },
  calls: { uz: 'Qoʻngʻiroqlar', ru: 'Звонки' },
  reviews: { uz: 'Sharhlar', ru: 'Отзывы' },
  uniform: { uz: 'Uniforma', ru: 'Униформа' },
  smm: { uz: 'SMM / SEO', ru: 'SMM / SEO' },
  marketing: { uz: 'Marketing', ru: 'Маркетинг' },
};

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-ink-muted">...</div>}>
      <ReportsInner />
    </Suspense>
  );
}

function ReportsInner() {
  const toast = useToast();
  const { t, lang, roleLabel } = useI18n();
  const search = useSearchParams();
  const router = useRouter();
  const initialTab = (search.get('tab') === 'audit' ? 'audit' : 'analytics') as Tab;
  const [tab, setTab] = useState<Tab>(initialTab);

  const [from, setFrom] = useState(daysBefore(30));
  const [to, setTo] = useState(todayISO());
  const [branchId, setBranchId] = useState('');
  const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
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
      const params = new URLSearchParams({ from, to, frequency });
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
  }, [from, to, branchId, frequency, tab]);

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

  const s = data?.summary;
  const catLabel = (key: string) => {
    const L = CAT_LABEL[key];
    if (!L) return key;
    return lang === 'ru' ? L.ru : L.uz;
  };

  const branchBars = useMemo(
    () =>
      (data?.byBranch || []).map((b: any) => ({
        name: b.name.length > 14 ? b.name.slice(0, 12) + '…' : b.name,
        full: b.name,
        score: b.avgScore,
        completion: b.completionPct,
      })),
    [data],
  );

  const managerBars = useMemo(
    () =>
      (data?.byManager || []).slice(0, 10).map((m: any) => ({
        name: m.name.length > 12 ? m.name.slice(0, 10) + '…' : m.name,
        full: m.name,
        completion: m.completionPct,
        done: m.done,
        score: m.avgTaskScore,
      })),
    [data],
  );

  const categoryBars = useMemo(
    () =>
      (data?.byCategory || []).map((c: any) => ({
        name: catLabel(c.key),
        score: c.avgScore,
        completion: c.completionPct,
      })),
    [data, lang],
  );

  const multiTrend = useMemo(() => {
    const bt = data?.branchTrend || {};
    const names = Object.keys(bt);
    const dateSet = new Set<string>();
    for (const n of names) for (const p of bt[n] || []) dateSet.add(p.date);
    const dates = [...dateSet].sort();
    return dates.map((date) => {
      const row: Record<string, string | number> = { date: date.slice(5) };
      for (const n of names) {
        const hit = (bt[n] || []).find((x: any) => x.date === date);
        if (hit) row[n] = hit.score;
      }
      return row;
    });
  }, [data]);

  const branchTrendNames = Object.keys(data?.branchTrend || {});

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

  const pieData = (data?.statusPie || []).map((x: any) => ({
    ...x,
    label: statusLabel(x.name),
  }));

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
            <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 mb-5 grid grid-cols-1 sm:flex sm:flex-wrap gap-3 items-end">
              <label className="text-sm w-full sm:w-auto">
                <span className="text-ink-muted block mb-1">{t('common.from')}</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-11 w-full sm:w-auto px-3 rounded-xl border border-teal-200 bg-white"
                />
              </label>
              <label className="text-sm w-full sm:w-auto">
                <span className="text-ink-muted block mb-1">{t('common.to')}</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-11 w-full sm:w-auto px-3 rounded-xl border border-teal-200 bg-white"
                />
              </label>
              <div className="w-full sm:min-w-[160px] sm:w-auto">
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
              <div className="w-full sm:min-w-[140px] sm:w-auto">
                <Select
                  label={t('reports.frequency')}
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as any)}
                >
                  <option value="DAILY">{t('today.daily')}</option>
                  <option value="WEEKLY">{t('today.weekly')}</option>
                  <option value="MONTHLY">{t('today.monthly')}</option>
                </Select>
              </div>
              <div className="flex gap-2 w-full sm:w-auto overflow-x-auto">
                {[7, 30, 90].map((n) => (
                  <Button key={n} variant="ghost" size="sm" onClick={() => setFrom(daysBefore(n))}>
                    {t('reports.days', { n })}
                  </Button>
                ))}
              </div>
            </div>

            {loading && (
              <div className="py-16 text-center text-ink-muted">{t('common.loading')}</div>
            )}

            {!loading && data && (
              <div className="space-y-5">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard
                    label={t('reports.avg')}
                    value={`${s?.avgScore ?? 0}%`}
                    tone="teal"
                  />
                  <StatCard
                    label={t('reports.completion')}
                    value={`${s?.completionPct ?? 0}%`}
                    hint={`${s?.entriesDone ?? 0}/${s?.entriesTotal ?? 0}`}
                  />
                  <StatCard
                    label={t('reports.proofRate')}
                    value={`${s?.proofs?.approveRate ?? 0}%`}
                    hint={`${s?.proofs?.approved ?? 0}✓ / ${s?.proofs?.rejected ?? 0}✗`}
                  />
                  <StatCard
                    label={t('reports.tracked')}
                    value={String(s?.daysTracked ?? 0)}
                    hint={`${s?.branches ?? 0} ${t('reports.branchesUnit')} · ${s?.managers ?? 0} ${t('reports.managersUnit')}`}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <p className="text-xs font-semibold text-emerald-900 uppercase tracking-wide">
                      {t('reports.bestDay')}
                    </p>
                    <p className="font-display text-3xl mt-1 tabular-nums text-emerald-950">
                      {s?.bestScore != null ? `${s.bestScore}%` : '—'}
                    </p>
                    <p className="text-xs text-emerald-800/80 mt-1">
                      {[s?.bestDate, s?.bestBranch].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                    <p className="text-xs font-semibold text-rose-900 uppercase tracking-wide">
                      {t('reports.worstDay')}
                    </p>
                    <p className="font-display text-3xl mt-1 tabular-nums text-rose-950">
                      {s?.worstScore != null ? `${s.worstScore}%` : '—'}
                    </p>
                    <p className="text-xs text-rose-800/80 mt-1">
                      {[s?.worstDate, s?.worstBranch].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 rounded-2xl border border-teal-100 bg-white p-4">
                    <p className="text-sm font-semibold mb-3">{t('reports.trend')}</p>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.trend || []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#D5EBE6" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => String(v).slice(5)}
                          />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Area
                            type="monotone"
                            dataKey="score"
                            name={t('reports.score')}
                            stroke="#0F5F54"
                            fill="#99F6E4"
                            fillOpacity={0.35}
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-teal-100 bg-white p-4">
                    <p className="text-sm font-semibold mb-3">{t('reports.statusSplit')}</p>
                    <div className="h-56">
                      {pieData.length === 0 ? (
                        <div className="h-full grid place-items-center text-ink-muted text-sm">
                          {t('reports.noData')}
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              dataKey="value"
                              nameKey="label"
                              innerRadius={48}
                              outerRadius={78}
                              paddingAngle={2}
                            >
                              {pieData.map((_: any, i: number) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    <div className="flex justify-around text-xs mt-1 text-ink-muted">
                      <span>🟢 {s?.statusCount?.green ?? 0}</span>
                      <span>🟡 {s?.statusCount?.yellow ?? 0}</span>
                      <span>🔴 {s?.statusCount?.red ?? 0}</span>
                    </div>
                  </div>
                </div>

                {multiTrend.length > 0 && branchTrendNames.length > 1 && (
                  <div className="rounded-2xl border border-teal-100 bg-white p-4">
                    <p className="text-sm font-semibold mb-3">{t('reports.branchTrend')}</p>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={multiTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#D5EBE6" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend />
                          {branchTrendNames.map((name, i) => (
                            <Line
                              key={name}
                              type="monotone"
                              dataKey={name}
                              stroke={LINE_COLORS[i % LINE_COLORS.length]}
                              strokeWidth={2}
                              dot={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-teal-100 bg-white p-4">
                    <p className="text-sm font-semibold mb-3">{t('reports.byBranch')}</p>
                    <div className="h-64">
                      {branchBars.length === 0 ? (
                        <Empty />
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={branchBars} layout="vertical" margin={{ left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#D5EBE6" />
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={90}
                              tick={{ fontSize: 11 }}
                            />
                            <Tooltip
                              formatter={(v: any, _n: any, p: any) => [
                                `${v}%`,
                                p?.payload?.full || '',
                              ]}
                            />
                            <Bar dataKey="score" name={t('reports.score')} fill="#0F766E" radius={4} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-teal-100 bg-white p-4">
                    <p className="text-sm font-semibold mb-3">{t('reports.byManager')}</p>
                    <div className="h-64">
                      {managerBars.length === 0 ? (
                        <Empty />
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={managerBars}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#D5EBE6" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                            <Tooltip
                              formatter={(v: any, name: any, p: any) => [
                                `${v}${name === 'done' ? '' : '%'}`,
                                p?.payload?.full || name,
                              ]}
                            />
                            <Bar
                              dataKey="completion"
                              name={t('reports.completion')}
                              fill="#2563EB"
                              radius={4}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-teal-100 bg-white p-4">
                  <p className="text-sm font-semibold mb-3">{t('reports.byCategory')}</p>
                  <div className="h-56">
                    {categoryBars.length === 0 ? (
                      <Empty />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryBars}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#D5EBE6" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="score" name={t('reports.score')} fill="#0F766E" radius={4} />
                          <Bar
                            dataKey="completion"
                            name={t('reports.completion')}
                            fill="#99F6E4"
                            radius={4}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-teal-100 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-teal-50 flex items-center justify-between">
                    <p className="text-sm font-semibold">{t('reports.incompleteTitle')}</p>
                    <span className="text-xs text-ink-muted">
                      {(data.incompleteTasks || []).length} {t('reports.tasksUnit')}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="text-left text-ink-muted border-b border-teal-50">
                          <th className="p-3">#</th>
                          <th className="p-3">{t('reports.task')}</th>
                          <th className="p-3">{t('reports.missPct')}</th>
                          <th className="p-3">{t('reports.missed')}</th>
                          <th className="p-3">{t('branches.branch')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.incompleteTasks || []).length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-10 text-center text-ink-muted">
                              {t('reports.noIncomplete')}
                            </td>
                          </tr>
                        )}
                        {(data.incompleteTasks || []).map((row: any, i: number) => (
                          <tr key={row.nodeKey} className="border-b border-teal-50/80">
                            <td className="px-3 py-2.5 text-ink-muted">{i + 1}</td>
                            <td className="px-3 py-2.5 font-medium">
                              {lang === 'ru' ? row.titleRu : row.titleUz}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={cn(
                                  'tabular-nums font-semibold',
                                  row.missPct >= 70
                                    ? 'text-rose-700'
                                    : row.missPct >= 40
                                      ? 'text-amber-700'
                                      : 'text-teal-800',
                                )}
                              >
                                {row.missPct}%
                              </span>
                            </td>
                            <td className="px-3 py-2.5 tabular-nums">
                              {row.missed}/{row.opportunities}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-ink-muted">
                              {(row.branches || []).slice(0, 3).join(', ')}
                              {(row.branches || []).length > 3 ? '…' : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-teal-100 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-teal-50">
                      <p className="text-sm font-semibold">{t('reports.branchTable')}</p>
                    </div>
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                          <tr className="text-left text-ink-muted border-b border-teal-50">
                            <th className="p-3">{t('branches.branch')}</th>
                            <th className="p-3">{t('reports.score')}</th>
                            <th className="p-3">{t('reports.completion')}</th>
                            <th className="p-3">{t('reports.managersUnit')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data.byBranch || []).map((b: any) => (
                            <tr key={b.branchId} className="border-b border-teal-50/80">
                              <td className="px-3 py-2.5 font-medium">{b.name}</td>
                              <td className="px-3 py-2.5 tabular-nums font-semibold">
                                {b.avgScore}%
                              </td>
                              <td className="px-3 py-2.5 tabular-nums">{b.completionPct}%</td>
                              <td className="px-3 py-2.5 text-xs text-ink-muted">
                                {(b.managers || []).map((m: any) => m.name).join(', ') || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-teal-100 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-teal-50">
                      <p className="text-sm font-semibold">{t('reports.managerTable')}</p>
                    </div>
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                          <tr className="text-left text-ink-muted border-b border-teal-50">
                            <th className="p-3">{t('branches.manager')}</th>
                            <th className="p-3">{t('reports.completion')}</th>
                            <th className="p-3">{t('reports.done')}</th>
                            <th className="p-3">{t('reports.proofs')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data.byManager || []).map((m: any) => (
                            <tr key={m.id} className="border-b border-teal-50/80">
                              <td className="px-3 py-2.5">
                                <p className="font-medium">{m.name}</p>
                                <p className="text-[11px] text-ink-muted">
                                  {(m.branches || []).join(', ')}
                                </p>
                              </td>
                              <td className="px-3 py-2.5 tabular-nums font-semibold">
                                {m.completionPct}%
                              </td>
                              <td className="px-3 py-2.5 tabular-nums">
                                {m.done}/{m.total}
                              </td>
                              <td className="px-3 py-2.5 text-xs">
                                <span className="text-teal-800">{m.proofsApproved}✓</span>
                                {' · '}
                                <span className="text-amber-700">{m.proofsPending}…</span>
                                {' · '}
                                <span className="text-rose-700">{m.proofsRejected}✗</span>
                              </td>
                            </tr>
                          ))}
                          {(data.byManager || []).length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-ink-muted">
                                {t('reports.noData')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
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

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'teal';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        tone === 'teal'
          ? 'border-teal-800/20 bg-gradient-to-br from-teal-800 to-teal-900 text-white'
          : 'border-teal-100 bg-white',
      )}
    >
      <p
        className={cn(
          'text-xs font-semibold uppercase tracking-wide',
          tone === 'teal' ? 'text-teal-100/80' : 'text-ink-muted',
        )}
      >
        {label}
      </p>
      <p className="font-display text-3xl mt-1 tabular-nums">{value}</p>
      {hint && (
        <p className={cn('text-xs mt-1', tone === 'teal' ? 'text-teal-100/70' : 'text-ink-muted')}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Empty() {
  const { t } = useI18n();
  return <div className="h-full grid place-items-center text-ink-muted text-sm">{t('reports.noData')}</div>;
}
