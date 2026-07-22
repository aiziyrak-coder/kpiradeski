'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { api, getToken } from '@/lib/api';
import { todayISO, weekStartISO } from '@/types';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, ChevronRight, Search, Upload } from 'lucide-react';

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type TaskRow = {
  key: string;
  titleUz: string;
  titleRu: string;
  sectionUz?: string;
  sectionRu?: string;
  inputType: string;
  status: 'TODO' | 'PENDING' | 'REJECTED' | 'DONE';
  done: boolean;
  value: any;
  aiStatus: string | null;
  aiNote: string | null;
  aiFeedback: string | null;
  proof: { id: string; fileName: string; aiStatus: string } | null;
};

type TreeNode = {
  key: string;
  titleUz: string;
  titleRu: string;
  inputType: string;
  assigned?: boolean;
  children: TreeNode[];
};

const FREQ_IDS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

function monthEndISO(from: string) {
  const [y, m] = from.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function collectLeaves(n: TreeNode): string[] {
  if (!n.children?.length) {
    return n.inputType === 'GROUP' ? [] : [n.key];
  }
  return n.children.flatMap(collectLeaves);
}

export default function TodayPage() {
  const toast = useToast();
  const { lang, t } = useI18n();
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState('');
  const [freq, setFreq] = useState<Freq>('DAILY');
  const [date, setDate] = useState(todayISO());
  const [day, setDay] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [assignSel, setAssignSel] = useState<Record<string, boolean>>({});
  const [assignOpen, setAssignOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState<Record<string, boolean>>({});
  const [adminTab, setAdminTab] = useState<'assign' | 'results'>('assign');

  const loadBranches = useCallback(async () => {
    const list = await api<any[]>('/branches/mine');
    const active = list.filter((b) => b.active !== false);
    setBranches(active);
    setBranchId((prev) => prev || active[0]?.id || '');
  }, []);

  const loadDay = useCallback(async () => {
    if (!branchId) {
      setDay(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await api(
        `/manager-kpi/day?branchId=${branchId}&date=${date}&frequency=${freq}`,
      );
      setDay(d);
      const next: Record<string, boolean> = {};
      const walk = (nodes: TreeNode[]) => {
        for (const n of nodes || []) {
          if (n.inputType !== 'GROUP') next[n.key] = !!n.assigned;
          walk(n.children || []);
        }
      };
      walk(d.tree || []);
      setAssignSel(next);
    } catch (e: any) {
      toast.error(e.message);
      setDay(null);
    } finally {
      setLoading(false);
    }
  }, [branchId, date, freq, toast]);

  useEffect(() => {
    loadBranches().catch((e) => toast.error(e.message));
  }, [loadBranches, toast]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const periodFrom = day?.period?.from || (freq === 'WEEKLY' ? weekStartISO(date) : date);
  const periodTo =
    day?.period?.to ||
    (freq === 'WEEKLY'
      ? (() => {
          const [y, m, d] = weekStartISO(date).split('-').map(Number);
          return new Date(Date.UTC(y, m - 1, d + 6)).toISOString().slice(0, 10);
        })()
      : freq === 'MONTHLY'
        ? monthEndISO(date)
        : date);

  const filterRows = (rows: TaskRow[]) => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => {
      const title = ((lang === 'ru' ? r.titleRu : r.titleUz) || '').toLowerCase();
      const sec = ((lang === 'ru' ? r.sectionRu : r.sectionUz) || '').toLowerCase();
      return title.includes(s) || sec.includes(s);
    });
  };

  const uniquePending = useMemo(
    () => filterRows(day?.pending || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, q, lang],
  );

  const inReview = useMemo(
    () => filterRows(day?.inReview || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, q, lang],
  );
  const completed = useMemo(
    () => filterRows(day?.completed || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, q, lang],
  );

  async function submitTask(row: TaskRow) {
    const file = files[row.key];
    if (!file) {
      toast.error(t('today.needFile'));
      return;
    }
    setBusyKey(row.key);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('branchId', branchId);
      fd.append('nodeKey', row.key);
      fd.append('date', date);
      const val = draft[row.key];
      if (val != null) fd.append('value', JSON.stringify(val));
      const token = getToken();
      const res = await fetch('/api/manager-kpi/proof', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t('common.error'));
      if (data.aiStatus === 'REJECTED') toast.error(data.aiNote || t('today.rejected'));
      else if (data.aiStatus === 'APPROVED') toast.success(data.aiNote || t('today.proofOk'));
      else toast.success(t('today.submittedOk'));
      setFiles((f) => ({ ...f, [row.key]: null }));
      await loadDay();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function saveAssign() {
    const nodeKeys = Object.entries(assignSel)
      .filter(([, v]) => v)
      .map(([k]) => k);
    setBusyKey('assign');
    try {
      await api('/manager-kpi/assign', {
        method: 'POST',
        body: JSON.stringify({ branchId, date, frequency: freq, nodeKeys }),
      });
      toast.success(t('today.savedAssign'));
      await loadDay();
      setAdminTab('results');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function openProof(id: string) {
    try {
      const token = getToken();
      const res = await fetch(`/api/manager-kpi/proofs/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(t('proof.openFailed'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function review(proofId: string, approve: boolean) {
    setBusyKey(proofId);
    try {
      await api('/manager-kpi/review-proof', {
        method: 'POST',
        body: JSON.stringify({ proofId, approve }),
      });
      toast.success(approve ? t('today.approve') : t('today.reject'));
      await loadDay();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyKey(null);
    }
  }

  function statusLabel(row: TaskRow) {
    if (row.status === 'DONE' || row.aiStatus === 'APPROVED') return t('today.aiApproved');
    if (row.status === 'REJECTED' || row.aiStatus === 'REJECTED') return t('today.aiRejected');
    if (row.status === 'PENDING' || row.aiStatus === 'PENDING') return t('today.aiPending');
    return t('today.todo');
  }

  function AssignTree({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
    const hasKids = !!node.children?.length;
    const open = treeOpen[node.key] ?? depth < 1;
    const leafKeys = hasKids ? collectLeaves(node) : [];
    const selectedCount = leafKeys.filter((k) => assignSel[k]).length;
    const allSel = leafKeys.length > 0 && selectedCount === leafKeys.length;
    const title = lang === 'ru' ? node.titleRu : node.titleUz;

    if (!hasKids && node.inputType === 'GROUP') return null;

    if (!hasKids) {
      return (
        <label
          className="flex items-center gap-3 px-3 py-2 border-t border-teal-900/[0.06] cursor-pointer hover:bg-teal-50/40"
          style={{ paddingLeft: 12 + depth * 14 }}
        >
          <input
            type="checkbox"
            checked={!!assignSel[node.key]}
            onChange={(e) => setAssignSel((s) => ({ ...s, [node.key]: e.target.checked }))}
            className="w-4 h-4 accent-teal-800"
          />
          <span className="text-sm text-ink">{title}</span>
        </label>
      );
    }

    return (
      <div className="border border-teal-900/10 rounded-xl overflow-hidden bg-white mb-2">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-teal-950/[0.03]">
          <button
            type="button"
            onClick={() => setTreeOpen((o) => ({ ...o, [node.key]: !open }))}
            className="p-0.5 text-ink-muted"
          >
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !allSel;
              setAssignSel((s) => {
                const copy = { ...s };
                leafKeys.forEach((k) => {
                  copy[k] = next;
                });
                return copy;
              });
            }}
            className={cn(
              'w-5 h-5 rounded-md border-2 grid place-items-center',
              allSel ? 'bg-teal-800 border-teal-800 text-white' : 'border-teal-800/30',
            )}
          >
            {allSel && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
          <span className="text-sm font-semibold text-ink flex-1">{title}</span>
          <span className="text-xs text-ink-muted tabular-nums">
            {selectedCount}/{leafKeys.length}
          </span>
        </div>
        {open && node.children.map((c) => <AssignTree key={c.key} node={c} depth={depth + 1} />)}
      </div>
    );
  }

  function TaskTable({
    rows,
    mode,
  }: {
    rows: TaskRow[];
    mode: 'manager-todo' | 'readonly' | 'admin-review';
  }) {
    if (!rows.length) {
      return (
        <p className="text-sm text-ink-muted py-6 text-center border border-dashed border-teal-900/15 rounded-xl">
          {t('today.emptyTasks')}
        </p>
      );
    }
    return (
      <div className="overflow-x-auto rounded-xl border border-teal-900/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted border-b border-teal-900/10 bg-teal-950/[0.03]">
              <th className="p-3 font-medium">{t('today.section')}</th>
              <th className="p-3 font-medium">{t('today.task')}</th>
              <th className="p-3 font-medium">{t('today.status')}</th>
              {mode === 'manager-todo' && (
                <>
                  <th className="p-3 font-medium">{t('today.pickFile')}</th>
                  <th className="p-3 font-medium">{t('today.action')}</th>
                </>
              )}
              {mode === 'admin-review' && <th className="p-3 font-medium">{t('today.action')}</th>}
              {mode === 'readonly' && <th className="p-3 font-medium">{t('today.viewProof')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const title = lang === 'ru' ? row.titleRu : row.titleUz;
              const section = lang === 'ru' ? row.sectionRu : row.sectionUz;
              return (
                <tr key={row.key} className="border-t border-teal-900/[0.06] align-top">
                  <td className="p-3 text-xs text-ink-muted whitespace-nowrap">{section || '—'}</td>
                  <td className="p-3">
                    <p className="font-medium text-ink">{title}</p>
                    {row.aiNote && (
                      <p className="text-xs text-ink-muted mt-1 leading-snug">{row.aiNote}</p>
                    )}
                    {row.inputType === 'RATIO' && mode === 'manager-todo' && (
                      <div className="flex gap-2 mt-2">
                        <input
                          type="number"
                          min={0}
                          placeholder={t('today.calls')}
                          className="w-20 h-8 rounded-lg border border-teal-200 px-2"
                          value={draft[row.key]?.calls ?? ''}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              [row.key]: {
                                ...(d[row.key] || {}),
                                calls: Number(e.target.value) || 0,
                                booked: d[row.key]?.booked || 0,
                              },
                            }))
                          }
                        />
                        <input
                          type="number"
                          min={0}
                          placeholder={t('today.booked')}
                          className="w-20 h-8 rounded-lg border border-teal-200 px-2"
                          value={draft[row.key]?.booked ?? ''}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              [row.key]: {
                                ...(d[row.key] || {}),
                                booked: Number(e.target.value) || 0,
                                calls: d[row.key]?.calls || 0,
                              },
                            }))
                          }
                        />
                      </div>
                    )}
                    {row.inputType === 'NUMBER' && mode === 'manager-todo' && (
                      <input
                        type="number"
                        min={0}
                        placeholder={t('today.count')}
                        className="mt-2 w-24 h-8 rounded-lg border border-teal-200 px-2"
                        value={draft[row.key]?.count ?? ''}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [row.key]: { count: Number(e.target.value) || 0 },
                          }))
                        }
                      />
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        'inline-flex text-[11px] font-semibold px-2 py-1 rounded-full',
                        row.status === 'DONE' && 'bg-teal-100 text-teal-900',
                        row.status === 'REJECTED' && 'bg-rose-100 text-rose-800',
                        row.status === 'PENDING' && 'bg-amber-100 text-amber-900',
                        row.status === 'TODO' && 'bg-sand-100 text-ink-muted',
                      )}
                    >
                      {statusLabel(row)}
                    </span>
                  </td>
                  {mode === 'manager-todo' && (
                    <>
                      <td className="p-3">
                        <label className="inline-flex items-center gap-1.5 text-xs text-teal-800 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[120px]">
                            {files[row.key]?.name || t('today.pickFile')}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              setFiles((f) => ({
                                ...f,
                                [row.key]: e.target.files?.[0] || null,
                              }))
                            }
                          />
                        </label>
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          disabled={busyKey === row.key}
                          onClick={() => submitTask(row)}
                          className="h-8 px-3 rounded-lg text-xs font-semibold bg-teal-800 text-white disabled:opacity-50"
                        >
                          {busyKey === row.key ? t('today.submitting') : t('today.submit')}
                        </button>
                      </td>
                    </>
                  )}
                  {mode === 'readonly' && (
                    <td className="p-3">
                      {row.proof?.id ? (
                        <button
                          type="button"
                          onClick={() => openProof(row.proof!.id)}
                          className="text-xs text-teal-800 underline"
                        >
                          {t('today.viewProof')}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  {mode === 'admin-review' && (
                    <td className="p-3 space-x-2 whitespace-nowrap">
                      {row.proof?.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => openProof(row.proof!.id)}
                            className="text-xs text-teal-800 underline"
                          >
                            {t('today.viewProof')}
                          </button>
                          {row.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                disabled={busyKey === row.proof.id}
                                onClick={() => review(row.proof!.id, true)}
                                className="h-7 px-2 rounded-md text-xs font-semibold bg-teal-800 text-white"
                              >
                                {t('today.approve')}
                              </button>
                              <button
                                type="button"
                                disabled={busyKey === row.proof.id}
                                onClick={() => review(row.proof!.id, false)}
                                className="h-7 px-2 rounded-md text-xs font-semibold border border-rose-200 text-rose-800"
                              >
                                {t('today.reject')}
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const allLeafKeys = useMemo(() => {
    return (day?.tree || []).flatMap((n: TreeNode) => collectLeaves(n));
  }, [day]);

  return (
    <RoleGate allow={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <AppShell>
        <div className="space-y-4 max-w-5xl">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl text-ink tracking-tight">{t('today.title')}</h1>
              <p className="text-sm text-ink-muted mt-1">
                {isManager ? t('today.managerHint') : t('today.adminHint')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="h-10 rounded-lg border border-teal-900/10 bg-white px-3 text-sm"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                {!branches.length && <option value="">{t('today.noBranch')}</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="h-10 rounded-lg border border-teal-900/10 bg-white px-3 text-sm"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-teal-950/[0.05]">
            {FREQ_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFreq(id);
                  setQ('');
                }}
                className={cn(
                  'rounded-lg py-2.5 text-sm font-semibold transition',
                  freq === id
                    ? id === 'DAILY'
                      ? 'bg-teal-800 text-white shadow-sm'
                      : id === 'WEEKLY'
                        ? 'bg-amber-700 text-white shadow-sm'
                        : 'bg-indigo-800 text-white shadow-sm'
                    : 'text-ink-muted hover:text-ink',
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

          <div
            className={cn(
              'rounded-2xl border p-3.5',
              freq === 'DAILY' && 'border-teal-200 bg-teal-50/60',
              freq === 'WEEKLY' && 'border-amber-200 bg-amber-50/50',
              freq === 'MONTHLY' && 'border-indigo-200 bg-indigo-50/50',
            )}
          >
            <div className="flex justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {freq === 'DAILY'
                    ? t('today.daily')
                    : freq === 'WEEKLY'
                      ? t('today.weekly')
                      : t('today.monthly')}
                </p>
                <p className="text-xs text-ink-muted mt-0.5 tabular-nums">
                  {periodFrom === periodTo ? periodFrom : `${periodFrom} — ${periodTo}`}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-3xl tabular-nums text-teal-900">
                  {day?.assignedCount ?? 0}
                </p>
                <p className="text-[11px] text-ink-muted">{t('today.assigned')}</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('today.search')}
              className="w-full h-10 rounded-xl border border-teal-900/10 bg-white pl-9 pr-3 text-sm"
            />
          </div>

          {loading && (
            <div className="rounded-xl border border-dashed border-teal-900/15 py-12 text-center text-ink-muted text-sm">
              {t('common.loading')}
            </div>
          )}

          {!loading && isManager && (
            <div className="space-y-5">
              {!day?.assignedCount ? (
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 py-10 text-center text-sm text-amber-950 px-4">
                  {t('today.noAssigned')}
                </div>
              ) : (
                <>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-ink">
                      {t('today.todo')} · {uniquePending.length}
                    </h2>
                    <TaskTable rows={uniquePending} mode="manager-todo" />
                  </section>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-ink">
                      {t('today.inReview')} · {inReview.length}
                    </h2>
                    <TaskTable rows={inReview} mode="readonly" />
                  </section>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-ink">
                      {t('today.doneList')} · {completed.length}
                    </h2>
                    <TaskTable rows={completed} mode="readonly" />
                  </section>
                </>
              )}
            </div>
          )}

          {!loading && isAdmin && (
            <div className="space-y-4">
              <div className="flex gap-1 p-1 rounded-xl bg-teal-950/[0.05] w-fit">
                <button
                  type="button"
                  onClick={() => setAdminTab('assign')}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-semibold',
                    adminTab === 'assign' ? 'bg-white text-teal-900 shadow-sm' : 'text-ink-muted',
                  )}
                >
                  {t('today.assignTitle')}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('results')}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-semibold',
                    adminTab === 'results' ? 'bg-white text-teal-900 shadow-sm' : 'text-ink-muted',
                  )}
                >
                  {t('today.results')}
                </button>
              </div>

              {adminTab === 'assign' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        allLeafKeys.forEach((k: string) => {
                          next[k] = true;
                        });
                        setAssignSel(next);
                      }}
                      className="h-9 px-3 rounded-lg text-sm font-medium bg-teal-800 text-white"
                    >
                      {t('today.assignAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignSel({})}
                      className="h-9 px-3 rounded-lg text-sm font-medium border border-teal-200 bg-white"
                    >
                      {t('today.assignNone')}
                    </button>
                    <button
                      type="button"
                      disabled={busyKey === 'assign'}
                      onClick={saveAssign}
                      className="h-9 px-3 rounded-lg text-sm font-semibold bg-ink text-white disabled:opacity-50"
                    >
                      {t('today.assignSave')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignOpen((v) => !v)}
                      className="h-9 px-3 rounded-lg text-sm text-ink-muted"
                    >
                      {assignOpen ? '−' : '+'}
                    </button>
                  </div>
                  {assignOpen &&
                    (day?.tree || []).map((n: TreeNode) => <AssignTree key={n.key} node={n} />)}
                </div>
              )}

              {adminTab === 'results' && (
                <div className="space-y-5">
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">
                      {t('today.inReview')} · {inReview.length}
                    </h2>
                    <TaskTable rows={inReview} mode="admin-review" />
                  </section>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">
                      {t('today.todo')} · {uniquePending.length}
                    </h2>
                    <TaskTable rows={uniquePending} mode="readonly" />
                  </section>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">
                      {t('today.doneList')} · {completed.length}
                    </h2>
                    <TaskTable rows={completed} mode="readonly" />
                  </section>
                </div>
              )}
            </div>
          )}

          {!loading && !branches.length && (
            <p className="text-center text-sm text-ink-muted py-8">{t('today.noBranchHint')}</p>
          )}
        </div>
      </AppShell>
    </RoleGate>
  );
}
