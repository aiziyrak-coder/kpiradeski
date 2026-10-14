'use client';

import { cleanAiText, cn } from '@/lib/utils';

type Tone = 'good' | 'warn' | 'bad' | 'neutral';
type Lang = 'uz' | 'ru';
type L = { uz: string; ru: string };

type AiPart = {
  verdict: Tone;
  headline: string;
  summary: string;
  problems: Array<{ text: string; level: 'high' | 'mid' }>;
  actions: Array<{ title: string; detail: string }>;
};

export type AiReportV2 = {
  v: 2;
  kind: 'KPI' | 'CALLS' | 'SERVICES';
  period: string;
  start: string;
  end: string;
  branch: string | null;
  score: number | null;
  scoreTone: Tone;
  tiles: Array<{ label: L; value: string; tone: Tone; hint?: L }>;
  days: Array<{ date: string; score: number; tone: Tone; partial?: boolean }>;
  bars: Array<{ name: string; done: number; total: number; pct: number; tone: Tone }>;
  missed: Array<{ title: string; count: number }>;
  branches: Array<{ name: string; avg: number; days: number; tone: Tone }>;
  ai: { uz: AiPart; ru: AiPart } | null;
  aiSource: 'ai' | 'rules';
};

export function parseReport(content: string): AiReportV2 | null {
  if (!content || content[0] !== '{') return null;
  try {
    const r = JSON.parse(content);
    return r?.v === 2 ? (r as AiReportV2) : null;
  } catch {
    return null;
  }
}

