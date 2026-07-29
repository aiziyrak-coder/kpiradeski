'use client';

import { useCallback, useEffect, useMemo, useState, Fragment, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { ScoreBadge } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { api, getToken } from '@/lib/api';
import { fetchProof, fetchProofUrl, getCachedProofUrl } from '@/lib/proof-cache';
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
  proof: { id: string; fileName: string; mimeType?: string; aiStatus: string } | null;
  proofs?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    aiStatus: string;
    size?: number;
  }>;
  managerNote?: string | null;
  submittedBy?: string | null;
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

/** Har bir ishlar bloki uchun alohida och pastel palitra */
const BLOCK_PALETTES = [
  {
    wrap: 'border-teal-300',
    headClosed: 'bg-teal-100 text-teal-950',
    headOpen: 'bg-teal-200 text-teal-950',
    subHead: 'bg-teal-50 text-teal-900',
    body: 'bg-teal-50/50 border-t border-teal-200',
    badge: 'bg-teal-300/80 text-teal-950',
    checkOn: 'bg-teal-700 border-teal-700 text-white',
    checkOff: 'border-teal-500 bg-white',
    row: 'bg-teal-50/40',
    rowHover: 'hover:bg-teal-100/50',
    noteBg: 'bg-teal-50/60 border-teal-200',
    btn: 'border-teal-300 text-teal-900 hover:bg-teal-100',
    btnOn: 'bg-teal-800 text-white border-teal-800',
  },
  {
    wrap: 'border-amber-300',
    headClosed: 'bg-amber-100 text-amber-950',
    headOpen: 'bg-amber-200 text-amber-950',
    subHead: 'bg-amber-50 text-amber-900',
    body: 'bg-amber-50/50 border-t border-amber-200',
    badge: 'bg-amber-300/80 text-amber-950',
    checkOn: 'bg-amber-700 border-amber-700 text-white',
    checkOff: 'border-amber-500 bg-white',
    row: 'bg-amber-50/40',
    rowHover: 'hover:bg-amber-100/50',
    noteBg: 'bg-amber-50/60 border-amber-200',
    btn: 'border-amber-300 text-amber-900 hover:bg-amber-100',
    btnOn: 'bg-amber-800 text-white border-amber-800',
  },
  {
    wrap: 'border-violet-300',
    headClosed: 'bg-violet-100 text-violet-950',
    headOpen: 'bg-violet-200 text-violet-950',
    subHead: 'bg-violet-50 text-violet-900',
    body: 'bg-violet-50/50 border-t border-violet-200',
    badge: 'bg-violet-300/80 text-violet-950',
    checkOn: 'bg-violet-700 border-violet-700 text-white',
    checkOff: 'border-violet-500 bg-white',
    row: 'bg-violet-50/40',
    rowHover: 'hover:bg-violet-100/50',
    noteBg: 'bg-violet-50/60 border-violet-200',
    btn: 'border-violet-300 text-violet-900 hover:bg-violet-100',
    btnOn: 'bg-violet-800 text-white border-violet-800',
  },
  {
    wrap: 'border-sky-300',
    headClosed: 'bg-sky-100 text-sky-950',
    headOpen: 'bg-sky-200 text-sky-950',
    subHead: 'bg-sky-50 text-sky-900',
    body: 'bg-sky-50/50 border-t border-sky-200',
    badge: 'bg-sky-300/80 text-sky-950',
    checkOn: 'bg-sky-700 border-sky-700 text-white',
    checkOff: 'border-sky-500 bg-white',
    row: 'bg-sky-50/40',
    rowHover: 'hover:bg-sky-100/50',
    noteBg: 'bg-sky-50/60 border-sky-200',
    btn: 'border-sky-300 text-sky-900 hover:bg-sky-100',
    btnOn: 'bg-sky-800 text-white border-sky-800',
  },
  {
    wrap: 'border-rose-300',
    headClosed: 'bg-rose-100 text-rose-950',
    headOpen: 'bg-rose-200 text-rose-950',
    subHead: 'bg-rose-50 text-rose-900',
    body: 'bg-rose-50/50 border-t border-rose-200',
    badge: 'bg-rose-300/80 text-rose-950',
    checkOn: 'bg-rose-700 border-rose-700 text-white',
    checkOff: 'border-rose-500 bg-white',
    row: 'bg-rose-50/40',
    rowHover: 'hover:bg-rose-100/50',
    noteBg: 'bg-rose-50/60 border-rose-200',
    btn: 'border-rose-300 text-rose-900 hover:bg-rose-100',
    btnOn: 'bg-rose-800 text-white border-rose-800',
  },
  {
    wrap: 'border-lime-300',
    headClosed: 'bg-lime-100 text-lime-950',
    headOpen: 'bg-lime-200 text-lime-950',
    subHead: 'bg-lime-50 text-lime-900',
    body: 'bg-lime-50/50 border-t border-lime-200',
    badge: 'bg-lime-300/80 text-lime-950',
    checkOn: 'bg-lime-700 border-lime-700 text-white',
    checkOff: 'border-lime-500 bg-white',
    row: 'bg-lime-50/40',
    rowHover: 'hover:bg-lime-100/50',
    noteBg: 'bg-lime-50/60 border-lime-200',
    btn: 'border-lime-300 text-lime-900 hover:bg-lime-100',
    btnOn: 'bg-lime-800 text-white border-lime-800',
  },
  {
    wrap: 'border-orange-300',
    headClosed: 'bg-orange-100 text-orange-950',
    headOpen: 'bg-orange-200 text-orange-950',
    subHead: 'bg-orange-50 text-orange-900',
    body: 'bg-orange-50/50 border-t border-orange-200',
    badge: 'bg-orange-300/80 text-orange-950',
    checkOn: 'bg-orange-700 border-orange-700 text-white',
    checkOff: 'border-orange-500 bg-white',
    row: 'bg-orange-50/40',
    rowHover: 'hover:bg-orange-100/50',
    noteBg: 'bg-orange-50/60 border-orange-200',
    btn: 'border-orange-300 text-orange-900 hover:bg-orange-100',
    btnOn: 'bg-orange-800 text-white border-orange-800',
  },
  {
    wrap: 'border-cyan-300',
    headClosed: 'bg-cyan-100 text-cyan-950',
    headOpen: 'bg-cyan-200 text-cyan-950',
    subHead: 'bg-cyan-50 text-cyan-900',
    body: 'bg-cyan-50/50 border-t border-cyan-200',
    badge: 'bg-cyan-300/80 text-cyan-950',
    checkOn: 'bg-cyan-700 border-cyan-700 text-white',
    checkOff: 'border-cyan-500 bg-white',
    row: 'bg-cyan-50/40',
    rowHover: 'hover:bg-cyan-100/50',
    noteBg: 'bg-cyan-50/60 border-cyan-200',
    btn: 'border-cyan-300 text-cyan-900 hover:bg-cyan-100',
    btnOn: 'bg-cyan-800 text-white border-cyan-800',
  },
] as const;

