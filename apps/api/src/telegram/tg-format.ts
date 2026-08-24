/**
 * Radeski KPI — Telegram guruh xabarlari
 * Qisqa, tushunarli HTML kartochkalar
 */

export const TG_BRAND = 'Radeski KPI';

export function tgEscape(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function tgBold(s: unknown): string {
  return `<b>${tgEscape(s)}</b>`;
}

export function tgCode(s: unknown): string {
  return `<code>${tgEscape(s)}</code>`;
}

export function tgItalic(s: unknown): string {
  return `<i>${tgEscape(s)}</i>`;
}

export function scoreIcon(score: number | string | null | undefined): string {
  const n = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(n)) return '⚪';
  if (n >= 80) return '🟢';
  if (n >= 50) return '🟡';
  return '🔴';
}

export function colorIcon(status?: string | null): string {
  if (status === 'green') return '🟢';
  if (status === 'yellow') return '🟡';
  if (status === 'red') return '🔴';
  if (status === 'rest') return '🌴';
  return '⚪';
}

export const BLOCK_LABELS: Record<string, string> = {
  clinic: 'Klinika',
  reception: 'Administrator',
  calls: 'Qoʻngʻiroqlar',
  reviews: 'Sharhlar',
  uniform: 'Uniforma',
  smm: 'SMM / SEO',
  marketing: 'Marketing',
};

export function blockLabel(key: string): string {
  const k = key.replace(/_w$/, '').replace(/_m$/, '');
  return BLOCK_LABELS[k] || key;
}

export type TgCardOpts = {
  emoji: string;
  category: string;
  title: string;
  /** sana / filial / ish kuni */
  meta?: string[];
  /** asosiy matn (escape qilinadi) */
  body?: string;
  /** allaqachon escape qilingan HTML qatorlar */
  htmlLines?: string[];
  sections?: Array<{ heading: string; lines: string[]; html?: boolean }>;
  footer?: string;
  actions?: string;
  /** qisqa format: chiziq / Tezkor yoʻq */
  compact?: boolean;
};

/** Brand card — guruhdagi xabarlar shu uslubda */
export function tgCard(opts: TgCardOpts): string {
  const parts: string[] = [];
  parts.push(`${opts.emoji} <b>${tgEscape(TG_BRAND)}</b> · ${tgEscape(opts.category)}`);
  parts.push(`<b>${tgEscape(opts.title)}</b>`);
  if (opts.meta?.length) {
    parts.push(opts.meta.map((m) => tgEscape(m)).join(' · '));
  }
  if (!opts.compact) {
    parts.push('┄┄┄┄┄┄┄┄┄┄');
  }
  if (opts.body) {
    parts.push(tgEscape(opts.body));
  }
  if (opts.htmlLines?.length) {
    parts.push(...opts.htmlLines);
  }
  for (const sec of opts.sections || []) {
    parts.push('');
    parts.push(`<b>${tgEscape(sec.heading)}</b>`);
    for (const line of sec.lines) {
      parts.push(sec.html ? line : `• ${tgEscape(line)}`);
    }
  }
  if (opts.actions && !opts.compact) {
    parts.push('');
    parts.push(`👉 ${opts.actions}`);
  }
  if (opts.footer) {
    parts.push('');
    parts.push(tgItalic(opts.footer));
  }
  return parts.filter((p, i, arr) => !(p === '' && arr[i - 1] === '')).join('\n');
}

export function tgDivider(): string {
  return '┄┄┄┄┄┄┄┄┄┄';
}

const UZ_MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

/** 2026-08-19 → 19-avgust */
export function tgUzDate(iso: string, weekday?: string): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return [iso, weekday].filter(Boolean).join(', ');
  const day = Number(m[3]);
  const month = UZ_MONTHS[Number(m[2]) - 1] || m[2];
  const core = `${day}-${month}`;
  return weekday ? `${core}, ${weekday}` : core;
}

export function tgClock(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** [■■■■■■□□□□] 60% */
export function tgProgressBar(done: number, total: number): string {
  const t = Math.max(0, total);
  const d = Math.max(0, Math.min(done, t));
  const pct = t ? Math.round((d / t) * 100) : 0;
  const width = 10;
  const filled = t ? Math.round((d / t) * width) : 0;
  const bar = '■'.repeat(filled) + '□'.repeat(Math.max(0, width - filled));
  return `<i>[${bar}] ${pct}%</i>`;
}

export function webBaseUrl(): string {
  return (
    process.env.WEB_PUBLIC_URL?.trim() ||
    process.env.WEB_URL?.trim() ||
    process.env.CORS_ORIGIN?.split(',')[0]?.trim() ||
    'https://kpi.devflix.uz'
  );
}

/**
 * Guruhdagi tugma uchun havola.
 *
 * Inline `web_app` tugmalari FAQAT shaxsiy chatda ishlaydi, guruhda emas.
 * Guruhda Mini App ni ochishning yagona yoʻli — `t.me/<bot>?startapp=<param>`
 * deep-link (BotFather da Mini App URL sozlangan boʻlishi shart).
 * TELEGRAM_BOT_USERNAME berilmagan boʻlsa — eski oddiy web havola qoladi.
 */
export function tgAppLink(route: string): string {
  const bot = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  const web = webBaseUrl().replace(/\/$/, '');
  const path = route.replace(/^\//, '');
  if (!bot) return `${web}/${path}`;
  // startapp faqat A-Z a-z 0-9 _ - qabul qiladi
  return `https://t.me/${bot}?startapp=${path.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

export function chunkHtml(text: string, max = 3500): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/** Bir qatorlik filial progressi */
export function branchProgressLine(opts: {
  name: string;
  done: number;
  assigned: number;
  score?: number | null;
}): string {
  const pct = opts.assigned ? Math.round((opts.done / opts.assigned) * 100) : 0;
  const ball =
    opts.score != null && Number.isFinite(Number(opts.score))
      ? ` · ${opts.score}`
      : '';
  return (
    `${scoreIcon(pct)} ${tgBold(opts.name)} — ` +
    `${tgBold(`${opts.done}/${opts.assigned}`)} (${pct}%)${ball}`
  );
}
