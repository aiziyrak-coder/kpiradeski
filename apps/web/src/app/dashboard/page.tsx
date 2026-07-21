'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { ScoreBadge, SectionHeader } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { todayISO } from '@/types';
import { cn, statusDot } from '@/lib/utils';

const BLOCK_LABELS: Record<string, string> = {
  clinic: 'Klinika',
  reception: 'Retsepshn',
  calls: "Qo'ng'iroqlar",
  reviews: 'Sharhlar',
  uniform: 'Uniforma',
  warehouse: 'Ombor',
  smm: 'SMM / SEO',
  marketing: 'Marketing',
  doctors: 'Shifokorlar',
};

const BLOCK_LINKS: Record<string, string> = {
  warehouse: '/warehouse',
  doctors: '/doctors',
  marketing: '/marketing',
  calls: '/today',
  clinic: '/today',
  reception: '/today',
  smm: '/marketing',
};

export default function DashboardPage() {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/dashboard?date=${date}`)
      .then(setData)
      .catch((e) => toast.error('Dashboard xatosi', e.message))
      .finally(() => setLoading(false));
  }, [date]);

  const score = data?.today;
  const blocks = (score?.blockScores || {}) as Record<string, number>;
  const history = (data?.history || []).map((h: any) => ({
    date: String(h.date).slice(5, 10),
    score: h.totalScore,
  }));
  const completion = data?.completion;

  const funnelData = [
    { name: 'Yangi', calls: data?.funnel?.new?.callsCount || 0, booked: data?.funnel?.new?.bookedCount || 0 },
    { name: 'Takroriy', calls: data?.funnel?.repeat?.callsCount || 0, booked: data?.funnel?.repeat?.bookedCount || 0 },
    { name: 'Missed', calls: data?.funnel?.missed?.callsCount || 0, booked: data?.funnel?.missed?.bookedCount || 0 },
  ];

  const weakBlocks = Object.entries(BLOCK_LABELS)
    .map(([key, label]) => ({ key, label, v: Number(blocks[key] ?? 0) }))
    .filter((b) => b.v < 50)
    .sort((a, b) => a.v - b.v)
    .slice(0, 3);

  return (
    <AppShell>
      <RoleGate allow={['ADMIN', 'MANAGER', 'DIRECTOR', 'SUPER_ADMIN']}>
        <SectionHeader
          eyebrow="Boshqaruv paneli"
          title="Kunlik holat"
          description="Ball, ogohlantirishlar va tezkor havolalar — bitta ekranda."
          action={
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 px-3 rounded-xl border border-teal-200 bg-white/90 text-sm"
            />
          }
        />

        {loading ? (
          <div className="h-64 grid place-items-center text-ink-muted">Maʼlumot yuklanmoqda...</div>
        ) : !score && !data?.history?.length ? (
          <div className="rounded-3xl border border-dashed border-teal-200 p-10 text-center space-y-3">
            <p className="font-display text-2xl text-ink">Hali KPI maʼlumoti yoʻq</p>
            <p className="text-sm text-ink-muted">Kunlik chek-listlar toʻldirilganda shu yerda ball chiqadi.</p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <Link href="/team" className="text-sm text-teal-700 font-semibold underline">
                Vazifalar
              </Link>
              <Link href="/warehouse" className="text-sm text-teal-700 font-semibold underline">
                Ombor
              </Link>
              <Link href="/doctors" className="text-sm text-teal-700 font-semibold underline">
                Shifokorlar
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-teal-100 bg-white/90 p-4">
                <p className="text-xs uppercase tracking-wider text-teal-700 font-semibold">Umumiy ball</p>
                <p className="font-display text-4xl mt-1 tabular-nums">{(score?.totalScore ?? 0).toFixed(0)}%</p>
                <ScoreBadge score={score?.totalScore ?? 0} color={score?.colorStatus} />
              </div>
              <div className="rounded-2xl border border-teal-100 bg-white/90 p-4">
                <p className="text-xs uppercase tracking-wider text-teal-700 font-semibold">30 kun oʻrtacha</p>
                <p className="font-display text-4xl mt-1">{data?.avg30 ?? 0}%</p>
              </div>
              {completion && (
                <Link href="/team" className="rounded-2xl border border-teal-100 bg-white/90 p-4 hover:border-teal-300 transition">
                  <p className="text-xs uppercase tracking-wider text-teal-700 font-semibold">Toʻldirilish</p>
                  <p className="font-display text-4xl mt-1">
                    {completion.requiredFilled}/{completion.requiredTotal}
                  </p>
                  <p className="text-xs text-ink-muted">{completion.requiredPct}% · Vazifalar</p>
                </Link>
              )}
              {data?.alerts?.lowStock?.length > 0 ? (
                <Link href="/warehouse" className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 hover:border-rose-300 transition">
                  <p className="text-xs uppercase tracking-wider text-status-red font-semibold">Past zaxira</p>
                  <p className="font-display text-4xl mt-1">{data.alerts.lowStock.length}</p>
                  <p className="text-xs text-ink-muted truncate">
                    {data.alerts.lowStock.map((p: any) => p.name).join(', ')}
                  </p>
                </Link>
              ) : (
                <Link href="/warehouse" className="rounded-2xl border border-teal-100 bg-white/90 p-4 hover:border-teal-300 transition">
                  <p className="text-xs uppercase tracking-wider text-teal-700 font-semibold">Ombor</p>
                  <p className="font-display text-2xl mt-2 text-teal-800">Zaxira OK</p>
                  <p className="text-xs text-ink-muted">Omborga oʻtish</p>
                </Link>
              )}
            </div>

            {weakBlocks.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-sm font-semibold text-amber-950 mb-2">Eʼtibor kerak (&lt;50%)</p>
                <div className="flex flex-wrap gap-2">
                  {weakBlocks.map((b) => (
                    <Link
                      key={b.key}
                      href={BLOCK_LINKS[b.key] || '/dashboard'}
                      className="px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-sm"
                    >
                      {b.label}: {b.v.toFixed(0)}%
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="grid lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 relative overflow-hidden rounded-[28px] bg-gradient-to-br from-teal-800 via-teal-700 to-teal-900 text-white p-6 sm:p-8 shadow-glow">
                <p className="text-teal-100/80 text-sm uppercase tracking-[0.18em]">Kunlik ball</p>
                <div className="mt-3 flex items-end gap-3">
                  <p className="font-display text-6xl sm:text-7xl leading-none tabular-nums">
                    {(score?.totalScore ?? 0).toFixed(1)}
                  </p>
                  <span className="mb-2 text-teal-100/70 text-lg">%</span>
                </div>
                <p className="mt-6 text-sm text-teal-100/65">{date} · {score ? 'Hisoblangan' : 'Maʼlumot yoʻq'}</p>
              </div>

              <div className="lg:col-span-7 rounded-[28px] border border-teal-100 bg-white/80 backdrop-blur p-5 sm:p-6 shadow-soft">
                <p className="text-sm font-semibold text-ink mb-4">Bloklar</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {Object.entries(BLOCK_LABELS).map(([key, label]) => {
                    const v = Number(blocks[key] ?? 0);
                    const color = v >= 80 ? 'green' : v >= 50 ? 'yellow' : 'red';
                    const href = BLOCK_LINKS[key];
                    const inner = (
                      <>
                        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', statusDot(color))} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-sm mb-1.5">
                            <span className="font-medium text-ink truncate">{label}</span>
                            <span className="tabular-nums text-ink-soft">{v.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-teal-100 overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-700',
                                color === 'green' && 'bg-status-green',
                                color === 'yellow' && 'bg-status-yellow',
                                color === 'red' && 'bg-status-red',
                              )}
                              style={{ width: `${Math.min(100, v)}%` }}
                            />
                          </div>
                        </div>
                      </>
                    );
                    return href ? (
                      <Link key={key} href={href} className="flex items-center gap-3 p-3 rounded-2xl bg-sand-50/80 hover:bg-teal-50 transition">
                        {inner}
                      </Link>
                    ) : (
                      <div key={key} className="flex items-center gap-3 p-3 rounded-2xl bg-sand-50/80">
                        {inner}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-[28px] border border-teal-100 bg-white/80 p-5 shadow-soft">
                <p className="text-sm font-semibold text-ink mb-4">30 kunlik trend</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history}>
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1F7A6C" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#1F7A6C" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#D5EBE6" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#6B7F7A" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#6B7F7A" />
                      <Tooltip />
                      <Area type="monotone" dataKey="score" stroke="#0F5F54" fill="url(#scoreGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-[28px] border border-teal-100 bg-white/80 p-5 shadow-soft">
                <p className="text-sm font-semibold text-ink mb-4">Qoʻngʻiroqlar voronkasi</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#D5EBE6" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#6B7F7A" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#6B7F7A" />
                      <Tooltip />
                      <Bar dataKey="calls" name="Qoʻngʻiroq" fill="#6FB8AB" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="booked" name="Yozilgan" fill="#0F5F54" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <div className="rounded-[28px] border border-teal-100 bg-white/80 p-5 shadow-soft">
                <p className="text-sm font-semibold text-ink mb-4">Oylik heatmap</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {(data?.heatmap || []).map((d: any) => (
                    <div
                      key={d.date}
                      title={`${d.date}: ${d.score}%`}
                      className={cn(
                        'aspect-square rounded-md',
                        d.color === 'green' && 'bg-emerald-500/80',
                        d.color === 'yellow' && 'bg-amber-400/80',
                        d.color === 'red' && 'bg-rose-400/80',
                        !d.color && 'bg-teal-100',
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-teal-100 bg-white/80 p-5 shadow-soft lg:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-ink">AI haftalik xulosa</p>
                  <Link href="/ai" className="text-xs text-teal-700 font-semibold underline">
                    Barchasi
                  </Link>
                </div>
                <div className="space-y-3 max-h-56 overflow-y-auto">
                  {(data?.latestAi || []).length === 0 && (
                    <p className="text-sm text-ink-muted">Hali AI hisobot yoʻq — /ai dan yarating</p>
                  )}
                  {(data?.latestAi || []).map((r: any) => (
                    <div key={r.id} className="rounded-2xl bg-teal-50/60 p-3.5 border border-teal-100">
                      <p className="text-xs font-semibold text-teal-700 mb-1">
                        {r.type === 'CALLS' ? 'Qoʻngʻiroqlar' : 'Xizmatlar'} · {String(r.weekStart).slice(0, 10)}
                      </p>
                      <p className="text-sm text-ink-soft whitespace-pre-wrap line-clamp-4">{r.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-teal-100 bg-white/80 p-5 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-ink">Shifokorlar reytingi</p>
                <Link href="/doctors" className="text-xs text-teal-700 font-semibold underline">
                  Boshqarish
                </Link>
              </div>
              {(data?.doctorRanking || []).length === 0 ? (
                <p className="text-sm text-ink-muted">Shifokorlar hali yoʻq</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-muted border-b border-teal-50">
                        <th className="pb-2 font-medium">#</th>
                        <th className="pb-2 font-medium">Shifokor</th>
                        <th className="pb-2 font-medium">Stories</th>
                        <th className="pb-2 font-medium">Yoʻnaltirish</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.doctorRanking || []).map((d: any, i: number) => (
                        <tr key={d.id} className="border-b border-teal-50/80">
                          <td className="py-2.5 text-ink-muted">{i + 1}</td>
                          <td className="py-2.5 font-medium">{d.name}</td>
                          <td className="py-2.5">
                            {d.storiesPosted}/{d.storiesTotal}
                          </td>
                          <td className="py-2.5">{d.referrals}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </RoleGate>
    </AppShell>
  );
}
