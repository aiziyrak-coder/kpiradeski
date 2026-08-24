'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronDown, ChevronRight, Clock, Search } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { useI18n } from '@/lib/i18n';
import {
  GUIDE_BLOCKS,
  GUIDE_DAY_RU,
  GUIDE_DAY_UZ,
  GUIDE_RULES_RU,
  GUIDE_RULES_UZ,
  GUIDE_STEPS_RU,
  GUIDE_STEPS_UZ,
} from '@/lib/task-guide';

export default function GuidePage() {
  const { t, lang } = useI18n();
  const ru = lang === 'ru';
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({
    how: true,
    day: true,
  });

  const rules = ru ? GUIDE_RULES_RU : GUIDE_RULES_UZ;
  const steps = ru ? GUIDE_STEPS_RU : GUIDE_STEPS_UZ;
  const day = ru ? GUIDE_DAY_RU : GUIDE_DAY_UZ;

  const blocks = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return GUIDE_BLOCKS;
    return GUIDE_BLOCKS.filter((b) => {
      const hay = [
        b.titleUz,
        b.titleRu,
        b.whenUz,
        b.whenRu,
        ...(b.howUz || []),
        ...(b.howRu || []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(s);
    });
  }, [q]);

  function toggle(id: string) {
    setOpen((o) => ({ ...o, [id]: !o[id] }));
  }

  return (
    <RoleGate allow={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <AppShell>
        <div className="max-w-3xl space-y-5 pb-16">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                {t('guide.kicker')}
              </p>
              <h1 className="font-display text-3xl text-ink tracking-tight mt-1">{t('guide.title')}</h1>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">{t('guide.lead')}</p>
            </div>
            <Link
              href="/today"
              className="shrink-0 h-10 px-3 rounded-xl bg-teal-800 text-white text-sm font-semibold inline-flex items-center"
            >
              {t('guide.toTasks')}
            </Link>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
            <input
              className="w-full h-11 pl-10 pr-3 rounded-xl border border-teal-900/10 bg-white text-sm"
              placeholder={t('guide.search')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <section className="rounded-2xl border border-teal-100 bg-white p-4 space-y-2">
            <h2 className="text-sm font-semibold text-ink">{t('guide.golden')}</h2>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-ink leading-snug">
              {rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-teal-900/10 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => toggle('how')}
              className="w-full flex items-center gap-2 px-4 py-3 text-left min-h-12"
            >
              {open.how ? (
                <ChevronDown className="w-4 h-4 text-teal-800" />
              ) : (
                <ChevronRight className="w-4 h-4 text-teal-800" />
              )}
              <span className="font-semibold text-ink">{t('guide.howTitle')}</span>
            </button>
            {open.how && (
              <ol className="px-4 pb-4 list-decimal pl-9 space-y-2 text-sm text-ink leading-snug">
                {steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-2xl border border-amber-200/80 bg-amber-50/50 overflow-hidden">
            <button
              type="button"
              onClick={() => toggle('day')}
              className="w-full flex items-center gap-2 px-4 py-3 text-left min-h-12"
            >
              {open.day ? (
                <ChevronDown className="w-4 h-4 text-amber-800" />
              ) : (
                <ChevronRight className="w-4 h-4 text-amber-800" />
              )}
              <Clock className="w-4 h-4 text-amber-800" />
              <span className="font-semibold text-ink">{t('guide.dayTitle')}</span>
            </button>
            {open.day && (
              <div className="px-4 pb-4 space-y-3">
                {day.map((row) => (
                  <div
                    key={row.time}
                    className="rounded-xl bg-white border border-amber-100 px-3 py-2.5"
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
                      {row.time}
                    </p>
                    <p className="text-sm text-ink mt-1 leading-snug">{row.text}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-ink px-1">{t('guide.byBlock')}</h2>
            {blocks.length === 0 && (
              <p className="text-sm text-ink-muted py-6 text-center">{t('guide.empty')}</p>
            )}
            {blocks.map((b) => {
              const vis = !!q.trim() || open[b.id] === true;
              return (
                <section
                  key={b.id}
                  className="rounded-2xl border border-teal-900/10 bg-white overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggle(b.id)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left min-h-12"
                  >
                    {vis ? (
                      <ChevronDown className="w-4 h-4 text-teal-800 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-teal-800 shrink-0" />
                    )}
                    <span className="font-semibold text-ink flex-1">
                      {ru ? b.titleRu : b.titleUz}
                    </span>
                  </button>
                  {vis && (
                    <div className="px-4 pb-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                        {t('guide.when')}
                      </p>
                      <p className="text-sm text-ink leading-snug">{ru ? b.whenRu : b.whenUz}</p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 pt-1">
                        {t('guide.how')}
                      </p>
                      <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink leading-snug">
                        {(ru ? b.howRu : b.howUz).map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </AppShell>
    </RoleGate>
  );
}