const TONE = {
  good: { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  warn: { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-400', dot: 'bg-amber-400' },
  bad: { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', bar: 'bg-rose-500', dot: 'bg-rose-500' },
  neutral: { text: 'text-ink', bg: 'bg-black/[0.03]', border: 'border-black/8', bar: 'bg-teal-600', dot: 'bg-slate-400' },
} as const;

const TXT = {
  uz: {
    period: { DAY: 'Kunlik', WEEK: 'Haftalik', MONTH: 'Oylik', YEAR: 'Yillik', CUSTOM: 'Davr' } as Record<string, string>,
    kind: { KPI: 'KPI hisobot', CALLS: 'Qoʻngʻiroqlar', SERVICES: 'Xizmatlar va marketing' } as Record<string, string>,
    all: 'Barcha filiallar',
    score: 'Oʻrtacha ball',
    noScore: 'Ball yoʻq',
    verdict: { good: 'Yaxshi', warn: 'Eʼtibor kerak', bad: 'Jiddiy muammo', neutral: 'Maʼlumot kam' },
    days: 'Kunlar boʻyicha',
    today: 'bugun',
    blocks: 'Boʻlimlar',
    calls: 'Qoʻngʻiroq turlari (yozildi / jami)',
    social: 'Kanallar (post / yangi obunachi)',
    branches: 'Filiallar',
    missed: 'Eng koʻp bajarilmagan ishlar',
    times: 'marta',
    problems: 'Muammolar',
    actions: 'Nima qilish kerak',
    rules: 'AI ishlamadi — raqamlardan avtomatik xulosa',
  },
  ru: {
    period: { DAY: 'Дневной', WEEK: 'Недельный', MONTH: 'Месячный', YEAR: 'Годовой', CUSTOM: 'Период' } as Record<string, string>,
    kind: { KPI: 'KPI отчёт', CALLS: 'Звонки', SERVICES: 'Услуги и маркетинг' } as Record<string, string>,
    all: 'Все филиалы',
    score: 'Средний балл',
    noScore: 'Нет балла',
    verdict: { good: 'Хорошо', warn: 'Нужно внимание', bad: 'Серьёзная проблема', neutral: 'Мало данных' },
    days: 'По дням',
    today: 'сегодня',
    blocks: 'Разделы',
    calls: 'Типы звонков (записано / всего)',
    social: 'Каналы (посты / новые подписчики)',
    branches: 'Филиалы',
    missed: 'Чаще всего не выполнено',
    times: 'раз',
    problems: 'Проблемы',
    actions: 'Что сделать',
    rules: 'AI недоступен — автоматический вывод по цифрам',
  },
};

const WEEKDAYS: Record<Lang, string[]> = {
  uz: ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
};

/** "Du 12.10" — brauzer locale siga bogʻliq emas (uz-UZ koʻp brauzerda yoʻq) */
function dayLabel(iso: string, lang: Lang) {
  const [, m, d] = iso.split('-');
  const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return `${WEEKDAYS[lang][wd]} ${d}.${m}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">{children}</h4>;
}

export function AiReportCard({ report, lang }: { report: AiReportV2; lang: Lang }) {
  const T = TXT[lang];
  const ai = report.ai?.[lang] || report.ai?.uz || null;
  const verdict: Tone = ai?.verdict || report.scoreTone;
  const vt = TONE[verdict];
  const st = TONE[report.scoreTone];

  return (
    <article className="rounded-2xl border border-black/8 bg-white overflow-hidden">
      {/* Sarlavha */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">
            {T.period[report.period] || report.period} {T.kind[report.kind] || report.kind}
          </h3>
          <span className="rounded-full bg-teal-900/90 px-2.5 py-0.5 text-xs font-medium text-white">
            {report.branch || T.all}
          </span>
        </div>
        <span className="text-xs text-ink-muted tabular-nums">
          {report.start}
          {report.end !== report.start ? ` — ${report.end}` : ''}
        </span>
      </header>

      {/* Xulosa + ball */}
      <div className={cn('m-4 sm:mx-5 rounded-2xl border p-4 flex flex-col sm:flex-row gap-4', vt.bg, vt.border)}>
        <div className="sm:w-40 shrink-0">
          <div className="text-xs text-ink-muted">{T.score}</div>
          <div className={cn('text-4xl font-bold tabular-nums leading-tight', st.text)}>
            {report.score != null ? `${report.score}%` : '—'}
          </div>
          <span className={cn('mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold bg-white/70', vt.text)}>
            <span className={cn('h-2 w-2 rounded-full', vt.dot)} />
            {T.verdict[verdict]}
          </span>
        </div>
        {ai && (
          <div className="min-w-0">
            <p className={cn('text-[15px] font-bold leading-snug', vt.text)}>{ai.headline}</p>
            {ai.summary && <p className="mt-1.5 text-sm text-ink-soft leading-relaxed">{ai.summary}</p>}
          </div>
        )}
      </div>

      <div className="px-4 sm:px-5 pb-5 space-y-5">
        {/* Asosiy raqamlar */}
        {report.tiles.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {report.tiles.map((t, i) => (
              <div key={i} className={cn('rounded-xl border p-3', TONE[t.tone].border, TONE[t.tone].bg)}>
                <div className="text-xs text-ink-muted">{t.label[lang]}</div>
                <div className={cn('text-xl font-bold tabular-nums', TONE[t.tone].text)}>{t.value}</div>
                {t.hint && <div className="text-[11px] text-ink-muted">{t.hint[lang]}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Kunlar */}
        {report.days.length > 1 && (
          <section>
            <SectionTitle>{T.days}</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {report.days.map((d) => (
                <div
                  key={d.date}
                  className={cn(
                    'rounded-xl border px-2.5 py-1.5 text-center min-w-[64px]',
                    d.partial ? 'border-dashed border-black/15 bg-white' : cn(TONE[d.tone].border, TONE[d.tone].bg),
                  )}
                >
                  <div className="text-[11px] text-ink-muted">{dayLabel(d.date, lang)}</div>
                  <div className={cn('text-sm font-bold tabular-nums', d.partial ? 'text-ink-muted' : TONE[d.tone].text)}>
                    {d.score}%
                  </div>
                  {d.partial && <div className="text-[10px] text-ink-muted">{T.today}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Boʻlimlar / turlar */}
          {report.bars.length > 0 && (
            <section>
              <SectionTitle>{report.kind === 'CALLS' ? T.calls : report.kind === 'SERVICES' ? T.social : T.blocks}</SectionTitle>
              <ul className="space-y-2">
                {report.bars.map((b) => (
                  <li key={b.name}>
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="text-ink truncate">{b.name}</span>
                      <span className={cn('font-semibold tabular-nums shrink-0', TONE[b.tone].text)}>
                        {report.kind === 'SERVICES' ? b.done : `${b.done}/${b.total} · ${b.pct}%`}
                      </span>
                    </div>
                    {report.kind !== 'SERVICES' && (
                      <div className="mt-1 h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                        <div className={cn('h-full rounded-full', TONE[b.tone].bar)} style={{ width: `${Math.min(100, b.pct)}%` }} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Bajarilmagan ishlar */}
          {report.missed.length > 0 && (
            <section>
              <SectionTitle>{T.missed}</SectionTitle>
              <ul className="space-y-1.5">
                {report.missed.map((m) => (
                  <li key={m.title} className="flex items-start justify-between gap-2 text-sm">
                    <span className="text-ink">{m.title}</span>
                    <span className="shrink-0 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-bold text-rose-700 tabular-nums">
                      {m.count} {T.times}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Filiallar */}
          {report.branches.length > 1 && (
            <section>
              <SectionTitle>{T.branches}</SectionTitle>
              <ul className="space-y-1.5">
                {report.branches.map((b) => (
                  <li key={b.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-ink">
                      <span className={cn('h-2 w-2 rounded-full', TONE[b.tone].dot)} />
                      {b.name}
                    </span>
                    <span className={cn('font-bold tabular-nums', TONE[b.tone].text)}>{b.avg}%</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* AI: muammolar va harakatlar */}
        {ai && (ai.problems.length > 0 || ai.actions.length > 0) && (
          <div className="grid gap-3 lg:grid-cols-2">
            {ai.problems.length > 0 && (
              <section className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                <SectionTitle>{T.problems}</SectionTitle>
                <ul className="space-y-1.5">
                  {ai.problems.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm text-ink">
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', p.level === 'high' ? 'bg-rose-500' : 'bg-amber-400')} />
                      <span>{p.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {ai.actions.length > 0 && (
              <section className="rounded-xl border border-teal-200 bg-teal-50/60 p-3">
                <SectionTitle>{T.actions}</SectionTitle>
                <ol className="space-y-2">
                  {ai.actions.map((a, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-800 text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      <span>
                        <b className="text-ink">{a.title}</b>
                        {a.detail && <span className="text-ink-soft"> — {a.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}

        {report.aiSource === 'rules' && <p className="text-[11px] text-ink-muted">{T.rules}</p>}
      </div>
    </article>
  );
}

/** Eski (matnli) hisobotlar — markdown tozalanib, sarlavhalar qalin */
export function LegacyReportText({ content }: { content: string }) {
  return (
    <div className="text-sm text-ink-soft leading-relaxed space-y-1">
      {cleanAiText(content)
        .split('\n')
        .map((line, i) =>
          !line.trim() ? (
            <div key={i} className="h-2" />
          ) : /^[^-\d].{0,40}:\s*$/.test(line) || i === 0 ? (
            <p key={i} className="font-semibold text-ink pt-1">
              {line}
            </p>
          ) : (
            <p key={i} className={line.startsWith('- ') ? 'pl-3' : ''}>
              {line}
            </p>
          ),
        )}
    </div>
  );
}
