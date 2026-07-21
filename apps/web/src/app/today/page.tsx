'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader, Textarea, ScoreBadge } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { api, getToken } from '@/lib/api';
import { todayISO } from '@/types';
import { cn } from '@/lib/utils';

type CatalogNode = {
  key: string;
  title: string;
  description?: string | null;
  inputType: string;
  weight: number;
  proofRequired: boolean;
  children?: CatalogNode[];
};

export default function TodayPage() {
  const toast = useToast();
  const { lang, t } = useI18n();
  const [date, setDate] = useState(todayISO());
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState('');
  const [catalog, setCatalog] = useState<CatalogNode[]>([]);
  const [day, setDay] = useState<any>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [path, setPath] = useState<string[]>([]);

  const loadBranches = useCallback(async () => {
    const list = await api<any[]>('/branches/mine');
    setBranches(list);
    if (!branchId && list[0]) setBranchId(list[0].id);
  }, [branchId]);

  const loadCatalog = useCallback(async () => {
    const tree = await api<CatalogNode[]>(`/manager-kpi/catalog?lang=${lang}`);
    setCatalog(tree);
  }, [lang]);

  const loadDay = useCallback(async () => {
    if (!branchId) return;
    const d = await api(`/manager-kpi/day?branchId=${branchId}&date=${date}`);
    setDay(d);
  }, [branchId, date]);

  useEffect(() => {
    loadBranches().catch((e) => toast.error(e.message));
    loadCatalog().catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    loadCatalog().catch(() => {});
  }, [lang]);

  useEffect(() => {
    loadDay().catch((e) => toast.error(e.message));
  }, [branchId, date]);

  const activeNode = useMemo(() => {
    if (!activeKey) return null;
    const find = (nodes: CatalogNode[], key: string): CatalogNode | null => {
      for (const n of nodes) {
        if (n.key === key) return n;
        if (n.children?.length) {
          const f = find(n.children, key);
          if (f) return f;
        }
      }
      return null;
    };
    return find(catalog, activeKey);
  }, [catalog, activeKey]);

  const displayNodes = useMemo(() => {
    if (!activeKey) return catalog;
    if (!activeNode) return catalog;
    if (activeNode.children?.length) return activeNode.children;
    return [activeNode];
  }, [activeKey, activeNode, catalog]);

  function openColumn(key: string) {
    setActiveKey(key);
    setPath([key]);
  }

  function drillInto(key: string) {
    setActiveKey(key);
    setPath((p) => [...p, key]);
  }

  function goBack() {
    setPath((p) => {
      const next = p.slice(0, -1);
      setActiveKey(next[next.length - 1] || null);
      return next;
    });
  }

  async function saveValue(nodeKey: string, value: any, done?: boolean) {
    setSaving(true);
    try {
      await api('/manager-kpi/entry', {
        method: 'POST',
        body: JSON.stringify({ branchId, date, nodeKey, value, done }),
      });
      toast.success(t('common.saved'));
      await loadDay();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadProof(nodeKey: string, file: File) {
    setSaving(true);
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Yuklanmadi');
      toast.success(
        json.aiStatus === 'APPROVED'
          ? 'Dalil AI tasdiqladi'
          : json.aiStatus === 'REJECTED'
            ? 'AI rad etdi'
            : 'Dalil yuklandi',
        json.aiNote,
      );
      await loadDay();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const entryOf = (key: string) => day?.entries?.[key];

  return (
    <AppShell>
      <RoleGate allow={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
        <SectionHeader
          eyebrow="Manager KPI"
          title="Kunlik vazifalar"
          description="Tayyor vazifalar — filial boʻyicha. Dalil yuklang, AI avtomatik tekshiradi."
          action={
            <div className="flex flex-wrap gap-2 items-center">
              <select
                className="h-11 px-3 rounded-xl border border-teal-200 bg-white text-sm"
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
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 px-3 rounded-xl border border-teal-200 bg-white text-sm"
              />
            </div>
          }
        />

        {!branchId ? (
          <p className="text-ink-muted p-8 text-center border border-dashed border-teal-200 rounded-3xl">
            Sizga filial biriktirilmagan. Admin dan soʻrang.
          </p>
        ) : (
          <>
            <div className="mb-5 grid sm:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-teal-800 to-teal-900 text-white p-4">
                <p className="text-teal-100/80 text-xs uppercase tracking-wider">Yakuniy baho</p>
                <p className="font-display text-4xl mt-1">
                  {day?.totalScore != null ? `${Number(day.totalScore).toFixed(0)}%` : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-teal-100 bg-white/80 p-4">
                <p className="text-xs text-ink-muted uppercase tracking-wider">Toʻldirilish</p>
                <p className="font-display text-4xl mt-1 text-teal-800">
                  {day?.completion
                    ? `${day.completion.requiredFilled}/${day.completion.requiredTotal}`
                    : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-teal-100 bg-white/80 p-4 flex items-center">
                {day?.totalScore != null ? (
                  <ScoreBadge score={day.totalScore} color={day.colorStatus} />
                ) : (
                  <p className="text-ink-muted text-sm">Hali ball yoʻq</p>
                )}
              </div>
            </div>

            {!activeKey ? (
              <div className="overflow-x-auto rounded-3xl border border-teal-100 bg-white/90 shadow-soft">
                <table className="w-full text-sm min-w-[1100px]">
                  <thead>
                    <tr className="text-left border-b border-teal-50 bg-teal-50/50">
                      {(day?.columns || catalog).map((c: any) => (
                        <th key={c.key} className="p-3 font-semibold text-teal-900 whitespace-nowrap">
                          {c.title || c.titleUz}
                        </th>
                      ))}
                      <th className="p-3 font-semibold text-teal-900">Yakuniy</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {(day?.columns || catalog).map((c: any) => {
                        const e = entryOf(c.key);
                        return (
                          <td key={c.key} className="p-2 align-top border-b border-teal-50">
                            <button
                              type="button"
                              onClick={() => openColumn(c.key)}
                              className={cn(
                                'w-full min-h-14 rounded-xl border px-2 py-2 text-left transition',
                                e?.done
                                  ? 'border-emerald-200 bg-emerald-50'
                                  : 'border-teal-100 hover:border-teal-300 bg-white',
                              )}
                            >
                              <span className="block text-xs text-ink-muted truncate">
                                {c.inputType}
                              </span>
                              <span className="font-semibold tabular-nums">
                                {e?.score != null ? `${e.score}%` : e?.done ? '✓' : '—'}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                      <td className="p-3 font-display text-2xl text-teal-800">
                        {day?.totalScore != null ? `${Number(day.totalScore).toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Button variant="secondary" onClick={goBack}>
                    ← Orqaga
                  </Button>
                  <h3 className="font-display text-2xl">{activeNode?.title}</h3>
                </div>

                <div className="space-y-3">
                  {displayNodes.map((node) => (
                    <NodeCard
                      key={node.key}
                      node={node}
                      entry={entryOf(node.key)}
                      saving={saving}
                      onDrill={() => drillInto(node.key)}
                      onSave={(value, done) => saveValue(node.key, value, done)}
                      onProof={(file) => uploadProof(node.key, file)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </RoleGate>
    </AppShell>
  );
}

function NodeCard({
  node,
  entry,
  saving,
  onDrill,
  onSave,
  onProof,
}: {
  node: CatalogNode;
  entry: any;
  saving: boolean;
  onDrill: () => void;
  onSave: (value: any, done?: boolean) => void;
  onProof: (file: File) => void;
}) {
  const [calls, setCalls] = useState(Number(entry?.value?.calls ?? 0));
  const [booked, setBooked] = useState(Number(entry?.value?.booked ?? 0));
  const [count, setCount] = useState(Number(entry?.value?.count ?? entry?.value ?? 0));
  const [note, setNote] = useState(String(entry?.value?.note ?? ''));
  const [checked, setChecked] = useState(!!(entry?.value === true || entry?.value?.checked || entry?.done));

  useEffect(() => {
    setCalls(Number(entry?.value?.calls ?? 0));
    setBooked(Number(entry?.value?.booked ?? 0));
    setCount(Number(entry?.value?.count ?? (typeof entry?.value === 'number' ? entry.value : 0)));
    setNote(String(entry?.value?.note ?? ''));
    setChecked(!!(entry?.value === true || entry?.value?.checked || entry?.done));
  }, [entry]);

  const hasChildren = (node.children?.length || 0) > 0;

  return (
    <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-semibold">{node.title}</p>
          {node.description && <p className="text-xs text-ink-muted mt-0.5">{node.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {entry?.score != null && <span className="text-sm tabular-nums text-teal-800">{entry.score}%</span>}
          {entry?.proofs?.[0] && (
            <span
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-semibold',
                entry.proofs[0].aiStatus === 'APPROVED' && 'bg-emerald-100 text-emerald-800',
                entry.proofs[0].aiStatus === 'REJECTED' && 'bg-rose-100 text-rose-800',
                entry.proofs[0].aiStatus === 'PENDING' && 'bg-amber-100 text-amber-900',
              )}
            >
              AI: {entry.proofs[0].aiStatus}
            </span>
          )}
        </div>
      </div>

      {hasChildren && (
        <Button variant="secondary" onClick={onDrill} className="w-full">
          Ichki vazifalar ({node.children!.length}) →
        </Button>
      )}

      {!hasChildren && node.inputType === 'CHECKBOX' && (
        <label className="flex items-center gap-3 min-h-12">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              setChecked(e.target.checked);
              onSave(e.target.checked, e.target.checked);
            }}
            className="w-5 h-5"
          />
          <span>Bajarildi</span>
        </label>
      )}

      {!hasChildren && node.inputType === 'RATIO' && (
        <div className="grid sm:grid-cols-3 gap-2">
          <Input label="Qoʻngʻiroqlar" type="number" min={0} value={calls} onChange={(e) => setCalls(Number(e.target.value))} />
          <Input label="Yozilganlar" type="number" min={0} value={booked} onChange={(e) => setBooked(Number(e.target.value))} />
          <Button
            disabled={saving}
            className="self-end min-h-11"
            onClick={() => onSave({ calls, booked }, calls > 0)}
          >
            Saqlash
          </Button>
        </div>
      )}

      {!hasChildren && node.inputType === 'NUMBER' && (
        <div className="flex gap-2 items-end">
          <Input
            label="Soni"
            type="number"
            min={0}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="flex-1"
          />
          <Button disabled={saving} onClick={() => onSave({ count }, count > 0)}>
            Saqlash
          </Button>
        </div>
      )}

      {!hasChildren && node.inputType === 'NOTE_CHECK' && (
        <div className="space-y-2">
          <Textarea label="Izoh" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            Bajarildi
          </label>
          <Button
            disabled={saving}
            onClick={() => onSave({ note, checked }, checked || !!note)}
          >
            Saqlash
          </Button>
        </div>
      )}

      {node.proofRequired && !hasChildren && (
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Dalil (foto)</label>
          <input
            type="file"
            accept="image/*,application/pdf"
            disabled={saving}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onProof(f);
              e.target.value = '';
            }}
            className="block w-full text-sm"
          />
          {entry?.proofs?.[0]?.aiNote && (
            <p className="text-xs text-ink-muted mt-1">{entry.proofs[0].aiNote}</p>
          )}
        </div>
      )}
    </div>
  );
}
