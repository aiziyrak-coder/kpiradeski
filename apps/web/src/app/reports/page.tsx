'use client';

import { useEffect, useState } from 'react';
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, SectionHeader } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api, downloadReport } from '@/lib/api';
import { todayISO } from '@/types';

function daysBefore(n: number) {
  const [y, m, d] = todayISO().split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - n);
  return utc.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const toast = useToast();
  const [from, setFrom] = useState(daysBefore(30));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await api(`/reports?from=${from}&to=${to}`));
    } catch (e: any) {
      toast.error('Hisobot yuklanmadi', e.message);
    }
  }

  useEffect(() => {
    load();
  }, [from, to]);

  async function exportFile(kind: 'excel' | 'pdf') {
    setBusy(true);
    try {
      await downloadReport(kind, from, to);
      toast.success(`${kind.toUpperCase()} yuklandi`);
    } catch (e: any) {
      toast.error('Eksport xatosi', e.message);
    } finally {
      setBusy(false);
    }
  }

  const chart = (data?.scores || []).map((s: any) => ({
    date: String(s.date).slice(5, 10),
    score: s.totalScore,
  }));

  return (
    <AppShell>
      <RoleGate allow={['MANAGER', 'SUPER_ADMIN']}>
        <SectionHeader
          eyebrow="Hisobotlar"
          title="PDF / Excel eksport"
          description="Davrni tanlang — 3 bosishda hisobot. Direktor paneli uchun tayyor."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => exportFile('pdf')}>
                PDF
              </Button>
              <Button disabled={busy} onClick={() => exportFile('excel')}>
                Excel
              </Button>
            </div>
          }
        />

        <div className="flex flex-wrap gap-3 mb-6">
          <label className="text-sm">
            <span className="text-ink-muted block mb-1">Dan</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-11 px-3 rounded-xl border border-teal-200 bg-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-muted block mb-1">Gacha</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-11 px-3 rounded-xl border border-teal-200 bg-white"
            />
          </label>
          <div className="flex items-end gap-2">
            {[7, 30, 90].map((n) => (
              <Button key={n} variant="ghost" size="sm" onClick={() => setFrom(daysBefore(n))}>
                {n} kun
              </Button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4 mb-5">
          <div className="rounded-3xl bg-gradient-to-br from-teal-800 to-teal-900 text-white p-6 shadow-glow">
            <p className="text-teal-100/80 text-sm">Davr oʻrtachasi</p>
            <p className="font-display text-5xl mt-1">{data?.avg ?? 0}%</p>
          </div>
          <div className="lg:col-span-2 rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft">
            <p className="text-sm font-semibold mb-3">Trend</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D5EBE6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="#0F5F54" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-ink-muted border-b border-teal-50">
                <th className="pb-2">Sana</th>
                <th className="pb-2">Ball</th>
                <th className="pb-2">Holat</th>
                <th className="pb-2">Klinika</th>
                <th className="pb-2">Retsepshn</th>
                <th className="pb-2">Qoʻngʻiroq</th>
                <th className="pb-2">Uniforma</th>
                <th className="pb-2">SMM</th>
              </tr>
            </thead>
            <tbody>
              {(data?.scores || []).length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-muted">
                    Tanlangan davrda maʼlumot yoʻq
                  </td>
                </tr>
              )}
              {(data?.scores || []).map((s: any) => {
                const b = s.blockScores || {};
                const status =
                  s.colorStatus === 'green'
                    ? 'Yaxshi'
                    : s.colorStatus === 'yellow'
                      ? 'Oʻrtacha'
                      : s.colorStatus === 'red'
                        ? 'Past'
                        : s.colorStatus;
                return (
                  <tr key={s.id || s.date} className="border-b border-teal-50/80">
                    <td className="py-2.5">{String(s.date).slice(0, 10)}</td>
                    <td className="py-2.5 font-semibold tabular-nums">{s.totalScore}%</td>
                    <td className="py-2.5">{status}</td>
                    <td className="py-2.5">{b.clinic ?? '—'}</td>
                    <td className="py-2.5">{b.reception ?? '—'}</td>
                    <td className="py-2.5">{b.calls ?? '—'}</td>
                    <td className="py-2.5">{b.uniform ?? '—'}</td>
                    <td className="py-2.5">{b.smm ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </RoleGate>
    </AppShell>
  );
}
