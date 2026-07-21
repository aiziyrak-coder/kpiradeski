'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { api, getToken } from '@/lib/api';
import { todayISO } from '@/types';
import { cn } from '@/lib/utils';
import { Building2, ChevronLeft, Upload, Check, RotateCcw } from 'lucide-react';

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

type CatalogNode = {
  key: string;
  title: string;
  inputType: string;
  frequency: Freq;
  proofRequired: boolean;
  children?: CatalogNode[];
};

type Task = {
  key: string;
  titleUz: string;
  titleRu: string;
  inputType: string;
  proofRequired: boolean;
  hasChildren: boolean;
  done: boolean;
  score: number | null;
  aiStatus: string | null;
  aiNote: string | null;
  aiFeedback: string | null;
  aiAction: string | null;
  aiPenalty: number;
  entry: any;
};

const FREQ_TABS: { id: Freq; uz: string; ru: string }[] = [
  { id: 'DAILY', uz: 'Kunlik', ru: 'Ежедневно' },
  { id: 'WEEKLY', uz: 'Haftalik', ru: 'Еженедельно' },
  { id: 'MONTHLY', uz: 'Oylik', ru: 'Ежемесячно' },
];

export default function TodayPage() {
  const toast = useToast();
  const { lang } = useI18n();
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState('');
  const [freq, setFreq] = useState<Freq>('DAILY');
  const [date] = useState(todayISO());
  const [catalog, setCatalog] = useState<CatalogNode[]>([]);
  const [day, setDay] = useState<any>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const loadBranches = useCallback(async () => {
    const list = await api<any[]>('/branches/mine');
    setBranches(list);
    if (!branchId && list[0]) setBranchId(list[0].id);
  }, [branchId]);

  const loadCatalog = useCallback(async () => {
    const tree = await api<CatalogNode[]>(
      `/manager-kpi/catalog?lang=${lang}&frequency=${freq}`,
    );
    setCatalog(tree);
  }, [lang, freq]);

  const loadDay = useCallback(async () => {
    if (!branchId) return;
    const d = await api(
      `/manager-kpi/day?branchId=${branchId}&date=${date}&frequency=${freq}`,
    );
    setDay(d);
  }, [branchId, date, freq]);

  useEffect(() => {
    loadBranches().catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    loadCatalog().catch(() => {});
    setActiveKey(null);
    setPath([]);
  }, [freq, lang]);

  useEffect(() => {
    loadDay().catch((e) => toast.error(e.message));
  }, [branchId, freq, date]);

  const titleOf = (t: { titleUz: string; titleRu: string } | CatalogNode) =>
    'title' in t && t.title
      ? t.title
      : lang === 'ru'
        ? (t as any).titleRu
        : (t as any).titleUz;

  const findNode = useCallback(
    (nodes: CatalogNode[], key: string): CatalogNode | null => {
      for (const n of nodes) {
        if (n.key === key) return n;
        if (n.children?.length) {
          const f = findNode(n.children, key);
          if (f) return f;
        }
      }
      return null;
    },
    [],
  );

  const activeNode = activeKey ? findNode(catalog, activeKey) : null;
  const displayNodes = useMemo(() => {
    if (!activeKey) return catalog;
    if (!activeNode) return catalog;
    if (activeNode.children?.length) return activeNode.children;
    return [activeNode];
  }, [activeKey, activeNode, catalog]);

  const tasks: Task[] = day?.tasks || day?.columns || [];
  const taskMap = Object.fromEntries(tasks.map((t: Task) => [t.key, t]));

  async function saveValue(nodeKey: string, value: any, done?: boolean) {
    if (!branchId) return;
    setBusy(true);
    try {
      await api('/manager-kpi/entry', {
        method: 'POST',
        body: JSON.stringify({ branchId, date, nodeKey, value, done }),
      });
      await loadDay();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadProof(nodeKey: string, file: File) {
    if (!branchId) return;
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
      if (!res.ok) throw new Error(data.message || 'Yuklash xatosi');
      if (data.aiStatus === 'REJECTED') {
        toast.error(data.aiNote || data.aiFeedback || 'AI rad etdi');
      } else {
        toast.success(data.aiNote || 'AI tasdiqladi');
      }
      await loadDay();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const branch = branches.find((b) => b.id === branchId);
  const showBranchPicker = !branchId || branches.length > 1;

  return (
    <RoleGate allow={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <AppShell>
        <div className="max-w-3xl mx-auto space-y-5 pb-24">
          {/* Filiallar */}
          {(!branchId || (showBranchPicker && !activeKey)) && (
            <section className="space-y-3">
              <h1 className="font-display text-2xl text-ink tracking-tight">Filiallar</h1>
              <div className="grid gap-2">
                {branches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setBranchId(b.id);
                      setActiveKey(null);
                      setPath([]);
                    }}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition',
                      branchId === b.id
                        ? 'border-teal-600 bg-teal-50/80'
                        : 'border-black/8 bg-white hover:border-teal-300',
                    )}
                  >
                    <span className="grid place-items-center w-10 h-10 rounded-xl bg-teal-900 text-white">
                      <Building2 className="w-5 h-5" />
                    </span>
                    <span className="font-medium text-ink">{b.name}</span>
                  </button>
                ))}
                {!branches.length && (
                  <p className="text-sm text-ink-muted">Filial biriktirilmagan</p>
                )}
              </div>
            </section>
          )}

          {branchId && (
            <>
              {/* Header */}
              <div className="flex items-end justify-between gap-3">
                <div>
                  {activeKey ? (
                    <button
                      type="button"
                      onClick={() => {
                        const next = path.slice(0, -1);
                        setPath(next);
                        setActiveKey(next[next.length - 1] || null);
                      }}
                      className="inline-flex items-center gap-1 text-sm text-teal-800 mb-1"
                    >
                      <ChevronLeft className="w-4 h-4" /> Orqaga
                    </button>
                  ) : null}
                  <h1 className="font-display text-2xl text-ink tracking-tight">
                    {activeNode ? titleOf(activeNode) : branch?.name || 'Ishlar'}
                  </h1>
                  {!activeKey && (
                    <p className="text-sm tabular-nums text-ink-muted mt-0.5">
                      {day?.totalScore != null ? `${day.totalScore}%` : '—'}
                      {day?.completion
                        ? ` · ${day.completion.requiredFilled}/${day.completion.requiredTotal}`
                        : ''}
                    </p>
                  )}
                </div>
                {branches.length > 1 && !activeKey && (
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
                )}
              </div>

              {/* Frequency */}
              {!activeKey && (
                <div className="flex gap-1 p-1 rounded-2xl bg-black/[0.04]">
                  {FREQ_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFreq(t.id)}
                      className={cn(
                        'flex-1 rounded-xl py-2 text-sm font-medium transition',
                        freq === t.id
                          ? 'bg-white text-teal-900 shadow-sm'
                          : 'text-ink-muted',
                      )}
                    >
                      {lang === 'ru' ? t.ru : t.uz}
                    </button>
                  ))}
                </div>
              )}

              {/* Root task list */}
              {!activeKey && (
                <ul className="space-y-2">
                  {tasks.map((task) => {
                    const title = lang === 'ru' ? task.titleRu : task.titleUz;
                    const rejected = task.aiStatus === 'REJECTED';
                    const approved = task.aiStatus === 'APPROVED';
                    return (
                      <li
                        key={task.key}
                        className="rounded-2xl border border-black/8 bg-white overflow-hidden"
                      >
                        <button
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                          onClick={() => {
                            if (task.hasChildren || task.inputType === 'GROUP') {
                              setActiveKey(task.key);
                              setPath([task.key]);
                            }
                          }}
                        >
                          <StatusDot
                            done={task.done}
                            approved={approved}
                            rejected={rejected}
                          />
                          <span className="flex-1 font-medium text-ink">{title}</span>
                          {task.aiPenalty > 0 && (
                            <span className="text-xs text-rose-700">−{task.aiPenalty}</span>
                          )}
                          {task.score != null && (
                            <span className="text-sm tabular-nums text-teal-800">
                              {task.score}%
                            </span>
                          )}
                        </button>

                        {!task.hasChildren && task.inputType !== 'GROUP' && (
                          <TaskActions
                            task={task}
                            busy={busy}
                            onSave={(v, d) => saveValue(task.key, v, d)}
                            onUpload={(f) => uploadProof(task.key, f)}
                          />
                        )}

                        {(task.aiFeedback || task.aiNote) && (
                          <p
                            className={cn(
                              'px-4 pb-3 text-xs',
                              rejected ? 'text-rose-700' : 'text-ink-muted',
                            )}
                          >
                            {task.aiFeedback || task.aiNote}
                            {task.aiAction === 'RESUBMIT' ? ' · Qayta yuklang' : ''}
                          </p>
                        )}
                      </li>
                    );
                  })}
                  {!tasks.length && (
                    <li className="text-sm text-ink-muted px-1">Vazifa yoʻq</li>
                  )}
                </ul>
              )}

              {/* Nested drill */}
              {activeKey && (
                <ul className="space-y-2">
                  {displayNodes.map((node) => {
                    const entry = day?.entries?.[node.key];
                    const proof = entry?.proofs?.[0];
                    const hasKids = !!node.children?.length;
                    return (
                      <li
                        key={node.key}
                        className="rounded-2xl border border-black/8 bg-white overflow-hidden"
                      >
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <StatusDot
                            done={!!entry?.done}
                            approved={proof?.aiStatus === 'APPROVED'}
                            rejected={proof?.aiStatus === 'REJECTED'}
                          />
                          <button
                            type="button"
                            className="flex-1 text-left font-medium text-ink"
                            onClick={() => {
                              if (hasKids) {
                                setActiveKey(node.key);
                                setPath((p) => [...p, node.key]);
                              }
                            }}
                          >
                            {titleOf(node)}
                          </button>
                          {entry?.score != null && (
                            <span className="text-sm tabular-nums text-teal-800">
                              {entry.score}%
                            </span>
                          )}
                        </div>
                        {!hasKids && (
                          <LeafEditor
                            node={node}
                            entry={entry}
                            busy={busy}
                            onSave={(v, d) => saveValue(node.key, v, d)}
                            onUpload={(f) => uploadProof(node.key, f)}
                          />
                        )}
                        {(proof?.aiFeedback || proof?.aiNote) && (
                          <p
                            className={cn(
                              'px-4 pb-3 text-xs',
                              proof?.aiStatus === 'REJECTED'
                                ? 'text-rose-700'
                                : 'text-ink-muted',
                            )}
                          >
                            {proof.aiFeedback || proof.aiNote}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </AppShell>
    </RoleGate>
  );
}

function StatusDot({
  done,
  approved,
  rejected,
}: {
  done: boolean;
  approved: boolean;
  rejected: boolean;
}) {
  return (
    <span
      className={cn(
        'w-2.5 h-2.5 rounded-full shrink-0',
        rejected && 'bg-rose-500',
        !rejected && approved && 'bg-emerald-500',
        !rejected && !approved && done && 'bg-amber-400',
        !rejected && !approved && !done && 'bg-black/15',
      )}
    />
  );
}

function TaskActions({
  task,
  busy,
  onSave,
  onUpload,
}: {
  task: Task;
  busy: boolean;
  onSave: (v: any, d?: boolean) => void;
  onUpload: (f: File) => void;
}) {
  return (
    <div className="px-4 pb-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3">
      {task.inputType === 'CHECKBOX' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(true, true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-900 text-white text-sm px-3 py-2"
        >
          <Check className="w-4 h-4" /> Bajardim
        </button>
      )}
      {(task.proofRequired || task.aiStatus === 'REJECTED') && (
        <label className="inline-flex items-center gap-1.5 rounded-xl border border-teal-700/30 text-teal-900 text-sm px-3 py-2 cursor-pointer">
          {task.aiStatus === 'REJECTED' ? (
            <RotateCcw className="w-4 h-4" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {task.aiStatus === 'REJECTED' ? 'Qayta yuklash' : 'Dalil'}
          <input
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}

function LeafEditor({
  node,
  entry,
  busy,
  onSave,
  onUpload,
}: {
  node: CatalogNode;
  entry: any;
  busy: boolean;
  onSave: (v: any, d?: boolean) => void;
  onUpload: (f: File) => void;
}) {
  const [calls, setCalls] = useState(Number(entry?.value?.calls ?? 0));
  const [booked, setBooked] = useState(Number(entry?.value?.booked ?? 0));
  const [count, setCount] = useState(Number(entry?.value?.count ?? 0));
  const [note, setNote] = useState(String(entry?.value?.note ?? ''));
  const checked = !!(entry?.value === true || entry?.value?.checked || entry?.done);
  const rejected = entry?.proofs?.[0]?.aiStatus === 'REJECTED';

  useEffect(() => {
    setCalls(Number(entry?.value?.calls ?? 0));
    setBooked(Number(entry?.value?.booked ?? 0));
    setCount(Number(entry?.value?.count ?? 0));
    setNote(String(entry?.value?.note ?? ''));
  }, [entry]);

  return (
    <div className="px-4 pb-3 space-y-2 border-t border-black/5 pt-3">
      {node.inputType === 'CHECKBOX' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(!checked, !checked)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl text-sm px-3 py-2',
            checked ? 'bg-emerald-600 text-white' : 'bg-teal-900 text-white',
          )}
        >
          <Check className="w-4 h-4" /> {checked ? 'Bajarildi' : 'Bajardim'}
        </button>
      )}
      {node.inputType === 'RATIO' && (
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs text-ink-muted">
            Qoʻngʻiroq
            <input
              type="number"
              className="mt-1 block w-24 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
              value={calls}
              onChange={(e) => setCalls(Number(e.target.value))}
            />
          </label>
          <label className="text-xs text-ink-muted">
            Yozilgan
            <input
              type="number"
              className="mt-1 block w-24 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
              value={booked}
              onChange={(e) => setBooked(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            className="rounded-xl bg-teal-900 text-white text-sm px-3 py-2"
            onClick={() => onSave({ calls, booked }, calls > 0)}
          >
            Saqlash
          </button>
        </div>
      )}
      {node.inputType === 'NUMBER' && (
        <div className="flex gap-2 items-end">
          <input
            type="number"
            className="w-28 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <button
            type="button"
            disabled={busy}
            className="rounded-xl bg-teal-900 text-white text-sm px-3 py-2"
            onClick={() => onSave({ count }, count > 0)}
          >
            Saqlash
          </button>
        </div>
      )}
      {node.inputType === 'NOTE_CHECK' && (
        <div className="space-y-2">
          <input
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            placeholder="Izoh"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            className="rounded-xl bg-teal-900 text-white text-sm px-3 py-2"
            onClick={() => onSave({ note, checked: true }, true)}
          >
            Bajardim
          </button>
        </div>
      )}
      {(node.proofRequired || rejected) && (
        <label className="inline-flex items-center gap-1.5 rounded-xl border border-teal-700/30 text-teal-900 text-sm px-3 py-2 cursor-pointer">
          {rejected ? <RotateCcw className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
          {rejected ? 'Qayta yuklash' : 'Dalil'}
          <input
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}
