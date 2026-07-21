'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { ChecklistForm } from '@/components/ChecklistForm';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader, ScoreBadge, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { todayISO, type ChecklistItemMeta } from '@/types';
import { cn } from '@/lib/utils';

const LABELS: Record<string, string> = {
  clinic: 'Klinika',
  reception: 'Retsepshn',
  calls: 'Qoʻngʻiroqlar',
  uniform: 'Uniforma',
  warehouse: 'Ombor',
};

export default function TodayPage() {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [meta, setMeta] = useState<any>(null);
  const [day, setDay] = useState<any>(null);
  const [tab, setTab] = useState<'clinic' | 'reception' | 'uniform' | 'warehouse' | 'calls' | 'reviews'>('clinic');
  const [saving, setSaving] = useState(false);
  const [callForms, setCallForms] = useState<Record<string, any>>({
    NEW: { callsCount: 0, bookedCount: 0 },
    REPEAT: { callsCount: 0, bookedCount: 0 },
    MISSED: { callsCount: 0, bookedCount: 0, recalledCount: 0 },
  });
  const [review, setReview] = useState({
    count: 1,
    source: 'QR',
    quality: 'POSITIVE',
    note: '',
  });

  async function load() {
    try {
      const [m, d] = await Promise.all([api('/kpi/meta'), api(`/kpi/day?date=${date}`)]);
      setMeta(m);
      setDay(d);
      const next = {
        NEW: { callsCount: 0, bookedCount: 0 },
        REPEAT: { callsCount: 0, bookedCount: 0 },
        MISSED: { callsCount: 0, bookedCount: 0, recalledCount: 0 },
      };
      for (const c of d.calls || []) {
        next[c.type as keyof typeof next] = {
          callsCount: c.callsCount,
          bookedCount: c.bookedCount,
          recalledCount: c.recalledCount || 0,
        };
      }
      setCallForms(next);
    } catch (e: any) {
      toast.error('Yuklanmadi', e.message);
    }
  }

  useEffect(() => {
    load();
  }, [date]);

  async function saveChecklist(kind: string, items: Record<string, boolean>) {
    setSaving(true);
    try {
      await api(`/kpi/${kind}`, { method: 'POST', body: JSON.stringify({ date, items }) });
      toast.success('Saqlandi');
      await load();
    } catch (e: any) {
      toast.error('Saqlanmadi', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveCall(type: string) {
    const f = callForms[type];
    if (!f) return;
    if (type !== 'MISSED' && Number(f.bookedCount) > Number(f.callsCount)) {
      toast.error('Yozilganlar qoʻngʻiroqlardan koʻp boʻlishi mumkin emas');
      return;
    }
    if (
      type === 'MISSED' &&
      (f as any).recalledCount != null &&
      Number(f.bookedCount) > Number((f as any).recalledCount)
    ) {
      toast.error('Yozilganlar qayta qoʻngʻiroqlardan koʻp boʻlishi mumkin emas');
      return;
    }
    setSaving(true);
    try {
      await api('/kpi/calls', {
        method: 'POST',
        body: JSON.stringify({ date, type, ...f }),
      });
      toast.success('Qoʻngʻiroq saqlandi');
      await load();
    } catch (e: any) {
      toast.error('Saqlanmadi', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveReview() {
    setSaving(true);
    try {
      await api('/kpi/reviews', { method: 'POST', body: JSON.stringify({ date, ...review }) });
      toast.success('Sharh qoʻshildi');
      setReview((r) => ({ ...r, note: '', count: 1 }));
      await load();
    } catch (e: any) {
      toast.error('Saqlanmadi', e.message);
    } finally {
      setSaving(false);
    }
  }

  const completion = day?.completion || day?.score?.completion;
  const incomplete: string[] = completion?.incomplete || [];

  const tabs = [
    { key: 'clinic' as const, label: '1. Klinika' },
    { key: 'reception' as const, label: '2. Retsepshn' },
    { key: 'uniform' as const, label: '3. Uniforma' },
    { key: 'warehouse' as const, label: '4. Ombor' },
    { key: 'calls' as const, label: '5. Qoʻngʻiroq' },
    { key: 'reviews' as const, label: '6. Sharh' },
  ];

  return (
    <AppShell>
      <RoleGate allow={['ADMIN', 'MANAGER']}>
        <SectionHeader
          eyebrow="Kunlik ish"
          title="Bugungi KPI"
          description="Bitta sahifa — barcha majburiy kunlik kiritish. 5 daqiqada yakunlang."
          action={
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 px-3 rounded-xl border border-teal-200 bg-white text-sm"
            />
          }
        />

        <div className="mb-5 grid sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-teal-800 to-teal-900 text-white p-4">
            <p className="text-teal-100/80 text-xs uppercase tracking-wider">Umumiy ball</p>
            <p className="font-display text-4xl mt-1">
              {day?.score ? Number(day.score.totalScore).toFixed(1) : '—'}%
            </p>
          </div>
          <div className="rounded-2xl border border-teal-100 bg-white/80 p-4">
            <p className="text-xs text-ink-muted uppercase tracking-wider">Majburiy toʻldirish</p>
            <p className="font-display text-4xl mt-1 text-teal-800">
              {completion ? `${completion.requiredFilled}/${completion.requiredTotal}` : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-teal-100 bg-white/80 p-4">
            <p className="text-xs text-ink-muted mb-2">Holat</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(LABELS).map((k) => {
                const ok = completion?.filled?.[k];
                return (
                  <span
                    key={k}
                    className={cn(
                      'text-[11px] px-2 py-1 rounded-full border',
                      ok
                        ? 'bg-emerald-50 border-emerald-200 text-status-green'
                        : 'bg-rose-50 border-rose-100 text-status-red',
                    )}
                  >
                    {LABELS[k]}
                  </span>
                );
              })}
            </div>
            {incomplete.length > 0 && (
              <p className="text-xs text-status-red mt-2">
                Qolgan: {incomplete.map((k) => LABELS[k] || k).join(', ')}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'shrink-0 px-3 py-2 rounded-xl text-sm font-medium border transition',
                tab === t.key
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white border-teal-100 text-ink-soft hover:border-teal-300',
              )}
            >
              {t.label}
              {completion?.filled?.[t.key === 'calls' ? 'calls' : t.key === 'reviews' ? 'reviews' : t.key] ? (
                <span className="ml-1">✓</span>
              ) : null}
            </button>
          ))}
        </div>

        {!meta ? (
          <p className="text-ink-muted">Yuklanmoqda...</p>
        ) : (
          <>
            {tab === 'clinic' && (
              <ChecklistForm
                title="Klinika koʻrigi"
                description="9 punkt"
                items={meta.clinic as ChecklistItemMeta[]}
                initial={day?.clinic?.items}
                percentage={day?.clinic?.percentage}
                saving={saving}
                onSave={(items) => saveChecklist('clinic', items)}
              />
            )}
            {tab === 'reception' && (
              <ChecklistForm
                title="Retsepshn"
                description="5 punkt"
                items={meta.reception as ChecklistItemMeta[]}
                initial={day?.reception?.items}
                percentage={day?.reception?.percentage}
                saving={saving}
                onSave={(items) => saveChecklist('reception', items)}
              />
            )}
            {tab === 'uniform' && (
              <ChecklistForm
                title="Uniforma"
                items={meta.uniform as ChecklistItemMeta[]}
                initial={day?.uniform?.items}
                percentage={day?.uniform?.percentage}
                saving={saving}
                onSave={(items) => saveChecklist('uniform', items)}
              />
            )}
            {tab === 'warehouse' && (
              <div className="space-y-3">
                <ChecklistForm
                  title="Ombor chek-list"
                  items={meta.warehouse as ChecklistItemMeta[]}
                  initial={day?.warehouse?.items}
                  percentage={day?.warehouse?.percentage}
                  saving={saving}
                  onSave={(items) => saveChecklist('warehouse', items)}
                />
                <Link href="/warehouse" className="text-sm text-teal-700 underline">
                  Zaxira miqdorini tahrirlash →
                </Link>
              </div>
            )}
            {tab === 'calls' && (
              <div className="grid lg:grid-cols-3 gap-4">
                {(
                  [
                    { key: 'NEW', label: 'Yangi bemorlar', target: 100 },
                    { key: 'REPEAT', label: 'Takroriy' },
                    { key: 'MISSED', label: 'Oʻtkazib yuborilgan', missed: true },
                  ] as const
                ).map((t) => {
                  const f = callForms[t.key];
                  const existing = (day?.calls || []).find((c: any) => c.type === t.key);
                  return (
                    <div key={t.key} className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-3">
                      <div className="flex justify-between">
                        <h3 className="font-display text-xl">{t.label}</h3>
                        {existing && <ScoreBadge score={existing.conversion} />}
                      </div>
                      <Input
                        label={'missed' in t && t.missed ? 'Oʻtkazib yuborilgan soni' : 'Qoʻngʻiroqlar soni'}
                        type="number"
                        min={0}
                        value={f.callsCount}
                        onChange={(e) =>
                          setCallForms((s) => ({
                            ...s,
                            [t.key]: { ...s[t.key], callsCount: Number(e.target.value) },
                          }))
                        }
                      />
                      {'missed' in t && t.missed && (
                        <Input
                          label="Qayta qoʻngʻiroq qilingan"
                          type="number"
                          min={0}
                          value={f.recalledCount}
                          onChange={(e) =>
                            setCallForms((s) => ({
                              ...s,
                              [t.key]: { ...s[t.key], recalledCount: Number(e.target.value) },
                            }))
                          }
                        />
                      )}
                      <Input
                        label="Yozilganlar"
                        type="number"
                        min={0}
                        value={f.bookedCount}
                        onChange={(e) =>
                          setCallForms((s) => ({
                            ...s,
                            [t.key]: { ...s[t.key], bookedCount: Number(e.target.value) },
                          }))
                        }
                      />
                      {'target' in t && t.target && (
                        <p className="text-xs text-ink-muted">Maqsad: {t.target}/kun</p>
                      )}
                      <Button className="w-full" disabled={saving} onClick={() => saveCall(t.key)}>
                        Saqlash
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {tab === 'reviews' && (
              <div className="max-w-lg rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-3">
                <h3 className="font-display text-2xl">Sharh qoʻshish</h3>
                <Input
                  label="Soni"
                  type="number"
                  min={1}
                  value={review.count}
                  onChange={(e) => setReview({ ...review, count: Number(e.target.value) })}
                />
                <Select
                  label="Manba"
                  value={review.source}
                  onChange={(e) => setReview({ ...review, source: e.target.value })}
                >
                  <option value="QR">QR</option>
                  <option value="WEBSITE">Sayt</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="VERBAL">Ogʻzaki</option>
                  <option value="OTHER">Boshqa</option>
                </Select>
                <Select
                  label="Sifat"
                  value={review.quality}
                  onChange={(e) => setReview({ ...review, quality: e.target.value })}
                >
                  <option value="POSITIVE">Ijobiy</option>
                  <option value="NEUTRAL">Neytral</option>
                  <option value="NEGATIVE">Salbiy</option>
                </Select>
                <Textarea
                  label="Izoh"
                  value={review.note}
                  onChange={(e) => setReview({ ...review, note: e.target.value })}
                />
                <Button disabled={saving} onClick={saveReview}>
                  Qoʻshish
                </Button>
                <div className="pt-3 border-t text-sm space-y-1">
                  {(day?.reviews || []).map((r: any) => (
                    <p key={r.id}>
                      {r.count}× {r.source} · {r.quality}
                    </p>
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
