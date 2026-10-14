/**
 * AI hisobot (v2) — raqamlar serverda hisoblanadi, AI faqat xulosa/muammo/tavsiya yozadi.
 * AiWeeklyReport.content ga JSON qilib saqlanadi; web uni rangli kartochkalar bilan chizadi.
 */
import { openaiChatMessages } from '../common/openai';
import { stripMarkdown } from '../common/website-snapshot';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export type ReportTile = { label: { uz: string; ru: string }; value: string; tone: Tone; hint?: { uz: string; ru: string } };
export type ReportDay = { date: string; score: number; tone: Tone; partial?: boolean };
export type ReportBar = { name: string; done: number; total: number; pct: number; tone: Tone };
export type ReportMissed = { title: string; count: number };
export type ReportBranch = { name: string; avg: number; days: number; tone: Tone };

export type AiPart = {
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
  tiles: ReportTile[];
  days: ReportDay[];
  bars: ReportBar[];
  missed: ReportMissed[];
  branches: ReportBranch[];
  ai: { uz: AiPart; ru: AiPart } | null;
  aiSource: 'ai' | 'rules';
};

export function scoreTone(score: number | null | undefined): Tone {
  if (score == null || Number.isNaN(score)) return 'neutral';
  if (score >= 80) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

/** Bajarilish foizi uchun qattiqroq chegara: 90%+ yaxshi */
export function pctTone(pct: number): Tone {
  if (pct >= 90) return 'good';
  if (pct >= 70) return 'warn';
  return 'bad';
}

const TONES: Tone[] = ['good', 'warn', 'bad', 'neutral'];

function cleanPart(p: any): AiPart | null {
  if (!p || typeof p !== 'object') return null;
  const s = (x: unknown, n: number) => stripMarkdown(String(x ?? '')).slice(0, n);
  const part: AiPart = {
    verdict: TONES.includes(p.verdict) ? p.verdict : 'neutral',
    headline: s(p.headline, 120),
    summary: s(p.summary, 400),
    problems: (Array.isArray(p.problems) ? p.problems : [])
      .slice(0, 3)
      .map((x: any) => ({
        text: s(typeof x === 'string' ? x : x?.text, 240),
        level: (x?.level === 'mid' ? 'mid' : 'high') as 'high' | 'mid',
      }))
      .filter((x: { text: string }) => x.text),
    actions: (Array.isArray(p.actions) ? p.actions : [])
      .slice(0, 3)
      .map((x: any) => ({
        title: s(typeof x === 'string' ? x : x?.title, 90),
        detail: s(typeof x === 'string' ? '' : x?.detail, 240),
      }))
      .filter((x: { title: string }) => x.title),
  };
  return part.headline || part.summary ? part : null;
}

const SYSTEM = `Siz Radeski Skin Clinic (dermatologiya klinikasi) rahbari uchun KPI tahlilchisiz.
Sizga hisobot maʼlumoti JSON koʻrinishida beriladi (raqamlar allaqachon hisoblangan).
Vazifa: rahbar 20 soniyada tushunadigan qisqa tahlil yozish.

Qoidalar:
- Faqat berilgan raqam va nomlardan foydalaning, hech narsa uydirmang.
- "partial": true kun — bugun, hali tugamagan. Uni muammo deb hisoblamang.
- Umumiy gaplar YOʻQ ("treninglar oʻtkazish", "monitoring qilish", "hamkorlikni kuchaytirish" kabi). Har bir muammo va harakat aniq ish, boʻlim, filial yoki kun nomini aytsin.
- Markdown YOʻQ (** , #). Qisqa gaplar.
- Maʼlumot juda kam boʻlsa — buni headline da ayting.

Javob FAQAT JSON, ikki tilda bir xil mazmun:
{"uz":{"verdict":"good|warn|bad","headline":"8–12 soʻzli asosiy xulosa","summary":"1–2 gap: nima yaxshi, nima yomon","problems":[{"text":"aniq muammo + raqam","level":"high|mid"}],"actions":[{"title":"qisqa buyruq (3–6 soʻz)","detail":"kim/nima/qachon — 1 gap"}]},
 "ru":{...xuddi shu, rus tilida}}
problems: 1–3 ta, actions: 1–3 ta.`;

export async function writeAiPart(
  report: Omit<AiReportV2, 'ai' | 'aiSource'>,
): Promise<{ uz: AiPart; ru: AiPart } | null> {
  const raw = await openaiChatMessages(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: JSON.stringify(report) },
    ],
    { json: true, maxTokens: 1400, temperature: 0.25 },
  );
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    const uz = cleanPart(p.uz);
    const ru = cleanPart(p.ru);
    if (!uz) return null;
    return { uz, ru: ru || uz };
  } catch {
    return null;
  }
}

/** OpenAI ishlamasa — raqamlardan qoidaga asoslangan qisqa xulosa */
export function rulesAiPart(r: Omit<AiReportV2, 'ai' | 'aiSource'>): { uz: AiPart; ru: AiPart } {
  const verdict = r.scoreTone;
  const weakBars = r.bars.filter((b) => b.tone !== 'good').slice(0, 2);
  const worstDay = r.days.filter((d) => !d.partial && d.tone === 'bad')[0];
  const problemsUz: AiPart['problems'] = [];
  const problemsRu: AiPart['problems'] = [];
  for (const b of weakBars) {
    problemsUz.push({ text: `${b.name}: ${b.done}/${b.total} (${b.pct}%)`, level: b.tone === 'bad' ? 'high' : 'mid' });
    problemsRu.push({ text: `${b.name}: ${b.done}/${b.total} (${b.pct}%)`, level: b.tone === 'bad' ? 'high' : 'mid' });
  }
  if (worstDay) {
    problemsUz.push({ text: `${worstDay.date}: ${worstDay.score}% — past kun`, level: 'high' });
    problemsRu.push({ text: `${worstDay.date}: ${worstDay.score}% — слабый день`, level: 'high' });
  }
  const actionsUz = r.missed.slice(0, 3).map((m) => ({
    title: m.title,
    detail: `${m.count} marta bajarilmagan — menejer bilan bugun yoping`,
  }));
  const actionsRu = r.missed.slice(0, 3).map((m) => ({
    title: m.title,
    detail: `Не выполнено ${m.count} раз — закрыть с менеджером сегодня`,
  }));
  const score = r.score ?? 0;
  return {
    uz: {
      verdict,
      headline:
        r.score == null ? 'Bu davr uchun maʼlumot yoʻq' : `Oʻrtacha ball ${score}% — ${verdict === 'good' ? 'yaxshi' : verdict === 'warn' ? 'oʻrtacha' : 'past'}`,
      summary: '',
      problems: problemsUz.slice(0, 3),
      actions: actionsUz,
    },
    ru: {
      verdict,
      headline:
        r.score == null ? 'За период нет данных' : `Средний балл ${score}% — ${verdict === 'good' ? 'хорошо' : verdict === 'warn' ? 'средне' : 'низко'}`,
      summary: '',
      problems: problemsRu.slice(0, 3),
      actions: actionsRu,
    },
  };
}

/** Bildirishnoma uchun bir qatorli matn */
export function reportPreview(r: AiReportV2, periodLabel: string) {
  const head = r.ai?.uz.headline || '';
  const score = r.score != null ? `${r.score}%` : '—';
  return `${periodLabel} ${r.kind}${r.branch ? ` · ${r.branch}` : ''}: ${score}${head ? ` — ${head}` : ''}`;
}
