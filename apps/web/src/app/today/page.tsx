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
import {
  ChevronDown,
  ChevronRight,
  Check,
  Upload,
  X,
  Minus,
  Search,
} from 'lucide-react';

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

type TreeNode = {
  key: string;
  titleUz: string;
  titleRu: string;
  inputType: string;
  proofRequired: boolean;
  done: boolean;
  score: number | null;
  value: any;
  aiStatus: string | null;
  aiNote: string | null;
  children: TreeNode[];
};

const FREQ_IDS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

function countLeaves(n: TreeNode): { done: number; total: number } {
  if (!n.children?.length) {
    return { done: n.done ? 1 : 0, total: 1 };
  }
  return n.children.reduce(
    (acc, c) => {
      const x = countLeaves(c);
      return { done: acc.done + x.done, total: acc.total + x.total };
    },
    { done: 0, total: 0 },
  );
}

function collectLeafKeys(n: TreeNode): string[] {
  if (!n.children?.length) {
    return n.inputType === 'GROUP' ? [] : [n.key];
  }
  return n.children.flatMap(collectLeafKeys);
}

function filterTree(nodes: TreeNode[], q: string, lang: string): TreeNode[] {
  if (!q.trim()) return nodes;
  const s = q.toLowerCase();
  const match = (n: TreeNode) => {
    const t = (lang === 'ru' ? n.titleRu : n.titleUz).toLowerCase();
    return t.includes(s);
  };
  const walk = (n: TreeNode): TreeNode | null => {
    const kids = (n.children || []).map(walk).filter(Boolean) as TreeNode[];
    if (match(n) || kids.length) return { ...n, children: kids };
    return null;
  };
  return nodes.map(walk).filter(Boolean) as TreeNode[];
}

