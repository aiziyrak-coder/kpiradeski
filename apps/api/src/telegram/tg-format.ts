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

export function webBaseUrl(): string {
  return (
    process.env.WEB_PUBLIC_URL?.trim() ||
    process.env.WEB_URL?.trim() ||
    process.env.CORS_ORIGIN?.split(',')[0]?.trim() ||
    'https://kpi.devflix.uz'
  );
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
