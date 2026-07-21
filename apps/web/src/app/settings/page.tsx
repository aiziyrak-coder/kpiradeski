'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const toast = useToast();
  const [weights, setWeights] = useState<any[]>([]);
  const [calendar, setCalendar] = useState<any>(null);
  const [restDays, setRestDays] = useState<number[]>([0, 6]);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayTitle, setHolidayTitle] = useState('Bayram / dam olish');
  const [busy, setBusy] = useState(false);
  const [todayInfo, setTodayInfo] = useState<any>(null);

  async function load() {
    try {
      const [w, c, day] = await Promise.all([
        api('/settings/weights'),
        api('/settings/calendar'),
        api('/settings/calendar/day').catch(() => null),
      ]);
      setWeights(w);
      setCalendar(c);
      setRestDays(c.restWeekdays || [0, 6]);
      setTodayInfo(day);
    } catch (e: any) {
      toast.error('Yuklanmadi', e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const total = weights.reduce((s, w) => s + Number(w.weight), 0);

  async function saveWeights() {
    if (Math.abs(total - 100) > 0.01) {
      toast.error('Jami 100% boʻlishi shart', `Hozir: ${total}%`);
      return;
    }
    setBusy(true);
    try {
      const updated = await api('/settings/weights', {
        method: 'PUT',
        body: JSON.stringify({
          items: weights.map((w) => ({ blockKey: w.blockKey, weight: Number(w.weight) })),
        }),
      });
      setWeights(updated);
      toast.success('Ogʻirliklar saqlandi');
    } catch (e: any) {
      toast.error('Saqlanmadi', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRestDays() {
    setBusy(true);
    try {
      const days = await api('/settings/calendar/rest-weekdays', {
        method: 'PUT',
        body: JSON.stringify({ days: restDays }),
      });
      setRestDays(days);
      toast.success('Dam olish kunlari saqlandi');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addHoliday(e: FormEvent) {
    e.preventDefault();
    if (!holidayDate) return;
    try {
      await api('/settings/calendar/holidays', {
        method: 'POST',
        body: JSON.stringify({ date: holidayDate, title: holidayTitle }),
      });
      toast.success('Bayram qoʻshildi');
      setHolidayDate('');
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function removeHoliday(id: string) {
    try {
      await api(`/settings/calendar/holidays/${id}`, { method: 'DELETE' });
      toast.success('Oʻchirildi');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function toggleDay(d: number) {
    setRestDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }

  return (
    <AppShell>
      <RoleGate allow={['SUPER_ADMIN']}>
        <SectionHeader
          eyebrow="Sozlamalar"
          title="Dam olish kunlari"
          description="Shanba/yakshanba va bayramlar — shu kunlarda vazifa ochilmaydi va hisoblanmaydi."
          action={
            <Button disabled={busy} onClick={saveRestDays}>
              Dam olishni saqlash
            </Button>
          }
        />

        {todayInfo && (
          <div
            className={`mb-5 rounded-2xl border p-4 text-sm ${
              todayInfo.restDay
                ? 'border-amber-200 bg-amber-50/80 text-amber-950'
                : 'border-teal-200 bg-teal-50/70 text-teal-900'
            }`}
          >
            <p className="font-semibold">
              Bugun ({todayInfo.date}): {todayInfo.restDay ? 'Dam olish' : 'Ish kuni'}
            </p>
            <p className="mt-1 opacity-90">
              {todayInfo.weekdayLabel}
              {todayInfo.holiday?.title ? ` · ${todayInfo.holiday.title}` : ''}
            </p>
          </div>
        )}

        <div className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft mb-8">
          <p className="text-sm font-medium mb-3">Haftalik dam olish</p>
          <div className="flex flex-wrap gap-2">
            {(calendar?.weekdayOptions || []).map((o: any) => {
              const on = restDays.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleDay(o.value)}
                  className={cn(
                    'px-3 py-2 rounded-xl text-sm border transition',
                    on
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white border-teal-100 text-ink-soft',
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          <form onSubmit={addHoliday} className="mt-6 grid sm:grid-cols-3 gap-3 items-end">
            <Input
              label="Bayram sanasi"
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              required
            />
            <Input
              label="Nomi"
              value={holidayTitle}
              onChange={(e) => setHolidayTitle(e.target.value)}
              required
            />
            <Button type="submit">Bayram qoʻshish</Button>
          </form>

          <ul className="mt-4 space-y-2">
            {(calendar?.holidays || []).map((h: any) => (
              <li
                key={h.id}
                className="flex justify-between items-center text-sm border-b border-teal-50 py-2"
              >
                <span>
                  {h.date} · {h.title}
                </span>
                <button
                  type="button"
                  className="text-rose-600 underline text-xs"
                  onClick={() => removeHoliday(h.id)}
                >
                  Oʻchirish
                </button>
              </li>
            ))}
            {!calendar?.holidays?.length && (
              <li className="text-sm text-ink-muted">Qoʻshimcha bayram yoʻq</li>
            )}
          </ul>
        </div>

        <SectionHeader
          eyebrow="KPI"
          title="KPI ogʻirliklari"
          description="Har bir blokning umumiy baldagi ulushi. Yigʻindi 100%."
          action={
            <Button disabled={busy || Math.abs(total - 100) > 0.01} onClick={saveWeights}>
              {busy ? 'Saqlanmoqda...' : 'Saqlash'}
            </Button>
          }
        />

        <div className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">Jami ogʻirlik</span>
            <span
              className={
                Math.abs(total - 100) < 0.01
                  ? 'text-status-green font-semibold'
                  : 'text-status-red font-semibold'
              }
            >
              {total}%
            </span>
          </div>
          {weights.map((w, i) => (
            <div key={w.blockKey} className="grid sm:grid-cols-[1fr_120px] gap-3 items-end">
              <div>
                <p className="text-sm font-medium">{w.blockName}</p>
                <p className="text-xs text-ink-muted">
                  {w.blockKey} · {w.frequency}
                </p>
              </div>
              <Input
                label="%"
                type="number"
                min={0}
                max={100}
                value={w.weight}
                onChange={(e) => {
                  const next = [...weights];
                  next[i] = { ...w, weight: Number(e.target.value) };
                  setWeights(next);
                }}
              />
            </div>
          ))}
        </div>
      </RoleGate>
    </AppShell>
  );
}
