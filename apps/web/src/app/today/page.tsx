'use client';

import { useCallback, useEffect, useMemo, useState, Fragment, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { api, getToken } from '@/lib/api';
import { todayISO, weekStartISO } from '@/types';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, ChevronRight, MessageSquare, Search, Upload, X } from 'lucide-react';

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type TaskRow = {
  key: string;
  titleUz: string;
  titleRu: string;
  sectionUz?: string;
  sectionRu?: string;
  inputType: string;
  proofRequired: boolean;
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

type CatalogParent = {
  key: string;
  titleUz: string;
  titleRu: string;
  pathUz?: string;
  pathRu?: string;
  subs: {
    key: string;
    titleUz: string;
    titleRu: string;
    pathUz?: string;
    pathRu?: string;
  }[];
};

const FREQ_IDS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

const DEPTH_UI = [
  {
    wrap: 'border-teal-200',
    headClosed: 'bg-teal-50 text-teal-950',
    headOpen: 'bg-teal-100 text-teal-950',
    body: 'bg-white/80 border-t border-teal-100',
    badge: 'bg-teal-200/80 text-teal-900',
    checkOn: 'bg-teal-700 border-teal-700 text-white',
    checkOff: 'border-teal-400 bg-white',
  },
  {
    wrap: 'border-amber-200',
    headClosed: 'bg-amber-50 text-amber-950',
    headOpen: 'bg-amber-100 text-amber-950',
    body: 'bg-amber-50/40 border-t border-amber-100',
    badge: 'bg-amber-200/80 text-amber-900',
    checkOn: 'bg-amber-700 border-amber-700 text-white',
    checkOff: 'border-amber-400 bg-white',
  },
  {
    wrap: 'border-violet-200',
    headClosed: 'bg-violet-50 text-violet-950',
    headOpen: 'bg-violet-100 text-violet-950',
    body: 'bg-violet-50/40 border-t border-violet-100',
    badge: 'bg-violet-200/80 text-violet-900',
    checkOn: 'bg-violet-700 border-violet-700 text-white',
    checkOff: 'border-violet-400 bg-white',
  },
  {
    wrap: 'border-sky-200',
    headClosed: 'bg-sky-50 text-sky-950',
    headOpen: 'bg-sky-100 text-sky-950',
    body: 'bg-sky-50/40 border-t border-sky-100',
    badge: 'bg-sky-200/80 text-sky-900',
    checkOn: 'bg-sky-700 border-sky-700 text-white',
    checkOff: 'border-sky-400 bg-white',
  },
  {
    wrap: 'border-lime-200',
    headClosed: 'bg-lime-50 text-lime-950',
    headOpen: 'bg-lime-100 text-lime-950',
    body: 'bg-lime-50/40 border-t border-lime-100',
    badge: 'bg-lime-200/80 text-lime-900',
    checkOn: 'bg-lime-700 border-lime-700 text-white',
    checkOff: 'border-lime-400 bg-white',
  },
] as const;

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
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandKey, setExpandKey] = useState<string | null>(null);
  const [assignSel, setAssignSel] = useState<Record<string, boolean>>({});
  const [assignOpen, setAssignOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState<Record<string, boolean>>({});
  const [adminTab, setAdminTab] = useState<'assign' | 'results'>('assign');
  const [showAddTask, setShowAddTask] = useState(false);
  const [catalogParents, setCatalogParents] = useState<CatalogParent[]>([]);
  const [newTask, setNewTask] = useState({
    titleUz: '',
    titleRu: '',
    descriptionUz: '',
    categoryKey: '',
    subKey: '',
    proofRequired: false,
  });

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

  const loadParents = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const list = await api<CatalogParent[]>(
        `/manager-kpi/catalog-parents?frequency=${freq}`,
      );
      setCatalogParents(list || []);
      setNewTask((s) => ({
        ...s,
        categoryKey: list?.[0]?.key || '',
        subKey: '',
      }));
    } catch {
      setCatalogParents([]);
    }
  }, [freq, isAdmin]);

  useEffect(() => {
    loadParents();
  }, [loadParents]);

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
    const note = (notes[row.key] || '').trim();
    const file = files[row.key];
    if (!note && !file) {
      toast.error(t('today.needNoteOrFile'));
      return;
    }

    if (file) {
      setBusyKey(row.key);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('branchId', branchId);
        fd.append('nodeKey', row.key);
        fd.append('date', date);
        const val = draft[row.key] || {};
        const parsed =
          row.inputType === 'NUMBER'
            ? { count: Number(val.count) || 0, note }
            : row.inputType === 'RATIO'
              ? {
                  calls: Number(val.calls) || 0,
                  booked: Number(val.booked) || 0,
                  note,
                }
              : { ...val, note };
        fd.append('value', JSON.stringify(parsed));
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
        setNotes((n) => ({ ...n, [row.key]: '' }));
        setExpandKey(null);
        await loadDay();
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setBusyKey(null);
      }
      return;
    }

    setBusyKey(row.key);
    try {
      const raw = draft[row.key];
      let value: any = { note };
      if (row.inputType === 'NUMBER') {
        value = { count: Number(raw?.count) || 0, note };
      } else if (row.inputType === 'RATIO') {
        value = {
          calls: Number(raw?.calls) || 0,
          booked: Number(raw?.booked) || 0,
          note,
        };
      } else if (raw != null && typeof raw === 'object') {
        value = { ...raw, note };
      }
      await api('/manager-kpi/complete', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          date,
          nodeKey: row.key,
          value,
        }),
      });
      toast.success(t('today.markedDone'));
      setNotes((n) => ({ ...n, [row.key]: '' }));
      setExpandKey(null);
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
      setAdminTab('assign');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function createTask() {
    if (!newTask.titleUz.trim()) {
      toast.error(t('today.taskName'));
      return;
    }
    if (!newTask.categoryKey) {
      toast.error(t('today.pickCategory'));
      return;
    }
    const parentKey = newTask.subKey || newTask.categoryKey;
    setBusyKey('create-task');
    try {
      const res = await api<{ ok: boolean; node: { key: string } }>('/manager-kpi/catalog-task', {
        method: 'POST',
        body: JSON.stringify({
          titleUz: newTask.titleUz.trim(),
          titleRu: newTask.titleRu.trim() || undefined,
          descriptionUz: newTask.descriptionUz.trim() || undefined,
          frequency: freq,
          parentKey,
          proofRequired: newTask.proofRequired,
        }),
      });
      toast.success(t('today.taskAdded'));
      setNewTask((s) => ({
        ...s,
        titleUz: '',
        titleRu: '',
        descriptionUz: '',
        proofRequired: false,
      }));
      setShowAddTask(false);
      await loadDay();
      await loadParents();
      if (res?.node?.key) {
        setAssignSel((s) => ({ ...s, [res.node.key]: true }));
      }
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

  const renderAssignTree = (node: TreeNode, depth = 0): ReactNode => {
    const hasKids = !!node.children?.length;
    const open = treeOpen[node.key] ?? depth < 1;
    const leafKeys = hasKids ? collectLeaves(node) : [];
    const selectedCount = leafKeys.filter((k) => assignSel[k]).length;
    const allSel = leafKeys.length > 0 && selectedCount === leafKeys.length;
    const title = lang === 'ru' ? node.titleRu : node.titleUz;
    const depthStyle = DEPTH_UI[Math.min(depth, DEPTH_UI.length - 1)];

    if (!hasKids && node.inputType === 'GROUP') return null;

    if (!hasKids) {
      return (
        <label
          key={node.key}
          className="flex items-center gap-3 px-3 py-2.5 border-t border-black/[0.04] cursor-pointer hover:bg-white/70"
          style={{ paddingLeft: 12 + depth * 10 }}
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
      <div
        key={node.key}
        className={cn('rounded-xl overflow-hidden mb-2 border', depthStyle.wrap)}
        style={{ marginLeft: depth > 0 ? 10 : 0 }}
      >
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2.5',
            open ? depthStyle.headOpen : depthStyle.headClosed,
          )}
        >
          <button
            type="button"
            onClick={() => setTreeOpen((o) => ({ ...o, [node.key]: !open }))}
            className="p-0.5 rounded hover:bg-black/5"
            title={open ? 'Yopish' : 'Ochish'}
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
              'w-5 h-5 rounded-md border-2 grid place-items-center shrink-0',
              allSel ? depthStyle.checkOn : depthStyle.checkOff,
            )}
          >
            {allSel && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
          <span className="text-sm font-semibold flex-1">{title}</span>
          <span
            className={cn(
              'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
              depthStyle.badge,
            )}
          >
            {open ? t('today.opened') : t('today.closed')}
          </span>
          <span className="text-xs tabular-nums opacity-70">
            {selectedCount}/{leafKeys.length}
          </span>
        </div>
        {open && (
          <div className={cn(depthStyle.body)}>
            {node.children.map((c) => renderAssignTree(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderTaskTable = (
    rows: TaskRow[],
    mode: 'manager-todo' | 'readonly' | 'admin-review',
  ) => {
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
                  <th className="p-3 font-medium">{t('today.noteOrFile')}</th>
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
                    {row.proofRequired && (
                      <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                        {t('today.needsProof')}
                      </span>
                    )}
                    {row.aiNote && (
                      <p className="text-xs text-ink-muted mt-1 leading-snug">{row.aiNote}</p>
                    )}
                    {row.inputType === 'RATIO' && mode === 'manager-todo' && (
                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={t('today.calls')}
                          className="w-20 h-8 rounded-lg border border-teal-200 px-2"
                          value={draft[row.key]?.calls ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d]/g, '');
                            setDraft((d) => ({
                              ...d,
                              [row.key]: {
                                ...(d[row.key] || {}),
                                calls: v,
                                booked: d[row.key]?.booked ?? '',
                              },
                            }));
                          }}
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={t('today.booked')}
                          className="w-20 h-8 rounded-lg border border-teal-200 px-2"
                          value={draft[row.key]?.booked ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d]/g, '');
                            setDraft((d) => ({
                              ...d,
                              [row.key]: {
                                ...(d[row.key] || {}),
                                booked: v,
                                calls: d[row.key]?.calls ?? '',
                              },
                            }));
                          }}
                        />
                      </div>
                    )}
                    {row.inputType === 'NUMBER' && mode === 'manager-todo' && (
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={t('today.count')}
                        className="mt-2 w-28 h-8 rounded-lg border border-teal-200 px-2"
                        value={draft[row.key]?.count ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d]/g, '');
                          setDraft((d) => ({
                            ...d,
                            [row.key]: { count: v },
                          }));
                        }}
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
                      <td className="p-3 min-w-[200px]">
                        <textarea
                          className="w-full min-h-[56px] rounded-lg border border-teal-200 bg-white px-2 py-1.5 text-xs"
                          placeholder={t('today.notePlaceholder')}
                          value={notes[row.key] || ''}
                          onChange={(e) =>
                            setNotes((n) => ({ ...n, [row.key]: e.target.value }))
                          }
                        />
                        <label className="mt-2 inline-flex items-center gap-1.5 text-xs text-teal-800 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[140px]">
                            {files[row.key]?.name || t('today.pickFile')}
                          </span>
                          <input
                            type="file"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                            className="hidden"
                            onChange={(e) =>
                              setFiles((f) => ({
                                ...f,
                                [row.key]: e.target.files?.[0] || null,
                              }))
                            }
                          />
                        </label>
                        <p className="text-[10px] text-ink-muted mt-1">{t('today.needNoteOrFileHint')}</p>
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
  };

  const renderManagerTable = (rows: TaskRow[]) => {
    if (!rows.length) {
      return (
        <p className="text-sm text-ink-muted py-6 text-center border border-dashed border-teal-900/15 rounded-xl">
          {t('today.emptyTasks')}
        </p>
      );
    }

    // Sort by section then title for stable table scan
    const sorted = [...rows].sort((a, b) => {
      const sa = (lang === 'ru' ? a.sectionRu : a.sectionUz) || '';
      const sb = (lang === 'ru' ? b.sectionRu : b.sectionUz) || '';
      if (sa !== sb) return sa.localeCompare(sb, 'uz');
      const ta = (lang === 'ru' ? a.titleRu : a.titleUz) || '';
      const tb = (lang === 'ru' ? b.titleRu : b.titleUz) || '';
      return ta.localeCompare(tb, 'uz');
    });

    let lastSection = '';

    return (
      <div className="overflow-x-auto rounded-xl border border-teal-900/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted border-b border-teal-900/10 bg-teal-950/[0.03]">
              <th className="p-2.5 font-medium">{t('today.task')}</th>
              <th className="p-2.5 font-medium w-[100px]">{t('today.status')}</th>
              <th className="p-2.5 font-medium w-[110px]">{t('today.action')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const title = lang === 'ru' ? row.titleRu : row.titleUz;
              const section = (lang === 'ru' ? row.sectionRu : row.sectionUz) || '—';
              const showSection = section !== lastSection;
              lastSection = section;
              const open = expandKey === row.key;
              const hasDraft = !!(notes[row.key]?.trim() || files[row.key]);

              return (
                <Fragment key={row.key}>
                  {showSection && (
                    <tr className="bg-teal-50/80">
                      <td colSpan={3} className="px-2.5 py-1.5 text-[11px] font-semibold text-teal-900">
                        {section}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-teal-900/[0.06] hover:bg-teal-50/30">
                    <td className="p-2.5 align-middle">
                      <p className="font-medium text-ink leading-snug">{title}</p>
                      {row.aiNote && (
                        <p className="text-[11px] text-ink-muted mt-0.5 line-clamp-1">{row.aiNote}</p>
                      )}
                    </td>
                    <td className="p-2.5 align-middle">
                      <span
                        className={cn(
                          'inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                          row.status === 'DONE' && 'bg-teal-100 text-teal-900',
                          row.status === 'REJECTED' && 'bg-rose-100 text-rose-800',
                          row.status === 'PENDING' && 'bg-amber-100 text-amber-900',
                          row.status === 'TODO' && 'bg-sand-100 text-ink-muted',
                        )}
                      >
                        {statusLabel(row)}
                      </span>
                    </td>
                    <td className="p-2.5 align-middle">
                      <button
                        type="button"
                        onClick={() => setExpandKey(open ? null : row.key)}
                        className={cn(
                          'inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold border transition',
                          open
                            ? 'bg-teal-800 text-white border-teal-800'
                            : hasDraft
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-white text-teal-900 border-teal-200 hover:bg-teal-50',
                        )}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {open ? t('today.closeNote') : t('today.writeNote')}
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-teal-50/40 border-t border-teal-100">
                      <td colSpan={3} className="p-3">
                        <div className="rounded-xl border border-teal-200/80 bg-white p-3 space-y-2.5 max-w-xl">
                          {(row.inputType === 'RATIO' || row.inputType === 'NUMBER') && (
                            <div className="flex flex-wrap gap-2">
                              {row.inputType === 'RATIO' && (
                                <>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder={t('today.calls')}
                                    className="w-24 h-9 rounded-lg border border-teal-200 px-2 text-sm"
                                    value={draft[row.key]?.calls ?? ''}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/[^\d]/g, '');
                                      setDraft((d) => ({
                                        ...d,
                                        [row.key]: {
                                          ...(d[row.key] || {}),
                                          calls: v,
                                          booked: d[row.key]?.booked ?? '',
                                        },
                                      }));
                                    }}
                                  />
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder={t('today.booked')}
                                    className="w-24 h-9 rounded-lg border border-teal-200 px-2 text-sm"
                                    value={draft[row.key]?.booked ?? ''}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/[^\d]/g, '');
                                      setDraft((d) => ({
                                        ...d,
                                        [row.key]: {
                                          ...(d[row.key] || {}),
                                          booked: v,
                                          calls: d[row.key]?.calls ?? '',
                                        },
                                      }));
                                    }}
                                  />
                                </>
                              )}
                              {row.inputType === 'NUMBER' && (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder={t('today.count')}
                                  className="w-28 h-9 rounded-lg border border-teal-200 px-2 text-sm"
                                  value={draft[row.key]?.count ?? ''}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/[^\d]/g, '');
                                    setDraft((d) => ({ ...d, [row.key]: { count: v } }));
                                  }}
                                />
                              )}
                            </div>
                          )}
                          <textarea
                            autoFocus
                            className="w-full min-h-[72px] rounded-lg border border-teal-200 px-3 py-2 text-sm"
                            placeholder={t('today.notePlaceholder')}
                            value={notes[row.key] || ''}
                            onChange={(e) =>
                              setNotes((n) => ({ ...n, [row.key]: e.target.value }))
                            }
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-teal-200 text-xs text-teal-900 cursor-pointer hover:bg-teal-50">
                              <Upload className="w-3.5 h-3.5" />
                              <span className="truncate max-w-[140px]">
                                {files[row.key]?.name || t('today.pickFile')}
                              </span>
                              <input
                                type="file"
                                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                                className="hidden"
                                onChange={(e) =>
                                  setFiles((f) => ({
                                    ...f,
                                    [row.key]: e.target.files?.[0] || null,
                                  }))
                                }
                              />
                            </label>
                            {files[row.key] && (
                              <button
                                type="button"
                                onClick={() =>
                                  setFiles((f) => ({ ...f, [row.key]: null }))
                                }
                                className="h-9 w-9 grid place-items-center rounded-lg border border-teal-100 text-ink-muted"
                                aria-label="clear file"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyKey === row.key}
                              onClick={() => submitTask(row)}
                              className="h-9 px-4 rounded-lg text-xs font-semibold bg-teal-800 text-white disabled:opacity-50 ml-auto"
                            >
                              {busyKey === row.key
                                ? t('today.submitting')
                                : t('today.submit')}
                            </button>
                          </div>
                          <p className="text-[10px] text-ink-muted">
                            {t('today.needNoteOrFileHint')}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

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
                    {renderManagerTable(uniquePending)}
                  </section>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-ink">
                      {t('today.inReview')} · {inReview.length}
                    </h2>
                    {renderTaskTable(inReview, 'readonly')}
                  </section>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-ink">
                      {t('today.doneList')} · {completed.length}
                    </h2>
                    {renderTaskTable(completed, 'readonly')}
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
                      onClick={() => setShowAddTask((v) => !v)}
                      className={cn(
                        'h-9 px-3 rounded-lg text-sm font-medium border',
                        showAddTask
                          ? 'bg-amber-700 text-white border-amber-700'
                          : 'border-amber-300 bg-amber-50 text-amber-900',
                      )}
                    >
                      {t('today.addTask')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignOpen((v) => !v)}
                      className="h-9 px-3 rounded-lg text-sm text-ink-muted"
                    >
                      {assignOpen ? '−' : '+'}
                    </button>
                  </div>

                  {showAddTask && (
                    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 space-y-3">
                      <h3 className="text-sm font-semibold text-ink">{t('today.addTaskTitle')}</h3>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <label className="block space-y-1">
                          <span className="text-xs text-ink-muted">{t('today.category')}</span>
                          <select
                            className="w-full h-10 rounded-lg border border-teal-900/10 bg-white px-3 text-sm"
                            value={newTask.categoryKey}
                            onChange={(e) =>
                              setNewTask((s) => ({
                                ...s,
                                categoryKey: e.target.value,
                                subKey: '',
                              }))
                            }
                          >
                            {!catalogParents.length && (
                              <option value="">{t('today.pickCategory')}</option>
                            )}
                            {catalogParents.map((p) => (
                              <option key={p.key} value={p.key}>
                                {lang === 'ru' ? p.titleRu : p.titleUz}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs text-ink-muted">{t('today.subcategory')}</span>
                          <select
                            className="w-full h-10 rounded-lg border border-teal-900/10 bg-white px-3 text-sm"
                            value={newTask.subKey}
                            onChange={(e) =>
                              setNewTask((s) => ({ ...s, subKey: e.target.value }))
                            }
                          >
                            <option value="">{t('today.noSub')}</option>
                            {(
                              catalogParents.find((p) => p.key === newTask.categoryKey)?.subs ||
                              []
                            ).map((s) => (
                              <option key={s.key} value={s.key}>
                                {lang === 'ru' ? s.pathRu || s.titleRu : s.pathUz || s.titleUz}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1 sm:col-span-2">
                          <span className="text-xs text-ink-muted">{t('today.taskName')}</span>
                          <input
                            className="w-full h-10 rounded-lg border border-teal-900/10 bg-white px-3 text-sm"
                            value={newTask.titleUz}
                            onChange={(e) =>
                              setNewTask((s) => ({ ...s, titleUz: e.target.value }))
                            }
                            placeholder={t('today.taskName')}
                          />
                        </label>
                        <label className="block space-y-1 sm:col-span-2">
                          <span className="text-xs text-ink-muted">{t('today.taskNameRu')}</span>
                          <input
                            className="w-full h-10 rounded-lg border border-teal-900/10 bg-white px-3 text-sm"
                            value={newTask.titleRu}
                            onChange={(e) =>
                              setNewTask((s) => ({ ...s, titleRu: e.target.value }))
                            }
                          />
                        </label>
                        <label className="block space-y-1 sm:col-span-2">
                          <span className="text-xs text-ink-muted">{t('today.taskPurpose')}</span>
                          <textarea
                            className="w-full min-h-[72px] rounded-lg border border-teal-900/10 bg-white px-3 py-2 text-sm"
                            value={newTask.descriptionUz}
                            onChange={(e) =>
                              setNewTask((s) => ({ ...s, descriptionUz: e.target.value }))
                            }
                            placeholder={t('today.taskPurpose')}
                          />
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-teal-800"
                          checked={newTask.proofRequired}
                          onChange={(e) =>
                            setNewTask((s) => ({ ...s, proofRequired: e.target.checked }))
                          }
                        />
                        {t('today.proofNeeded')}
                      </label>
                      <p className="text-xs text-ink-muted">
                        {freq === 'DAILY'
                          ? t('today.daily')
                          : freq === 'WEEKLY'
                            ? t('today.weekly')
                            : t('today.monthly')}
                      </p>
                      <button
                        type="button"
                        disabled={busyKey === 'create-task'}
                        onClick={createTask}
                        className="h-10 px-4 rounded-lg text-sm font-semibold bg-amber-700 text-white disabled:opacity-50"
                      >
                        {t('today.addTaskBtn')}
                      </button>
                    </div>
                  )}

                  {assignOpen &&
                    (day?.tree || []).map((n: TreeNode) => renderAssignTree(n))}
                </div>
              )}

              {adminTab === 'results' && (
                <div className="space-y-5">
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">
                      {t('today.inReview')} · {inReview.length}
                    </h2>
                    {renderTaskTable(inReview, 'admin-review')}
                  </section>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">
                      {t('today.todo')} · {uniquePending.length}
                    </h2>
                    {renderTaskTable(uniquePending, 'readonly')}
                  </section>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">
                      {t('today.doneList')} · {completed.length}
                    </h2>
                    {renderTaskTable(completed, 'readonly')}
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