function monthEndISO(from: string) {
  const [y, m] = from.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export default function TodayPage() {
  const toast = useToast();
  const { lang, t } = useI18n();
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const canUploadProof = isManager;

  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState('');
  const [freq, setFreq] = useState<Freq>('DAILY');
  const [date, setDate] = useState(todayISO());
  const [day, setDay] = useState<any>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

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
      const init: Record<string, boolean> = {};
      for (const n of d.tree || []) init[n.key] = true;
      setOpen((o) => ({ ...init, ...o }));
    } finally {
      setLoading(false);
    }
  }, [branchId, date, freq]);

  useEffect(() => {
    loadBranches().catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    loadDay().catch((e) => toast.error(e.message));
  }, [branchId, freq, date]);

  const title = (n: TreeNode) => (lang === 'ru' ? n.titleRu : n.titleUz);
  const rawTree: TreeNode[] = day?.tree || [];
  const tree = useMemo(() => filterTree(rawTree, q, lang), [rawTree, q, lang]);

  const totals = useMemo(() => {
    return rawTree.reduce(
      (acc, n) => {
        const x = countLeaves(n);
        return { done: acc.done + x.done, total: acc.total + x.total };
      },
      { done: 0, total: 0 },
    );
  }, [rawTree]);

  const allLeafKeys = useMemo(() => rawTree.flatMap(collectLeafKeys), [rawTree]);
  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

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

  const freqHint =
    freq === 'DAILY'
      ? t('today.hintDaily')
      : freq === 'WEEKLY'
        ? t('today.hintWeekly')
        : t('today.hintMonthly');

  async function toggleDone(node: TreeNode) {
    if (busyKey || bulkBusy) return;
    if (node.inputType === 'RATIO' || node.inputType === 'NUMBER') return;
    setBusyKey(node.key);
    try {
      const next = !node.done;
      const value =
        node.inputType === 'CHECKBOX' || node.inputType === 'GROUP'
          ? next
          : node.inputType === 'NOTE_CHECK'
            ? { ...(node.value || {}), checked: next }
            : node.value ?? next;
      await api('/manager-kpi/entry', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          date,
          nodeKey: node.key,
          value,
          done: next,
        }),
      });
      await loadDay();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function saveValue(node: TreeNode, value: any, done: boolean) {
    if (busyKey || bulkBusy) return;
    setBusyKey(node.key);
    try {
      await api('/manager-kpi/entry', {
        method: 'POST',
        body: JSON.stringify({ branchId, date, nodeKey: node.key, value, done }),
      });
      await loadDay();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function setGroupDone(node: TreeNode, done: boolean) {
    if (bulkBusy) return;
    const keys = collectLeafKeys(node);
    if (!keys.length) return;
    setBulkBusy(true);
    try {
      await api('/manager-kpi/entry-bulk', {
        method: 'POST',
        body: JSON.stringify({ branchId, date, nodeKeys: keys, done }),
      });
      await loadDay();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function setAllDone(done: boolean) {
    if (bulkBusy || !allLeafKeys.length) return;
    setBulkBusy(true);
    try {
      await api('/manager-kpi/entry-bulk', {
        method: 'POST',
        body: JSON.stringify({ branchId, date, nodeKeys: allLeafKeys, done }),
      });
      await loadDay();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function uploadProof(nodeKey: string, file: File) {
    if (!canUploadProof) return;
    setBusyKey(nodeKey);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('branchId', branchId);
      fd.append('nodeKey', nodeKey);
      fd.append('date', date);
      const token = getToken();
      const res = await fetch('/api/manager-kpi/proof', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t('common.error'));
      if (data.aiStatus === 'REJECTED') toast.error(data.aiNote || t('today.rejected'));
      else toast.success(data.aiNote || t('common.ok'));
      await loadDay();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyKey(null);
    }
  }

  function GroupCheck({
    done,
    total,
    onToggle,
  }: {
    done: number;
    total: number;
    onToggle: (next: boolean) => void;
  }) {
    const all = total > 0 && done === total;
    const some = done > 0 && done < total;
    return (
      <button
        type="button"
        disabled={bulkBusy || !total}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(!all);
        }}
        className={cn(
          'shrink-0 w-5 h-5 rounded-md border-2 grid place-items-center transition',
          all && 'bg-teal-800 border-teal-800 text-white',
          some && 'bg-teal-100 border-teal-700 text-teal-800',
          !all && !some && 'border-teal-800/25 bg-white hover:border-teal-700',
        )}
        title={all ? t('today.uncheckGroup') : t('today.checkGroup')}
      >
        {all ? (
          <Check className="w-3 h-3" strokeWidth={3} />
        ) : some ? (
          <Minus className="w-3 h-3" strokeWidth={3} />
        ) : null}
      </button>
    );
  }

  function LeafRow({ node, depth }: { node: TreeNode; depth: number }) {
    const showProof = canUploadProof && node.proofRequired && node.inputType !== 'GROUP';
    const rejected = node.aiStatus === 'REJECTED';
    const approved = node.aiStatus === 'APPROVED';
    const isRatio = node.inputType === 'RATIO';
    const isNumber = node.inputType === 'NUMBER';
    const calls = Number(node.value?.calls ?? node.value?.a ?? 0);
    const booked = Number(node.value?.booked ?? node.value?.b ?? 0);
    const count = Number(node.value?.count ?? (typeof node.value === 'number' ? node.value : 0));

    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-t border-teal-900/[0.06]',
          node.done && 'bg-teal-50/50',
        )}
        style={{ paddingLeft: 12 + depth * 14 }}
      >
        {!isRatio && !isNumber ? (
          <button
            type="button"
            disabled={!!busyKey || bulkBusy}
            onClick={() => toggleDone(node)}
            className={cn(
              'shrink-0 w-5 h-5 rounded-md border-2 grid place-items-center transition',
              node.done
                ? 'bg-teal-800 border-teal-800 text-white'
                : 'border-teal-800/25 bg-white hover:border-teal-700',
            )}
            aria-label={t('today.mark')}
          >
            {node.done && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
        ) : (
          <span
            className={cn(
              'shrink-0 w-5 h-5 rounded-md border-2 grid place-items-center text-[10px] font-bold',
              node.done
                ? 'bg-teal-800 border-teal-800 text-white'
                : 'border-teal-800/25 text-ink-muted',
            )}
          >
            {isRatio ? '%' : '#'}
          </span>
        )}

        <div className="flex-1 min-w-[10rem]">
          <p className={cn('text-sm leading-snug', node.done && 'text-teal-900')}>
            {title(node)}
          </p>
          {rejected && node.aiNote && (
            <p className="text-[11px] text-rose-600 mt-0.5 truncate">{node.aiNote}</p>
          )}
        </div>

        {isRatio && (
          <div className="flex items-center gap-1.5">
            <input
              key={`c-${node.key}-${calls}`}
              type="number"
              min={0}
              placeholder={t('today.calls')}
              defaultValue={calls || ''}
              className="w-16 h-8 rounded-lg border border-teal-200 px-2 text-sm"
              onBlur={(e) => {
                const c = Number(e.target.value) || 0;
                const bEl = (e.target.parentElement?.querySelector(
                  'input[data-booked]',
                ) as HTMLInputElement) || null;
                const b = bEl ? Number(bEl.value) || 0 : booked;
                saveValue(node, { calls: c, booked: b }, c > 0);
              }}
            />
            <span className="text-ink-muted text-xs">/</span>
            <input
              key={`b-${node.key}-${booked}`}
              data-booked
              type="number"
              min={0}
              placeholder={t('today.booked')}
              defaultValue={booked || ''}
              className="w-16 h-8 rounded-lg border border-teal-200 px-2 text-sm"
              onBlur={(e) => {
                const b = Number(e.target.value) || 0;
                const cEl = (e.target.parentElement?.querySelector(
                  'input:not([data-booked])',
                ) as HTMLInputElement) || null;
                const c = cEl ? Number(cEl.value) || 0 : calls;
                saveValue(node, { calls: c, booked: b }, c > 0);
              }}
            />
          </div>
        )}

        {isNumber && (
          <input
            type="number"
            min={0}
            placeholder={t('today.count')}
            defaultValue={count || ''}
            className="w-20 h-8 rounded-lg border border-teal-200 px-2 text-sm"
            onBlur={(e) => {
              const n = Number(e.target.value) || 0;
              saveValue(node, { count: n }, n > 0);
            }}
          />
        )}

        {showProof && (
          <label
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer border transition',
              approved && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              rejected && 'border-rose-200 bg-rose-50 text-rose-800',
              !approved && !rejected && 'border-teal-200 bg-white text-teal-900 hover:bg-teal-50',
              busyKey === node.key && 'opacity-50 pointer-events-none',
            )}
          >
            {approved ? (
              <Check className="w-3.5 h-3.5" />
            ) : rejected ? (
              <X className="w-3.5 h-3.5" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {approved ? t('common.ok') : rejected ? t('common.retry') : t('common.proof')}
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadProof(node.key, f);
                e.target.value = '';
              }}
            />
          </label>
        )}

        {!canUploadProof && node.proofRequired && node.inputType !== 'GROUP' && (
          <span
            className={cn(
              'shrink-0 text-[11px] font-medium px-2 py-1 rounded-md',
              approved && 'bg-emerald-50 text-emerald-800',
              rejected && 'bg-rose-50 text-rose-700',
              !approved && !rejected && 'bg-black/[0.04] text-ink-muted',
            )}
          >
            {approved
              ? t('today.proofOk')
              : rejected
                ? t('today.rejected')
                : t('common.none')}
          </span>
        )}
      </div>
    );
  }

  function SectionCard({ node }: { node: TreeNode }) {
    const hasKids = !!node.children?.length;
    const isOpen = open[node.key] !== false;
    const leaf = countLeaves(node);
    const p = leaf.total ? Math.round((leaf.done / leaf.total) * 100) : 0;

    if (!hasKids) {
      return (
        <div className="rounded-xl border border-teal-900/10 bg-white overflow-hidden shadow-sm">
          <LeafRow node={node} depth={0} />
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-teal-900/10 bg-white overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-3 sm:px-4 py-3 bg-teal-950/[0.03] hover:bg-teal-950/[0.05] transition">
          <GroupCheck
            done={leaf.done}
            total={leaf.total}
            onToggle={(next) => setGroupDone(node, next)}
          />
          <button
            type="button"
            className="flex-1 flex items-center gap-3 text-left min-w-0"
            onClick={() => setOpen((o) => ({ ...o, [node.key]: !isOpen }))}
          >
            <span className="text-teal-800/70 shrink-0">
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink text-[15px] tracking-tight">{title(node)}</p>
              <p className="text-xs text-ink-muted mt-0.5 tabular-nums">
                {leaf.done}/{leaf.total}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <div className="w-16 h-1.5 rounded-full bg-black/[0.06] overflow-hidden hidden sm:block">
                <div
                  className="h-full rounded-full bg-teal-700 transition-all"
                  style={{ width: `${p}%` }}
                />
              </div>
              <span className="text-sm tabular-nums font-medium text-teal-900 w-10 text-right">
                {p}%
              </span>
            </div>
          </button>
        </div>

        {isOpen && (
          <div>
            {node.children.map((child) =>
              child.children?.length ? (
                <NestedGroup key={child.key} node={child} depth={1} />
              ) : (
                <LeafRow key={child.key} node={child} depth={1} />
              ),
            )}
          </div>
        )}
      </div>
    );
  }

  function NestedGroup({ node, depth }: { node: TreeNode; depth: number }) {
    const isOpen = open[node.key] !== false;
    const leaf = countLeaves(node);

    return (
      <div className="border-t border-teal-900/[0.06]">
        <div
          className="flex items-center gap-2 py-2.5 hover:bg-black/[0.02]"
          style={{ paddingLeft: 12 + depth * 14, paddingRight: 12 }}
        >
          <GroupCheck
            done={leaf.done}
            total={leaf.total}
            onToggle={(next) => setGroupDone(node, next)}
          />
          <button
            type="button"
            className="flex-1 flex items-center gap-2 text-left min-w-0"
            onClick={() => setOpen((o) => ({ ...o, [node.key]: !isOpen }))}
          >
            {isOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            )}
            <span className="flex-1 text-sm font-medium text-ink">{title(node)}</span>
            <span className="text-xs tabular-nums text-ink-muted">
              {leaf.done}/{leaf.total}
            </span>
          </button>
        </div>
        {isOpen &&
          node.children.map((c) =>
            c.children?.length ? (
              <NestedGroup key={c.key} node={c} depth={depth + 1} />
            ) : (
              <LeafRow key={c.key} node={c} depth={depth + 1} />
            ),
          )}
      </div>
    );
  }

  return (
    <RoleGate allow={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <AppShell>
        <div className="max-w-2xl mx-auto space-y-4 pb-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">
                {t('today.title')}
              </h1>
              <p className="text-sm tabular-nums text-ink-muted mt-0.5">
                {totals.done}/{totals.total}
                {day?.totalScore != null ? ` · ${day.totalScore}%` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="h-10 rounded-lg border border-teal-900/10 bg-white px-3 text-sm min-w-[10rem]"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={!branches.length}
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
              'rounded-2xl border p-4',
              freq === 'DAILY' && 'border-teal-200 bg-teal-50/60',
              freq === 'WEEKLY' && 'border-amber-200 bg-amber-50/60',
              freq === 'MONTHLY' && 'border-indigo-200 bg-indigo-50/60',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
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
                <p className="font-display text-3xl tabular-nums text-teal-900">{pct}%</p>
                <p className="text-[11px] text-ink-muted">
                  {totals.done}/{totals.total}
                </p>
              </div>
            </div>
            <p className="text-xs text-ink-soft mt-2 leading-relaxed">{freqHint}</p>
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

          {!!rawTree.length && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setAllDone(true)}
                className="h-9 px-3 rounded-lg text-sm font-medium bg-teal-800 text-white hover:bg-teal-900 disabled:opacity-50"
              >
                {t('today.checkAll')}
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setAllDone(false)}
                className="h-9 px-3 rounded-lg text-sm font-medium border border-teal-200 bg-white text-teal-900 hover:bg-teal-50 disabled:opacity-50"
              >
                {t('today.uncheckAll')}
              </button>
            </div>
          )}

          <div className="space-y-2.5">
            {loading && (
              <div className="rounded-xl border border-dashed border-teal-900/15 py-12 text-center text-ink-muted text-sm">
                {t('common.loading')}
              </div>
            )}
            {!loading && tree.map((n) => <SectionCard key={n.key} node={n} />)}
            {!loading && !tree.length && (
              <div className="rounded-xl border border-dashed border-teal-900/15 py-12 text-center text-ink-muted text-sm space-y-2 px-4">
                <p>
                  {branches.length
                    ? q
                      ? t('today.noSearch')
                      : t('today.emptyTasks')
                    : t('today.noBranchHint')}
                </p>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </RoleGate>
  );
}
