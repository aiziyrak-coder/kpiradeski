import { Injectable } from '@nestjs/common';
import { KpiFrequency, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  openaiChatMessages,
  openaiSpeak,
  openaiTranscribe,
} from '../common/openai';
import { toDateOnly } from '../common/kpi.constants';

const PAGES: Record<string, string> = {
  dashboard: '/dashboard',
  today: '/today',
  ishlar: '/today',
  задачичи: '/today',
  reports: '/reports',
  отчёт: '/reports',
  отчеты: '/reports',
  audit: '/reports?tab=audit',
  аудит: '/reports?tab=audit',
  users: '/users',
  пользователи: '/users',
  branches: '/branches',
  филиалы: '/branches',
  ai: '/ai',
  assistant: '/assistant',
  ассистент: '/assistant',
  'ai assistant': '/assistant',
  notifications: '/notifications',
  account: '/account',
};

export type AssistantReply = {
  reply: string;
  navigate?: string | null;
  speakRuOnly?: boolean;
  language: string;
  audioBase64?: string | null;
  suggestions?: string[];
  transcript?: string;
};

@Injectable()
export class AssistantService {
  constructor(private prisma: PrismaService) {}

  async buildContext(user: { id: string; role: Role; name?: string }) {
    const date = toDateOnly();
    const weekAgo = new Date(date);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);
    const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

