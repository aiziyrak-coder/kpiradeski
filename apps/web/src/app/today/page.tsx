'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { api, getToken } from '@/lib/api';
import { todayISO } from '@/types';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Check, Upload, X, Minus } from 'lucide-react';

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

export default function TodayPage() {
  const toast = useToast();
  const { lang, t } = useI18n();
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const canUploadProof = isManager;
  const canEdit = true;

  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState('');
  const [freq, setFreq] = useState<Freq>('DAILY');
  const [date, setDate] = useState(todayISO());
  const [day, setDay] = useState<any>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [loading, setLoading] = useState(true);

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
  const tree: TreeNode[] = day?.tree || [];

  const totals = useMemo(() => {
    return tree.reduce(
      (acc, n) => {
        const x = countLeaves(n);
        return { done: acc.done + x.done, total: acc.total + x.total };
      },
      { done: 0, total: 0 },
    );
  }, [tree]);

  const allLeafKeys = useMemo(() => tree.flatMap(collectLeafKeys), [tree]);

  async function toggleDone(node: TreeNode) {
    if (!canEdit || busyKey || bulkBusy) return;
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

  async function setGroupDone(node: TreeNode, done: boolean) {
    if (!canEdit || bulkBusy) return;
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
    if (!canEdit || bulkBusy || !allLeafKeys.length) return;
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
      if (!res.ok) throw new Error(data.message || 'Xato');
      if (data.aiStatus === 'REJECTED') toast.error(data.aiNote || 'Rad');
      else toast.success(data.aiNote || 'OK');
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
        aria-label={all ? t('today.uncheckGroup') : t('today.checkGroup')}
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

    return (
      <div
        className={cn(
          'flex items-center gap-3 px-3 sm:px-4 py-2.5 border-t border-teal-900/[0.06]',
          node.done && 'bg-teal-50/50',
        )}
        style={{ paddingLeft: 12 + depth * 14 }}
      >
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

        <div className="flex-1 min-w-0">
          <p className={cn('text-sm leading-snug', node.done && 'text-teal-900')}>
            {title(node)}
          </p>
          {rejected && node.aiNote && (
            <p className="text-[11px] text-rose-600 mt-0.5 truncate">{node.aiNote}</p>
          )}
        </div>

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
    const pct = leaf.total ? Math.round((leaf.done / leaf.total) * 100) : 0;

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
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-sm tabular-nums font-medium text-teal-900 w-10 text-right">
                {pct}%
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
                onClick={() => setFreq(id)}
                className={cn(
                  'rounded-lg py-2 text-sm font-medium transition',
                  freq === id
                    ? 'bg-white text-teal-950 shadow-sm'
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

          {!!tree.length && (
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
            {!loading &&
              tree.map((n) => <SectionCard key={n.key} node={n} />)}
            {!loading && !tree.length && (
              <div className="rounded-xl border border-dashed border-teal-900/15 py-12 text-center text-ink-muted text-sm space-y-2 px-4">
                <p>{branches.length ? t('today.emptyTasks') : t('today.noBranchHint')}</p>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </RoleGate>
  );
}
