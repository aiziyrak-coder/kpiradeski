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
import { ChevronDown, ChevronRight, Check, Upload, X } from 'lucide-react';

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

const FREQ_TABS: { id: Freq; uz: string; ru: string }[] = [
  { id: 'DAILY', uz: 'Kunlik', ru: 'День' },
  { id: 'WEEKLY', uz: 'Haftalik', ru: 'Неделя' },
  { id: 'MONTHLY', uz: 'Oylik', ru: 'Месяц' },
];

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

export default function TodayPage() {
  const toast = useToast();
  const { lang } = useI18n();
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

  const loadBranches = useCallback(async () => {
    const list = await api<any[]>('/branches/mine');
    setBranches(list.filter((b) => b.active !== false));
    if (!branchId && list[0]) setBranchId(list[0].id);
  }, [branchId]);

  const loadDay = useCallback(async () => {
    if (!branchId) return;
    const d = await api(
      `/manager-kpi/day?branchId=${branchId}&date=${date}&frequency=${freq}`,
    );
    setDay(d);
    const init: Record<string, boolean> = {};
    for (const n of d.tree || []) init[n.key] = true;
    setOpen((o) => ({ ...init, ...o }));
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

  async function toggleDone(node: TreeNode) {
    if (busyKey) return;
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
          disabled={!!busyKey}
          onClick={() => toggleDone(node)}
          className={cn(
            'shrink-0 w-5 h-5 rounded-md border-2 grid place-items-center transition',
            node.done
              ? 'bg-teal-800 border-teal-800 text-white'
              : 'border-teal-800/25 bg-white hover:border-teal-700',
          )}
          aria-label="belgilash"
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
            {approved ? 'OK' : rejected ? 'Qayta' : 'Dalil'}
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
            {approved ? 'Dalil ✓' : rejected ? 'Rad' : '—'}
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
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left bg-teal-950/[0.03] hover:bg-teal-950/[0.05] transition"
          onClick={() => setOpen((o) => ({ ...o, [node.key]: !isOpen }))}
        >
          <span className="text-teal-800/70">
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
        <button
          type="button"
          className="w-full flex items-center gap-2 py-2.5 text-left hover:bg-black/[0.02]"
          style={{ paddingLeft: 12 + depth * 14, paddingRight: 12 }}
          onClick={() => setOpen((o) => ({ ...o, [node.key]: !isOpen }))}
        >
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-ink-muted" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-ink-muted" />
          )}
          <span className="flex-1 text-sm font-medium text-ink">{title(node)}</span>
          <span className="text-xs tabular-nums text-ink-muted">
            {leaf.done}/{leaf.total}
          </span>
        </button>
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
              <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">Ishlar</h1>
              <p className="text-sm tabular-nums text-ink-muted mt-0.5">
                {totals.done}/{totals.total}
                {day?.totalScore != null ? ` · ${day.totalScore}%` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="h-10 rounded-lg border border-teal-900/10 bg-white px-3 text-sm"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
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
            {FREQ_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFreq(t.id)}
                className={cn(
                  'rounded-lg py-2 text-sm font-medium transition',
                  freq === t.id
                    ? 'bg-white text-teal-950 shadow-sm'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {lang === 'ru' ? t.ru : t.uz}
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            {tree.map((n) => (
              <SectionCard key={n.key} node={n} />
            ))}
            {!tree.length && (
              <div className="rounded-xl border border-dashed border-teal-900/15 py-12 text-center text-ink-muted text-sm">
                —
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </RoleGate>
  );
}