    const branches = await this.prisma.branch.findMany({
      where: { active: true },
      include: {
        managers: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    const [scores, weekScores, monthScores, entries] = await Promise.all([
      this.prisma.dailyScore.findMany({
        where: { date, branchId: { not: null } },
        include: { branch: { select: { name: true } } },
      }),
      this.prisma.dailyScore.findMany({
        where: { date: { gte: weekAgo, lte: date }, branchId: { not: null } },
        orderBy: { date: 'asc' },
        include: { branch: { select: { name: true } } },
      }),
      this.prisma.dailyScore.findMany({
        where: { date: { gte: monthStart, lte: date }, branchId: { not: null } },
        include: { branch: { select: { name: true } } },
      }),
      this.prisma.kpiDayEntry.findMany({
        where: { date },
        include: {
          proofs: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      }),
    ]);

    const catalog = await this.prisma.kpiCatalogNode.findMany({
      where: { active: true, frequency: KpiFrequency.DAILY, parentKey: null },
      orderBy: { sortOrder: 'asc' },
    });

    const incomplete: string[] = [];
    const doneKeys = new Set(entries.filter((e) => e.done).map((e) => e.nodeKey));
    const leaves = await this.prisma.kpiCatalogNode.findMany({
      where: {
        active: true,
        frequency: KpiFrequency.DAILY,
        inputType: { not: 'GROUP' },
      },
    });
    for (const leaf of leaves) {
      if (!doneKeys.has(leaf.key)) incomplete.push(`${leaf.titleRu || leaf.titleUz} (${leaf.key})`);
    }

    const managersIdle = branches
      .filter((b) => {
        const branchEntries = entries.filter((e) => e.branchId === b.id);
        return branchEntries.filter((e) => e.done).length < 5;
      })
      .map((b) => ({
        branch: b.name,
        managers: b.managers.map((m) => m.user?.name).filter(Boolean),
        doneToday: entries.filter((e) => e.branchId === b.id && e.done).length,
      }));

    const avg = (list: { totalScore: number }[]) =>
      list.length
        ? Math.round((list.reduce((s, x) => s + x.totalScore, 0) / list.length) * 10) / 10
        : null;

    return {
      now: new Date().toISOString(),
      date: date.toISOString().slice(0, 10),
      user: { name: user.name, role: user.role },
      platform: 'Radeski KPI manager system',
      clinic: 'Radeski Skin Clinic / dermatologiya',
      pages: Object.values(PAGES),
      blocks: catalog.map((c) => ({
        key: c.key.replace(/_w$|_m$/, ''),
        title: c.titleRu,
        weight: c.weight,
      })),
      scores: scores.map((s) => ({
        branch: s.branch?.name,
        total: s.totalScore,
        blocks: s.blockScores,
        color: s.colorStatus,
        completion: s.completion,
      })),
      weekTrend: {
        avgScore: avg(weekScores),
        days: weekScores.length,
        byDay: weekScores.map((s) => ({
          date: s.date.toISOString().slice(0, 10),
          branch: s.branch?.name,
          total: s.totalScore,
          color: s.colorStatus,
        })),
      },
      monthTrend: {
        avgScore: avg(monthScores),
        days: monthScores.length,
      },
      incompleteSample: incomplete.slice(0, 40),
      incompleteTotal: incomplete.length,
      managersIdle,
      leafTotal: leaves.length,
      leafDone: leaves.filter((l) => doneKeys.has(l.key)).length,
      completionPct: leaves.length
        ? Math.round((leaves.filter((l) => doneKeys.has(l.key)).length / leaves.length) * 100)
        : 0,
    };
  }

  async suggestions(user: { id: string; role: Role; name?: string }) {
    const ctx = await this.buildContext(user);
    const isAdmin = user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;

    const system = isAdmin
      ? `Ты — AI assistant Radeski: элитный бизнес-помощник владельца клиники.
Дай 5–7 коротких, жёстких и практичных рекомендаций по развитию на русском.
Учитывай незавершённые задачи, тренд недели/месяца и простои менеджеров.
Ответ JSON: {"items":[{"title":"...","detail":"...","priority":"high|mid|low","navigate":"/path или null"}]}`
      : `Siz Radeski klinikasi uchun kuchli AI assistant biznes yordamchisisiz.
Bugungi KPI, ishlar va biznes holatiga asoslanib 5 ta aniq amaliy tavsiya bering.
Javob JSON: {"items":[{"title":"...","detail":"...","priority":"high|mid|low","navigate":"/today"}]}`;

    const raw = await openaiChatMessages(
      [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(ctx) },
      ],
      { json: true, maxTokens: 1200, temperature: 0.45 },
    );

    if (!raw) {
      const fallback = ctx.incompleteSample.slice(0, 5).map((t) => ({
        title: isAdmin ? 'Незавершённая задача' : 'Bajarilmagan ish',
        detail: t,
        priority: 'high' as const,
        navigate: '/today',
      }));
      if (ctx.managersIdle.length) {
        fallback.unshift({
          title: isAdmin ? 'Менеджер не закрывает KPI' : 'KPI past',
          detail: ctx.managersIdle
            .map((m) => `${m.branch}: ${m.doneToday} ish`)
            .join('; '),
          priority: 'high',
          navigate: '/today',
        });
      }
      return { items: fallback, context: ctx };
    }

    try {
      const parsed = JSON.parse(raw);
      return { items: parsed.items || [], context: ctx };
    } catch {
      return { items: [], context: ctx, raw };
    }
  }

  detectNavigate(text: string): string | null {
    const lower = text.toLowerCase();
    for (const [k, path] of Object.entries(PAGES)) {
      if (lower.includes(k)) return path;
    }
    if (/открой|och|open/.test(lower) && /отчёт|hisobot|report/.test(lower)) return '/reports';
    if (/открой|och|open/.test(lower) && /задач|ishlar|today/.test(lower)) return '/today';
    if (/открой|och|open/.test(lower) && /пользовател|foydalanuv|user/.test(lower))
      return '/users';
    if (/открой|och|open/.test(lower) && /филиал|branch/.test(lower)) return '/branches';
    if (/открой|och|open/.test(lower) && /dashboard|дашборд|holat/.test(lower))
      return '/dashboard';
    return null;
  }

  looksRussian(text: string): boolean {
    const cyr = (text.match(/[А-Яа-яЁё]/g) || []).length;
    const lat = (text.match(/[A-Za-zʻʼ']/g) || []).length;
    return cyr >= lat && cyr > 0;
  }

  async chat(
    user: { id: string; role: Role; name?: string },
    message: string,
    opts?: { wantAudio?: boolean; history?: Array<{ role: string; content: string }> },
  ): Promise<AssistantReply> {
    const isAdmin = user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;
    const ctx = await this.buildContext(user);
    const navigateHint = this.detectNavigate(message);

    if (isAdmin && message.trim() && !this.looksRussian(message)) {
      const reply =
        'Я говорю только на русском. Пожалуйста, задайте вопрос по-русски. I speak Russian only — please ask in Russian.';
      let audioBase64: string | null = null;
      if (opts?.wantAudio !== false) {
        const audio = await openaiSpeak(reply, { languageHint: 'ru', voice: 'onyx' });
        if (audio) audioBase64 = audio.toString('base64');
      }
      return { reply, language: 'ru', speakRuOnly: true, audioBase64, navigate: null };
    }

    const system = isAdmin
      ? `Ты — AI assistant Radeski: фантастически сильный бизнес-помощник владельца/админа клиники.
Говори ТОЛЬКО по-русски. Имя продукта: «AI assistant» (не Jarvis).
Ты видишь реальное состояние платформы из CONTEXT (KPI дня, тренд недели/месяца, незакрытые задачи, простаивающие менеджеры).

Твои сверхспособности:
1) Операционный контроль — что не сделано сегодня, кто отстаёт, какой блок тянет балл вниз
2) Стратегия роста — маркетинг, SMM/SEO, конверсия звонков, сервис, HR, касса, бренд
3) Финансово-операционный совет — приоритеты на день/неделю/месяц с конкретными шагами
4) Навигация платформы — открывай разделы через navigate из pages
5) Честные жёсткие выводы без воды — как топ-консультант + операционный директор клиники

Формат ответа строго JSON:
{"reply":"развёрнутый полезный ответ","navigate":"/path или null","suggestions":["следующий вопрос 1","..."]}
Структурируй reply: вывод → цифры из CONTEXT → 2–4 действия. Не выдумывай данные вне CONTEXT.`
      : `Siz Radeski Skin Clinic uchun kuchli AI assistant biznes yordamchisisiz.
Mahsulot nomi: «AI assistant» (Jarvis emas).
Foydalanuvchi qaysi tilda yozsa/gapirsa — SHU tilda javob bering (uz yoki ru).

CONTEXT dagi real KPI, bajarilmagan ishlar, haftalik/oylik trend va filial holatidan foydalaning.
Qila olasiz:
- bugungi/haftalik/oylik ishlarni tahlil qilish va nima qilishni aytish
- qoʻngʻiroq konversiyasi, sharhlar, SMM, marketing boʻyicha amaliy maslahat
- menejer kunini prioritetlash (eng muhim 3 ish)
- platforma boʻlimlarini ochish (navigate)

Javob faqat JSON:
{"reply":"...","navigate":"/path yoki null","suggestions":["..."]}
Aniq, qisqa, amaliy boʻling. CONTEXT dan tashqari raqam uydirmang.`;

    const history = (opts?.history || [])
      .slice(-8)
      .map((h) => ({
        role: (h.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: h.content,
      }));

    const raw = await openaiChatMessages(
      [
        { role: 'system', content: system },
        ...history,
        {
          role: 'user',
          content: `CONTEXT:\n${JSON.stringify(ctx)}\n\nUSER:\n${message}\n\nHint navigate: ${navigateHint || 'null'}`,
        },
      ],
      { json: true, maxTokens: 2200, temperature: 0.35 },
    );

    let reply = raw || (isAdmin ? 'Сервис ИИ временно недоступен.' : 'AI hozircha javob bera olmadi.');
    let navigate = navigateHint;
    let suggestions: string[] = [];
    let language = isAdmin ? 'ru' : this.looksRussian(message) ? 'ru' : 'uz';

    try {
      const parsed = JSON.parse(raw || '{}');
      if (parsed.reply) reply = parsed.reply;
      if (parsed.navigate) navigate = parsed.navigate;
      if (Array.isArray(parsed.suggestions)) suggestions = parsed.suggestions;
    } catch {
      /* plain text */
    }

    if (isAdmin && !this.looksRussian(reply)) {
      // force Russian feel if model drifted
    }

    let audioBase64: string | null = null;
    if (opts?.wantAudio !== false && (isAdmin || opts?.wantAudio)) {
      const audio = await openaiSpeak(reply, {
        languageHint: language === 'ru' ? 'ru' : 'uz',
        voice: isAdmin ? 'onyx' : 'nova',
      });
      if (audio) audioBase64 = audio.toString('base64');
    }

    return {
      reply,
      navigate: navigate || null,
      language,
      audioBase64,
      suggestions,
    };
  }

  async voice(
    user: { id: string; role: Role; name?: string },
    file: Buffer,
    filename: string,
    opts?: { history?: Array<{ role: string; content: string }> },
  ): Promise<AssistantReply> {
    const isAdmin = user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;
    const tr = await openaiTranscribe(file, filename);
    if (!tr?.text) {
      const reply = isAdmin
        ? 'Не удалось распознать речь. Повторите, пожалуйста, по-русски.'
        : 'Ovozni aniqlab boʻlmadi. Qayta urinib koʻring.';
      const audio = await openaiSpeak(reply, {
        languageHint: isAdmin ? 'ru' : 'uz',
        voice: isAdmin ? 'onyx' : 'nova',
      });
      return {
        reply,
        language: isAdmin ? 'ru' : 'uz',
        audioBase64: audio?.toString('base64') || null,
        transcript: '',
      };
    }

    if (isAdmin && tr.language && !['ru', 'russian'].includes(tr.language.toLowerCase()) && !this.looksRussian(tr.text)) {
      const reply =
        'Я общаюсь только на русском языке. Пожалуйста, говорите по-русски. Ask in Russian.';
      const audio = await openaiSpeak(reply, { languageHint: 'ru', voice: 'onyx' });
      return {
        reply,
        language: 'ru',
        speakRuOnly: true,
        audioBase64: audio?.toString('base64') || null,
        transcript: tr.text,
      };
    }

    const result = await this.chat(user, tr.text, {
      wantAudio: true,
      history: opts?.history,
    });
    return { ...result, transcript: tr.text };
  }
}
