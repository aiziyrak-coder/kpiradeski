'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { api, getToken } from '@/lib/api';
import { todayISO } from '@/types';
import { cn } from '@/lib/utils';
import { Building2, ChevronDown, ChevronRight, Upload } from 'lucide-react';

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

export default function TodayPage() {
  const toast = useToast();
  const { lang } = useI18n();
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState('');
  const [freq, setFreq] = useState<Freq>('DAILY');
  const [date, setDate] = useState(todayISO());
  const [day, setDay] = useState<any>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

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
    // auto-expand roots
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

  async function toggleDone(node: TreeNode) {
    if (busy) return;
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function uploadProof(nodeKey: string, file: File) {
    setBusy(true);
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
      setBusy(false);
    }
  }

  function renderRows(nodes: TreeNode[], depth = 0): React.ReactNode[] {
    const rows: React.ReactNode[] = [];
    for (const n of nodes) {
      const hasKids = n.children?.length > 0;
      const isOpen = hasKids ? open[n.key] !== false : false;
      rows.push(
        <tr
          key={n.key}
          className={cn(
            'border-b border-black/5',
            n.done && 'bg-emerald-50/40',
            depth === 0 && 'bg-white',
          )}
        >
          <td className="py-2.5 pr-2 w-10">
            <input
              type="checkbox"
              className="w-4 h-4 accent-teal-800"
              checked={!!n.done}
              disabled={busy}
              onChange={() => toggleDone(n)}
            />
          </td>
          <td className="py-2.5">
            <div className="flex items-center gap-1" style={{ paddingLeft: depth * 16 }}>
              {hasKids ? (
                <button
                  type="button"
                  className="p-0.5 text-ink-muted"
                  onClick={() => setOpen((o) => ({ ...o, [n.key]: !isOpen }))}
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <span
                className={cn(
                  'text-sm',
                  depth === 0 && 'font-semibold text-ink',
                  depth === 1 && 'font-medium text-ink',
                  depth > 1 && 'text-ink-soft',
                )}
              >
                {title(n)}
              </span>
            </div>
          </td>
          <td className="py-2.5 text-right text-sm tabular-nums text-teal-800 w-16">
            {n.score != null ? `${n.score}%` : ''}
          </td>
          <td className="py-2.5 w-28">
            {n.proofRequired && (
              <label className="inline-flex items-center gap-1 text-xs text-teal-800 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {n.aiStatus === 'REJECTED' ? 'Qayta' : n.aiStatus === 'APPROVED' ? '✓' : 'Dalil'}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadProof(n.key, f);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            {n.aiStatus === 'REJECTED' && n.aiNote && (
              <p className="text-[10px] text-rose-600 mt-0.5 line-clamp-1">{n.aiNote}</p>
            )}
          </td>
        </tr>,
      );
      if (hasKids && isOpen) {
        rows.push(...renderRows(n.children, depth + 1));
      }
    }
    return rows;
  }

  const tree: TreeNode[] = day?.tree || [];

  return (
    <RoleGate allow={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <AppShell>
        <div className="max-w-4xl mx-auto space-y-4 pb-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl text-ink">Ishlar</h1>
              <p className="text-sm tabular-nums text-ink-muted">
                {day?.totalScore != null ? `${day.totalScore}%` : '—'}
                {day?.completion
                  ? ` · ${day.completion.requiredFilled}/${day.completion.requiredTotal}`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
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
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {!branches.length && (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Building2 className="w-4 h-4" /> Filial yoʻq
            </div>
          )}

          <div className="flex gap-1 p-1 rounded-2xl bg-black/[0.04]">
            {FREQ_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFreq(t.id)}
                className={cn(
                  'flex-1 rounded-xl py-2 text-sm font-medium transition',
                  freq === t.id ? 'bg-white text-teal-900 shadow-sm' : 'text-ink-muted',
                )}
              >
                {lang === 'ru' ? t.ru : t.uz}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-black/8 bg-white overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-black/8 text-xs uppercase tracking-wide text-ink-muted">
                  <th className="py-2.5 px-3 w-10" />
                  <th className="py-2.5 px-1">Boʻlim / ish</th>
                  <th className="py-2.5 px-2 text-right w-16">%</th>
                  <th className="py-2.5 px-3 w-28">Dalil</th>
                </tr>
              </thead>
              <tbody className="px-2">{renderRows(tree)}</tbody>
            </table>
            {!tree.length && (
              <p className="text-sm text-ink-muted text-center py-8">—</p>
            )}
          </div>
        </div>
      </AppShell>
    </RoleGate>
  );
}