function blockPalette(index: number) {
  return BLOCK_PALETTES[Math.abs(index) % BLOCK_PALETTES.length];
}

function hashSection(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

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

function FileThumbs({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (idx: number) => void;
}) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {files.map((f, i) => {
        const isImg = f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name);
        const url = isImg ? URL.createObjectURL(f) : null;
        return (
          <div
            key={`${f.name}-${f.size}-${i}`}
            className="relative w-14 h-14 rounded-lg border border-teal-200 bg-sand-50 overflow-hidden"
            title={f.name}
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={f.name}
                className="w-full h-full object-cover"
                onLoad={() => URL.revokeObjectURL(url)}
              />
            ) : (
              <div className="w-full h-full grid place-items-center text-[9px] font-semibold text-ink-muted px-0.5 text-center leading-tight">
                {f.name.split('.').pop()?.toUpperCase() || 'FILE'}
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white grid place-items-center"
              aria-label="remove"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SavedProofThumbs({
  proofs,
  onOpen,
}: {
  proofs?: Array<{ id: string; fileName: string; mimeType: string }>;
  onOpen: (id: string) => void;
}) {
  const list = proofs || [];
  const idsKey = list.map((p) => p.id).join(',');
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const p of list.slice(0, 8)) {
        if (!p.mimeType?.startsWith('image/')) continue;
        const cached = getCachedProofUrl(p.id);
        if (cached) {
          next[p.id] = cached;
          continue;
        }
        const url = await fetchProofUrl(p.id);
        if (url) next[p.id] = url;
        if (cancelled) return;
        setUrls((prev) => ({ ...prev, ...next }));
      }
      if (!cancelled) setUrls((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {list.map((p) => {
        const url = urls[p.id] || getCachedProofUrl(p.id);
        const isImg = p.mimeType?.startsWith('image/');
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="relative w-14 h-14 sm:w-12 sm:h-12 rounded-lg border border-teal-200 bg-white overflow-hidden active:ring-2 active:ring-teal-400 touch-manipulation"
            title={p.fileName}
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={p.fileName} className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full grid place-items-center text-[8px] font-semibold text-teal-800 px-0.5">
                {isImg ? '…' : p.fileName.split('.').pop()?.toUpperCase() || 'FILE'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
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
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandKey, setExpandKey] = useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({});
  const [assignSel, setAssignSel] = useState<Record<string, boolean>>({});
  const [assignOpen, setAssignOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState<Record<string, boolean>>({});
  const [adminTab, setAdminTab] = useState<'assign' | 'results'>('assign');
  const [showAddTask, setShowAddTask] = useState(false);
  const [aiCoach, setAiCoach] = useState<{
    summary: string;
    quality: string;
    issues: string[];
    nextActions: string[];
    incompleteHint: string;
    praise: string;
  } | null>(null);
  const [proofPreview, setProofPreview] = useState<{
    url: string;
    mime: string;
    name: string;
  } | null>(null);
  const [catalogParents, setCatalogParents] = useState<CatalogParent[]>([]);
  const [newTask, setNewTask] = useState({
    titleUz: '',
    titleRu: '',
    descriptionUz: '',
    categoryKey: '',
    subKey: '',
    proofRequired: false,
  });

  function addFiles(rowKey: string, list: FileList | null) {
    if (!list?.length) return;
    setFiles((prev) => {
      const cur = prev[rowKey] || [];
      const next = [...cur];
      for (const f of Array.from(list)) {
        if (next.length >= 8) break;
        if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
        next.push(f);
      }
      return { ...prev, [rowKey]: next };
    });
  }

  function removeFile(rowKey: string, idx: number) {
    setFiles((prev) => {
      const cur = [...(prev[rowKey] || [])];
      cur.splice(idx, 1);
      return { ...prev, [rowKey]: cur };
    });
  }

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
    // toast is stable (memoized) — keep out of identity churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, date, freq]);

  useEffect(() => {
    loadBranches().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBranches]);

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

  /** Manager: barcha ishlar bitta roʻyxatda — status joyida oʻzgaradi */
  const allManagerRows = useMemo(() => {
    const base = (day?.rows || []) as TaskRow[];
    return filterRows(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, q, lang]);

  const statusCounts = useMemo(() => {
    const rows = allManagerRows;
    return {
      todo: rows.filter((r) => r.status === 'TODO' || r.status === 'REJECTED').length,
      review: rows.filter((r) => r.status === 'PENDING').length,
      done: rows.filter((r) => r.status === 'DONE').length,
    };
  }, [allManagerRows]);

  async function submitTask(row: TaskRow) {
    const note = (notes[row.key] || '').trim();
    const fileList = files[row.key] || [];
    if (row.proofRequired && !fileList.length) {
      toast.error(t('today.needFile'));
      return;
    }
    if (!note && !fileList.length) {
      toast.error(t('today.needNoteOrFile'));
      return;
    }

    if (fileList.length) {
      setBusyKey(row.key);
      try {
        const fd = new FormData();
        for (const f of fileList.slice(0, 8)) fd.append('files', f);
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
        if (!res.ok) {
          const msg = Array.isArray(data.message)
            ? data.message.join(', ')
            : data.message || t('common.error');
          throw new Error(msg);
        }        if (data.aiStatus === 'REJECTED') toast.error(data.aiNote || t('today.statusRejected'));
        else if (data.aiStatus === 'APPROVED') toast.success(data.aiNote || t('today.proofOk'));
        else toast.success(t('today.submittedOk'));
        if (data.aiCoach?.summary) setAiCoach(data.aiCoach);
        setFiles((f) => ({ ...f, [row.key]: [] }));
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
      const done = await api<any>('/manager-kpi/complete', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          date,
          nodeKey: row.key,
          value,
        }),
      });
      if (done?.status === 'REJECTED' || done?.aiStatus === 'REJECTED') {
        toast.error(done.aiNote || t('today.statusRejected'));
      } else if (done?.status === 'PENDING' || done?.aiStatus === 'PENDING') {
        toast.success(t('today.submittedOk'));
      } else {
        toast.success(done?.aiNote || t('today.statusDone'));
      }
      if (done?.aiCoach?.summary) setAiCoach(done.aiCoach);
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
      toast.success(`${t('today.taskAdded')}. ${t('today.taskAddedHint')}`);
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
      const entry = await fetchProof(id);
      if (!entry) throw new Error(t('proof.openFailed'));
      setProofPreview({
        url: entry.url,
        mime: entry.mime,
        name: entry.name,
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function closeProofPreview() {
    // object URL cachedan kelgan — revoke qilmaymiz
    setProofPreview(null);
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
    if (row.aiStatus === 'APPROVED' || row.status === 'DONE') return t('today.statusDone');
    if (row.status === 'REJECTED' || row.aiStatus === 'REJECTED') return t('today.statusRejected');
    if (row.status === 'PENDING' || row.aiStatus === 'PENDING') return t('today.statusReview');
    return t('today.statusTodo');
  }

  function canSubmitRow(row: TaskRow) {
    return row.status === 'TODO' || row.status === 'REJECTED';
  }

  const renderAssignTree = (node: TreeNode, depth = 0, colorIdx = 0): ReactNode => {
    const hasKids = !!node.children?.length;
    const open = treeOpen[node.key] ?? false;
    const leafKeys = hasKids ? collectLeaves(node) : [];
    const selectedCount = leafKeys.filter((k) => assignSel[k]).length;
    const allSel = leafKeys.length > 0 && selectedCount === leafKeys.length;
    const title = lang === 'ru' ? node.titleRu : node.titleUz;
    const pal = blockPalette(colorIdx);
    const headCls = depth === 0 ? (open ? pal.headOpen : pal.headClosed) : pal.subHead;

    if (!hasKids && node.inputType === 'GROUP') return null;

    if (!hasKids) {
      return (
        <label
          key={node.key}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 border-t border-black/[0.04] cursor-pointer',
            pal.rowHover,
          )}
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
        className={cn('rounded-xl overflow-hidden mb-2 border', pal.wrap)}
        style={{ marginLeft: depth > 0 ? 10 : 0 }}
      >
        <div className={cn('flex items-center gap-2 px-3 py-2.5', headCls)}>
          <button
            type="button"
            onClick={() => setTreeOpen((o) => ({ ...o, [node.key]: !open }))}
            className="p-0.5 rounded hover:bg-black/5"
            title={open ? t('today.closed') : t('today.opened')}
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
              allSel ? pal.checkOn : pal.checkOff,
            )}
          >
            {allSel && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
          <span className="text-sm font-semibold flex-1">{title}</span>
          <span
            className={cn(
              'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
              pal.badge,
            )}
          >
            {open ? t('today.opened') : t('today.closed')}
          </span>
          <span className="text-xs tabular-nums opacity-70">
            {selectedCount}/{leafKeys.length}
          </span>
        </div>
        {open && (
          <div className={cn(pal.body)}>
            {node.children.map((c) => renderAssignTree(c, depth + 1, colorIdx))}
          </div>
        )}
      </div>
    );
  };

  const proofsOf = (row: TaskRow) =>
    row.proofs?.length
      ? row.proofs
      : row.proof
        ? [
            {
              id: row.proof.id,
              fileName: row.proof.fileName,
              mimeType: row.proof.mimeType || 'image/jpeg',
              aiStatus: row.proof.aiStatus,
            },
          ]
        : [];

  const rowNote = (row: TaskRow) =>
    row.managerNote ||
    (row.value && typeof row.value === 'object' && row.value.note
      ? String(row.value.note)
      : '') ||
    '';

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

    const statusPill = (row: TaskRow) => (
      <span
        className={cn(
          'inline-flex shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full',
          row.status === 'DONE' && 'bg-teal-100 text-teal-900',
          row.status === 'REJECTED' && 'bg-rose-100 text-rose-800',
          row.status === 'PENDING' && 'bg-amber-100 text-amber-900',
          row.status === 'TODO' && 'bg-sand-100 text-ink-muted',
        )}
      >
        {statusLabel(row)}
      </span>
    );

    const reviewActions = (row: TaskRow, fullWidth?: boolean) =>
      mode === 'admin-review' && row.proof?.id && row.status === 'PENDING' ? (
        <div className={cn('flex gap-2', fullWidth && 'pt-1')}>
          <button
            type="button"
            disabled={busyKey === row.proof.id}
            onClick={() => review(row.proof!.id, true)}
            className={cn(
              'rounded-lg text-xs font-semibold bg-teal-800 text-white disabled:opacity-50',
              fullWidth ? 'flex-1 h-11' : 'h-7 px-2',
            )}
          >
            {t('today.approve')}
          </button>
          <button
            type="button"
            disabled={busyKey === row.proof.id}
            onClick={() => review(row.proof!.id, false)}
            className={cn(
              'rounded-lg text-xs font-semibold border border-rose-200 text-rose-800 disabled:opacity-50',
              fullWidth ? 'flex-1 h-11' : 'h-7 px-2',
            )}
          >
            {t('today.reject')}
          </button>
        </div>
      ) : null;

    return (
      <>
        {/* Telefon: kartochkalar — jadval o‘rniga */}
        <div className="md:hidden space-y-2.5">
          {rows.map((row) => {
            const title = lang === 'ru' ? row.titleRu : row.titleUz;
            const section = lang === 'ru' ? row.sectionRu : row.sectionUz;
            const note = rowNote(row);
            const proofs = proofsOf(row);
            const showSubmit = mode === 'readonly' || mode === 'admin-review';
            return (
              <article
                key={row.key}
                className="rounded-xl border border-teal-900/10 bg-white p-3.5 space-y-2.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-ink-muted leading-snug">{section || '—'}</p>
                    <p className="font-medium text-ink leading-snug mt-0.5">{title}</p>
                    {row.submittedBy && showSubmit && (
                      <p className="text-[11px] text-teal-800 mt-0.5 font-medium">
                        {row.submittedBy}
                      </p>
                    )}
                    {row.proofRequired && (
                      <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                        {t('today.needsProof')}
                      </span>
                    )}
                  </div>
                  {statusPill(row)}
                </div>
                {note ? (
                  <div className="rounded-lg bg-sand-50/80 border border-teal-900/5 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-ink-muted font-semibold mb-0.5">
                      {t('today.managerNote')}
                    </p>
                    <p className="text-xs text-ink leading-snug whitespace-pre-wrap">{note}</p>
                  </div>
                ) : null}
                {proofs.length > 0 ? (
                  <SavedProofThumbs proofs={proofs} onOpen={openProof} />
                ) : null}
                {reviewActions(row, true)}
              </article>
            );
          })}
        </div>

        {/* Desktop / planshet: jadval */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-teal-900/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted border-b border-teal-900/10 bg-teal-950/[0.03]">
                <th className="p-3 font-medium">{t('today.section')}</th>
                <th className="p-3 font-medium">{t('today.task')}</th>
                <th className="p-3 font-medium">{t('today.status')}</th>
                {(mode === 'readonly' || mode === 'admin-review') && (
                  <>
                    <th className="p-3 font-medium min-w-[160px]">{t('today.managerNote')}</th>
                    <th className="p-3 font-medium min-w-[120px]">{t('today.proofsCol')}</th>
                  </>
                )}
                {mode === 'manager-todo' && (
                  <>
                    <th className="p-3 font-medium">{t('today.noteOrFile')}</th>
                    <th className="p-3 font-medium">{t('today.action')}</th>
                  </>
                )}
                {mode === 'admin-review' && (
                  <th className="p-3 font-medium">{t('today.action')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const title = lang === 'ru' ? row.titleRu : row.titleUz;
                const section = lang === 'ru' ? row.sectionRu : row.sectionUz;
                const note = rowNote(row);
                const proofs = proofsOf(row);
                const showSubmit = mode === 'readonly' || mode === 'admin-review';
                return (
                  <tr key={row.key} className="border-t border-teal-900/[0.06] align-top">
                    <td className="p-3 text-xs text-ink-muted whitespace-nowrap">
                      {section || '—'}
                    </td>
                    <td className="p-3">
                      <p className="font-medium text-ink">{title}</p>
                      {row.submittedBy && showSubmit && (
                        <p className="text-[11px] text-teal-800 mt-0.5 font-medium">
                          {row.submittedBy}
                        </p>
                      )}
                      {row.proofRequired && (
                        <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          {t('today.needsProof')}
                        </span>
                      )}
                      {row.aiNote && mode === 'manager-todo' && (
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
                    <td className="p-3">{statusPill(row)}</td>
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
                            <span>
                              {(files[row.key]?.length || 0) > 0
                                ? t('today.filesCount').replace(
                                    '{n}',
                                    String(files[row.key].length),
                                  )
                                : t('today.pickFiles')}
                            </span>
                            <input
                              type="file"
                              multiple
                              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                              className="hidden"
                              onChange={(e) => {
                                addFiles(row.key, e.target.files);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <FileThumbs
                            files={files[row.key] || []}
                            onRemove={(i) => removeFile(row.key, i)}
                          />
                          <p className="text-[10px] text-ink-muted mt-1">
                            {t('today.needNoteOrFileHint')}
                          </p>
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
                    {(mode === 'readonly' || mode === 'admin-review') && (
                      <>
                        <td className="p-3">
                          {note ? (
                            <p className="text-xs text-ink leading-snug whitespace-pre-wrap max-w-[240px]">
                              {note}
                            </p>
                          ) : (
                            <span className="text-xs text-ink-muted">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          {proofs.length > 0 ? (
                            <SavedProofThumbs proofs={proofs} onOpen={openProof} />
                          ) : (
                            <span className="text-xs text-ink-muted">—</span>
                          )}
                        </td>
                      </>
                    )}
                    {mode === 'admin-review' && (
                      <td className="p-3 whitespace-nowrap">{reviewActions(row)}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
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
      <div className="rounded-xl border border-teal-900/10 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="hidden md:table-header-group">
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
              const secOpen = sectionOpen[section] === true;
              const open = expandKey === row.key;
              const hasDraft = !!(notes[row.key]?.trim() || (files[row.key] || []).length);
              const sectionCount = sorted.filter((r) => {
                const s = (lang === 'ru' ? r.sectionRu : r.sectionUz) || '—';
                return s === section;
              }).length;
              const openInSection = sorted.filter((r) => {
                const s = (lang === 'ru' ? r.sectionRu : r.sectionUz) || '—';
                return s === section && (r.status === 'TODO' || r.status === 'REJECTED');
              }).length;
              const pal = blockPalette(hashSection(section));

              return (
                <Fragment key={row.key}>
                  {showSection && (
                    <tr className={cn('border-t max-md:block', pal.wrap)}>
                      <td colSpan={3} className="p-0 max-md:block max-md:w-full">
                        <button
                          type="button"
                          onClick={() =>
                            setSectionOpen((s) => ({ ...s, [section]: !secOpen }))
                          }
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-3 min-h-11 text-left touch-manipulation',
                            secOpen ? pal.headOpen : pal.headClosed,
                          )}
                        >
                          {secOpen ? (
                            <ChevronDown className="w-4 h-4 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 shrink-0" />
                          )}
                          <span className="text-[12px] font-semibold flex-1">{section}</span>
                          {openInSection > 0 && (
                            <span
                              className={cn(
                                'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
                                pal.badge,
                              )}
                            >
                              {t('today.statusTodo')} {openInSection}
                            </span>
                          )}
                          <span className="text-xs tabular-nums opacity-80">{sectionCount}</span>
                        </button>
                      </td>
                    </tr>
                  )}
                  {secOpen && (
                    <>
                  <tr
                    className={cn(
                      'border-t border-black/[0.04]',
                      pal.row,
                      pal.rowHover,
                      'max-md:grid max-md:grid-cols-[1fr_auto] max-md:gap-x-2 max-md:gap-y-1.5 max-md:p-3 max-md:items-start',
                    )}
                  >
                    <td className="p-2.5 align-middle max-md:p-0 max-md:col-span-2">
                      <p className="font-medium text-ink leading-snug">{title}</p>
                      {row.proofRequired && (
                        <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          {t('today.needsProof')}
                        </span>
                      )}
                      {(row.managerNote ||
                        (row.value && typeof row.value === 'object' && row.value.note)) && (
                        <p className="text-[11px] text-ink mt-1 leading-snug line-clamp-2">
                          {row.managerNote || String(row.value.note)}
                        </p>
                      )}
                      {row.aiNote && row.status !== 'DONE' && (
                        <p className="text-[11px] text-ink-muted mt-0.5 line-clamp-1">{row.aiNote}</p>
                      )}
                      <SavedProofThumbs proofs={row.proofs} onOpen={openProof} />
                    </td>
                    <td className="p-2.5 align-middle max-md:p-0">
                      <div className="space-y-1">
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
                        {(row.aiFeedback || row.aiNote) && row.status !== 'TODO' && (
                          <p
                            className={cn(
                              'text-[10px] leading-snug max-w-[140px] max-md:max-w-none',
                              row.status === 'REJECTED' ? 'text-rose-700' : 'text-ink-muted',
                            )}
                            title={row.aiFeedback || row.aiNote || ''}
                          >
                            {(row.aiFeedback || row.aiNote || '').slice(0, 80)}
                            {(row.aiFeedback || row.aiNote || '').length > 80 ? '…' : ''}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="p-2.5 align-middle max-md:p-0 max-md:justify-self-end">
                      {canSubmitRow(row) ? (
                        <button
                          type="button"
                          onClick={() => setExpandKey(open ? null : row.key)}
                          className={cn(
                            'inline-flex items-center gap-1 min-h-10 md:h-8 px-3 rounded-lg text-xs font-semibold border transition touch-manipulation',
                            open
                              ? pal.btnOn
                              : hasDraft
                                ? 'bg-white border-amber-300 text-amber-900'
                                : cn('bg-white', pal.btn),
                          )}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          {open ? t('today.closeNote') : t('today.writeNote')}
                        </button>
                      ) : row.status === 'PENDING' ? (
                        <span className="text-[10px] text-amber-800 font-medium">
                          {t('today.awaitingAi')}
                        </span>
                      ) : row.proof?.id || (row.proofs && row.proofs.length > 0) ? (
                        <button
                          type="button"
                          onClick={() =>
                            openProof(
                              (row.proofs && row.proofs[0]?.id) || row.proof!.id,
                            )
                          }
                          className="text-xs text-teal-800 underline font-medium min-h-10 inline-flex items-center"
                        >
                          {t('today.viewProof')}
                          {(row.proofs?.length || 0) > 1 ? ` · ${row.proofs!.length}` : ''}
                        </button>
                      ) : (
                        <span className="text-[10px] text-teal-800 font-medium">
                          {t('today.statusDone')}
                        </span>
                      )}
                    </td>
                  </tr>
                  {open && canSubmitRow(row) && (
                    <tr className={cn('border-t max-md:block', pal.body)}>
                      <td colSpan={3} className="p-3 max-md:block max-md:w-full">
                        <div className={cn('rounded-xl border bg-white p-3 space-y-2.5 max-w-xl', pal.noteBg)}>
                          {row.status === 'REJECTED' && (row.aiFeedback || row.aiNote) && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                              <p className="font-semibold mb-0.5">{t('today.aiReturn')}</p>
                              <p>{row.aiFeedback || row.aiNote}</p>
                            </div>
                          )}
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
                              <span>
                                {(files[row.key]?.length || 0) > 0
                                  ? t('today.filesCount').replace(
                                      '{n}',
                                      String(files[row.key].length),
                                    )
                                  : t('today.pickFiles')}
                              </span>
                              <input
                                type="file"
                                multiple
                                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                                className="hidden"
                                onChange={(e) => {
                                  addFiles(row.key, e.target.files);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              disabled={busyKey === row.key}
                              onClick={() => submitTask(row)}
                              className={cn(
                                'h-9 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 ml-auto',
                                pal.btnOn,
                              )}
                            >
                              {busyKey === row.key
                                ? t('today.submitting')
                                : row.status === 'REJECTED'
                                  ? t('today.resubmit')
                                  : t('today.submit')}
                            </button>
                          </div>
                          <FileThumbs
                            files={files[row.key] || []}
                            onRemove={(i) => removeFile(row.key, i)}
                          />
                          <p className="text-[10px] text-ink-muted">
                            {row.proofRequired
                              ? t('today.needFile')
                              : t('today.needNoteOrFileHint')}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                    </>
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
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
              <select
                className="h-11 w-full sm:w-auto min-w-0 rounded-lg border border-teal-900/10 bg-white px-3 text-sm"
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
                className="h-11 w-full sm:w-auto rounded-lg border border-teal-900/10 bg-white px-3 text-sm"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {day && typeof day.totalScore === 'number' && (
            <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold">
                  {t('today.dayScore')}
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <ScoreBadge score={day.totalScore} color={day.colorStatus} />
                  <span className="text-2xl font-display text-ink">{day.totalScore}</span>
                  <span className="text-sm text-ink-muted">/ 100</span>
                </div>
              </div>
              {day.completion?.assignedTotal != null && (
                <div className="text-sm text-ink-muted">
                  {t('today.assignedProgress', {
                    done: String(day.completion.assignedDone ?? day.completion.requiredFilled ?? 0),
                    total: String(day.completion.assignedTotal ?? day.completion.requiredTotal ?? 0),
                    pct: String(day.completion.assignedPct ?? day.completion.requiredPct ?? 0),
                  })}
                </div>
              )}
              {day.blockScores && typeof day.blockScores === 'object' && (
                <div className="flex flex-wrap gap-2 ml-auto">
                  {Object.entries(day.blockScores as Record<string, number>)
                    .filter(([k]) => !k.includes('.') && !k.endsWith('_w') && !k.endsWith('_m'))
                    .map(([k, v]) => (
                      <span
                        key={k}
                        className="text-xs rounded-lg bg-teal-50 border border-teal-100 px-2 py-1 text-teal-900"
                      >
                        {k}: {v}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-teal-950/[0.05]">
            {FREQ_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFreq(id);
                  setQ('');
                  setTreeOpen({});
                  setSectionOpen({});
                  setExpandKey(null);
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
                  {statusCounts.done}
                  <span className="text-lg text-ink-muted font-sans font-semibold">
                    /{day?.assignedCount ?? 0}
                  </span>
                </p>
                <p className="text-[11px] text-ink-muted">
                  {t('today.doneOfAssigned')}
                </p>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  {t('today.leftCount').replace(
                    '{n}',
                    String(statusCounts.todo + statusCounts.review),
                  )}
                </p>
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
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sand-100 text-ink-muted px-2.5 py-1 font-semibold">
                      {t('today.statusTodo')} · {statusCounts.todo}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-900 px-2.5 py-1 font-semibold">
                      {t('today.statusReview')} · {statusCounts.review}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100 text-teal-900 px-2.5 py-1 font-semibold">
                      {t('today.statusDone')} · {statusCounts.done}
                    </span>
                    <span className="text-ink-muted ml-auto">
                      {t('today.allTasks')} · {allManagerRows.length}
                    </span>
                  </div>
                  <section className="space-y-2">
                    {renderManagerTable(allManagerRows)}
                  </section>
                </>
              )}
            </div>
          )}

          {!loading && isAdmin && (
            <div className="space-y-4">
              <div className="flex gap-1 p-1 rounded-xl bg-teal-950/[0.05] w-full sm:w-fit">
                <button
                  type="button"
                  onClick={() => setAdminTab('assign')}
                  className={cn(
                    'flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-semibold min-h-11',
                    adminTab === 'assign' ? 'bg-white text-teal-900 shadow-sm' : 'text-ink-muted',
                  )}
                >
                  {t('today.assignTitle')}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('results')}
                  className={cn(
                    'flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-semibold min-h-11',
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
                    (day?.tree || []).map((n: TreeNode, i: number) =>
                      renderAssignTree(n, 0, i),
                    )}
                </div>
              )}

              {adminTab === 'results' && (
                <div className="space-y-5">
                  <p className="text-xs text-ink-muted">{t('today.resultsHint')}</p>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">
                      {t('today.doneList')} · {completed.length}
                    </h2>
                    {renderTaskTable(completed, 'readonly')}
                  </section>
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
                </div>
              )}
            </div>
          )}

          {!loading && !branches.length && (
            <p className="text-center text-sm text-ink-muted py-8">{t('today.noBranchHint')}</p>
          )}
        </div>

        {aiCoach && (
          <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-teal-100 p-5 space-y-3 max-h-[85vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold">
                    {t('today.aiCoachTitle')}
                  </p>
                  <p className="font-display text-xl text-ink mt-1">
                    {aiCoach.quality === 'excellent'
                      ? '🌟'
                      : aiCoach.quality === 'good'
                        ? '✅'
                        : aiCoach.quality === 'weak'
                          ? '⚠️'
                          : '❌'}{' '}
                    {aiCoach.summary}
                  </p>
                </div>
                <button
                  type="button"
                  className="p-1 text-ink-muted"
                  onClick={() => setAiCoach(null)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {aiCoach.praise && (
                <p className="text-sm text-teal-900 bg-teal-50 rounded-xl p-3">{aiCoach.praise}</p>
              )}
              {aiCoach.issues?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted mb-1">
                    {t('today.aiCoachIssues')}
                  </p>
                  <ul className="text-sm space-y-1 list-disc pl-5">
                    {aiCoach.issues.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiCoach.nextActions?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted mb-1">
                    {t('today.aiCoachActions')}
                  </p>
                  <ul className="text-sm space-y-1 list-disc pl-5">
                    {aiCoach.nextActions.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiCoach.incompleteHint && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm">
                  <p className="text-xs font-semibold text-amber-900 mb-1">
                    {t('today.aiCoachNext')}
                  </p>
                  <p>{aiCoach.incompleteHint}</p>
                </div>
              )}
              <button
                type="button"
                className="w-full h-11 rounded-xl bg-teal-800 text-white text-sm font-semibold"
                onClick={() => setAiCoach(null)}
              >
                {t('today.aiCoachClose')}
              </button>
            </div>
          </div>
        )}

        {proofPreview && (
          <div
            className="fixed inset-0 z-[90] bg-black/80 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label={proofPreview.name}
          >
            <div className="flex items-center justify-between gap-3 px-3 py-3 safe-pad shrink-0 bg-black/40">
              <p className="text-sm text-white/90 truncate flex-1 min-w-0">{proofPreview.name}</p>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={proofPreview.url}
                  download={proofPreview.name}
                  className="h-10 px-3 rounded-lg bg-white/15 text-white text-xs font-semibold inline-flex items-center"
                >
                  {t('today.downloadProof')}
                </a>
                <button
                  type="button"
                  onClick={closeProofPreview}
                  className="h-10 w-10 rounded-lg bg-white/15 text-white grid place-items-center"
                  aria-label={t('common.close')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div
              className="flex-1 overflow-auto flex items-center justify-center p-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
              onClick={closeProofPreview}
            >
              {proofPreview.mime.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proofPreview.url}
                  alt={proofPreview.name}
                  className="max-w-full max-h-full object-contain rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : proofPreview.mime === 'application/pdf' ? (
                <iframe
                  title={proofPreview.name}
                  src={proofPreview.url}
                  className="w-full h-full min-h-[70vh] rounded-lg bg-white"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className="rounded-2xl bg-white p-6 text-center space-y-3 max-w-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm text-ink">{proofPreview.name}</p>
                  <a
                    href={proofPreview.url}
                    download={proofPreview.name}
                    className="inline-flex h-11 px-4 rounded-xl bg-teal-800 text-white text-sm font-semibold items-center justify-center"
                  >
                    {t('today.downloadProof')}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </AppShell>
    </RoleGate>
  );
}
