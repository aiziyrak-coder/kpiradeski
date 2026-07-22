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
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { todayISO } from '@/types';
import { cn, statusDot } from '@/lib/utils';

const BLOCK_KEYS = ['clinic', 'reception', 'calls', 'reviews', 'uniform', 'smm', 'marketing'] as const;

const BLOCK_LINKS: Record<string, string> = {
  marketing: '/marketing',
  calls: '/today',
  clinic: '/today',
  reception: '/today',
  uniform: '/today',
  reviews: '/today',
  smm: '/marketing',
};

export default function DashboardPage() {
  const toast = useToast();
  const { t, lang } = useI18n();
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [aiItems, setAiItems] = useState<any[]>([]);

  const blockLabel = (key: string) => {
    const map: Record<string, string> = {
      clinic: t('dashboard.clinic'),
      reception: t('dashboard.reception'),
      calls: t('dashboard.calls'),
      reviews: t('dashboard.reviews'),
      uniform: t('dashboard.uniform'),
      smm: t('dashboard.smm'),
      marketing: t('dashboard.marketing'),
    };
    return map[key] || key;
  };

  useEffect(() => {
    setLoading(true);
    api(`/dashboard?date=${date}`)
      .then(setData)
      .catch((e) => toast.error(t('dashboard.loadError'), e.message))
      .finally(() => setLoading(false));
    api('/assistant/suggestions')
      .then((r) => setAiItems(r.items || []))
      .catch(() => {});
  }, [date]);

  const score = data?.today;
  const blocks = (score?.blockScores || {}) as Record<string, number>;
  const history = (data?.history || []).map((h: any) => ({
    date: String(h.date).slice(5, 10),
    score: h.totalScore,
  }));
  const completion = data?.completion;

  const funnelData = [
    {
      name: t('dashboard.funnelNew'),
      calls: data?.funnel?.new?.callsCount || 0,
      booked: data?.funnel?.new?.bookedCount || 0,
    },
    {
      name: t('dashboard.funnelRepeat'),
      calls: data?.funnel?.repeat?.callsCount || 0,
      booked: data?.funnel?.repeat?.bookedCount || 0,
    },
    {
      name: t('dashboard.funnelMissed'),
      calls: data?.funnel?.missed?.callsCount || 0,
      booked: data?.funnel?.missed?.bookedCount || 0,
    },
  ];

  const weakBlocks = BLOCK_KEYS.map((key) => ({
    key,
    label: blockLabel(key),
    v: Number(blocks[key] ?? 0),
  }))
    .filter((b) => b.v < 50)
    .sort((a, b) => a.v - b.v)
    .slice(0, 3);

  return (
    <AppShell>
      <RoleGate allow={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
        <SectionHeader
          title={t('dashboard.dailyStatus')}
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
          <div className="h-64 grid place-items-center text-ink-muted">...</div>
        ) : !score && !data?.history?.length ? (
          <div className="rounded-3xl border border-dashed border-teal-200 p-10 text-center">
            <p className="font-display text-2xl text-ink">{t('dashboard.empty')}</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-teal-100 bg-white/90 p-4">
                <p className="text-xs uppercase tracking-wider text-teal-700 font-semibold">
                  {t('dashboard.totalScore')}
                </p>
                <p className="font-display text-4xl mt-1 tabular-nums">
                  {(score?.totalScore ?? 0).toFixed(0)}%
                </p>
                <ScoreBadge score={score?.totalScore ?? 0} color={score?.colorStatus} />
              </div>
              <div className="rounded-2xl border border-teal-100 bg-white/90 p-4">
                <p className="text-xs uppercase tracking-wider text-teal-700 font-semibold">
                  {t('dashboard.avg30')}
                </p>
                <p className="font-display text-4xl mt-1">{data?.avg30 ?? 0}%</p>
              </div>
              {completion && (
                <Link
                  href="/today"
                  className="rounded-2xl border border-teal-100 bg-white/90 p-4 hover:border-teal-300 transition"
                >
                  <p className="text-xs uppercase tracking-wider text-teal-700 font-semibold">
                    {t('dashboard.completion')}
                  </p>
                  <p className="font-display text-4xl mt-1">
                    {data?.alerts?.leafDone ?? completion.requiredFilled}/
                    {data?.alerts?.leafTotal ?? completion.requiredTotal}
                  </p>
                  <p className="text-xs text-ink-muted">{completion.requiredPct}%</p>
                </Link>
              )}
            </div>

            <div className="rounded-[28px] border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <p className="text-sm font-semibold text-teal-950">{t('assistant.suggestions')}</p>
                <Link
                  href="/assistant"
                  className="text-xs font-semibold text-teal-700 underline"
                >
                  {t('assistant.openAssistant')} →
                </Link>
              </div>
              {data?.alerts?.incompleteTasks?.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                  <p className="text-xs font-semibold text-amber-950 mb-1.5">
                    {t('assistant.alerts')} · {data.alerts.incompleteCount} {t('assistant.incomplete')}
                  </p>
                  <ul className="text-xs text-amber-900 space-y-0.5">
                    {data.alerts.incompleteTasks.slice(0, 6).map((x: any) => (
                      <li key={x.key}>
                        · {lang === 'ru' ? x.titleRu : x.titleUz}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="space-y-2">
                {aiItems.length === 0 && (
                  <p className="text-sm text-ink-muted">{t('dashboard.empty')}</p>
                )}
                {aiItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-teal-100 bg-white/90 p-3 flex gap-3"
                  >
                    <span
                      className={cn(
                        'shrink-0 w-1.5 rounded-full',
                        item.priority === 'high' && 'bg-rose-500',
                        item.priority === 'mid' && 'bg-amber-400',
                        (!item.priority || item.priority === 'low') && 'bg-teal-500',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{item.title}</p>
                      <p className="text-xs text-ink-soft mt-0.5 whitespace-pre-wrap">
                        {item.detail}
                      </p>
                      {item.navigate && (
                        <Link
                          href={item.navigate}
                          className="inline-block mt-1 text-[11px] font-semibold text-teal-700 underline"
                        >
                          →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {weakBlocks.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-sm font-semibold text-amber-950 mb-2">{t('dashboard.attention')}</p>
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
                <p className="text-teal-100/80 text-sm uppercase tracking-[0.18em]">
                  {t('dashboard.dailyScore')}
                </p>
                <div className="mt-3 flex items-end gap-3">
                  <p className="font-display text-6xl sm:text-7xl leading-none tabular-nums">
                    {(score?.totalScore ?? 0).toFixed(1)}
                  </p>
                  <span className="mb-2 text-teal-100/70 text-lg">%</span>
                </div>
                <p className="mt-6 text-sm text-teal-100/65">
                  {date} · {score ? t('dashboard.calculated') : t('dashboard.noData')}
                </p>
              </div>

              <div className="lg:col-span-7 rounded-[28px] border border-teal-100 bg-white/80 backdrop-blur p-5 sm:p-6 shadow-soft">
                <p className="text-sm font-semibold text-ink mb-4">{t('dashboard.blocks')}</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {BLOCK_KEYS.map((key) => {
                    const label = blockLabel(key);
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
                      <Link
                        key={key}
                        href={href}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-sand-50/80 hover:bg-teal-50 transition"
                      >
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
                <p className="text-sm font-semibold text-ink mb-4">{t('dashboard.trend30')}</p>
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
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="#0F5F54"
                        fill="url(#scoreGrad)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-[28px] border border-teal-100 bg-white/80 p-5 shadow-soft">
                <p className="text-sm font-semibold text-ink mb-4">{t('dashboard.funnel')}</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#D5EBE6" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#6B7F7A" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#6B7F7A" />
                      <Tooltip />
                      <Bar dataKey="calls" name={t('dashboard.call')} fill="#6FB8AB" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="booked" name={t('dashboard.booked')} fill="#0F5F54" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

          </div>
        )}
      </RoleGate>
    </AppShell>
  );
}
