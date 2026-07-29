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
  'ai report': '/ai',
  'ai hisobot': '/ai',
  hisobot: '/reports',
  assistant: '/assistant',
  ассистент: '/assistant',
  'ai assistant': '/assistant',
  notifications: '/notifications',
  account: '/account',
  settings: '/settings',
  sozlamalar: '/settings',
  настройки: '/settings',
  integrations: '/settings',
  интеграц: '/settings',
  marketing: '/marketing',
  маркетинг: '/marketing',
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
        where: { date, frequency: 'DAILY', branchId: { not: null } },
        include: { branch: { select: { name: true } } },
      }),
      this.prisma.dailyScore.findMany({
        where: {
          date: { gte: weekAgo, lte: date },
          frequency: 'DAILY',
          branchId: { not: null },
        },
        orderBy: { date: 'asc' },
        include: { branch: { select: { name: true } } },
      }),
      this.prisma.dailyScore.findMany({
        where: {
          date: { gte: monthStart, lte: date },
          frequency: 'DAILY',
          branchId: { not: null },
        },
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

    const [integrationsRow, auditRow, recentProofs, social] = await Promise.all([
      this.prisma.appSetting.findUnique({ where: { key: 'integrations' } }),
      this.prisma.appSetting.findUnique({ where: { key: 'integrations_last_audit' } }),
      this.prisma.kpiProof.findMany({
        where: { createdAt: { gte: weekAgo } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          aiStatus: true,
          aiNote: true,
          aiFeedback: true,
          createdAt: true,
          entry: { select: { nodeKey: true, branchId: true } },
        },
      }),
      this.prisma.socialStats.findMany({
        where: { date: { gte: weekAgo } },
        orderBy: { date: 'desc' },
        take: 20,
      }),
    ]);

    const integrations = (integrationsRow?.value as any) || null;
    const lastAudit = (auditRow?.value as any) || null;

    return {
      now: new Date().toISOString(),
      date: date.toISOString().slice(0, 10),
      user: { name: user.name, role: user.role },
      platform: 'Radeski KPI manager system',
      clinic: 'Radeski Skin Clinic / dermatologiya',
      mission:
        'Klinika sifatini oshirish, menejerlarni coaching qilish, marketing kanallarini nazorat qilish, KPI ni real biznes natijaga bogʻlash',
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
      integrations: integrations
        ? {
            telegram: {
              enabled: !!integrations?.telegram?.enabled,
              channelUrl: integrations?.telegram?.channelUrl || null,
            },
            instagram: {
              enabled: !!integrations?.instagram?.enabled,
              username: integrations?.instagram?.username || null,
            },
            websites: (integrations?.websites || []).map((w: any) => ({
              name: w.name,
              url: w.url,
              enabled: w.enabled !== false,
            })),
          }
        : null,
      integrationsAudit: lastAudit?.hasOperationalData
        ? {
            at: lastAudit.at,
            score: lastAudit.score,
            overview: lastAudit.overview,
            priorities: lastAudit.priorities,
            topIssues: (lastAudit.items || []).slice(0, 8),
          }
        : null,
      recentProofReviews: recentProofs.map((p) => ({
        status: p.aiStatus,
        note: p.aiNote,
        feedback: p.aiFeedback,
        nodeKey: p.entry?.nodeKey,
      })),
      socialWeek: social,
    };
  }

  async suggestions(user: { id: string; role: Role; name?: string }) {
    const ctx = await this.buildContext(user);
    const isAdmin = user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;

    const system = isAdmin
      ? `Ты — AI assistant Radeski: элитный CEO/COO-советник владельца клиники.
Дай 6–8 жёстких, приоритетных рекомендаций на русском.
Учитывай: незакрытые KPI, простой менеджеров, тренд, интеграции (Telegram/Instagram/сайт) и последний AI-аудит каналов.
Каждая рекомендация = конкретное действие + ожидаемый эффект.
Ответ JSON: {"items":[{"title":"...","detail":"...","priority":"high|mid|low","navigate":"/path или null"}]}`
      : `Siz Radeski klinikasi uchun kuchli AI murabbiy va biznes yordamchisisiz.
Bugungi KPI, bajarilmagan ishlar, dalillar sifatiga asoslanib 5–6 ta aniq tavsiya bering.
Menejerni ragʻbatlantiring, lekin kamchilikni ochiq ayting. Keyingi 3 ustuvor ishni ajrating.
Javob JSON: {"items":[{"title":"...","detail":"...","priority":"high|mid|low","navigate":"/today"}]}`;

    const raw = await openaiChatMessages(
      [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(ctx) },
      ],
      { json: true, maxTokens: 1200, temperature: 0.45 },
    );

    if (!raw) {
      if (!ctx.incompleteSample?.length && !ctx.managersIdle?.length) {
        return {
          items: [
            {
              title: isAdmin ? 'Данных ещё нет' : 'Maʼlumot hali yoʻq',
              detail: isAdmin
                ? 'Реальная работа не начата — рекомендации появятся после первых KPI.'
                : 'Ish hali boshlanmagan — birinchi topshiriqlardan keyin tavsiyalar chiqadi.',
              priority: 'mid' as const,
              navigate: '/today',
            },
          ],
          context: ctx,
        };
      }
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
    if (/открой|och|open|sozlama|настрой|integrat/.test(lower) && /setting|sozlama|настрой|integrat|telegram|instagram|сайт|sayt/.test(lower))
      return '/settings';
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
      ? `Ты — AI assistant Radeski: фантастически сильный бизнес-партнёр владельца (CEO + COO + CMO в одном).
Говори ТОЛЬКО по-русски. Имя продукта: «AI assistant».
CONTEXT содержит реальное состояние: KPI, тренды, незакрытые задачи, менеджеры, интеграции (Telegram/Instagram/сайты), AI-аудит каналов, доказательства.

Твои сверхспособности:
1) Операционный контроль — что не сделано, кто отстаёт, качество доказательств
2) Коучинг менеджеров — как говорить с командой, что требовать сегодня
3) Маркетинг/бренд — Instagram, Telegram, сайт: контент, SEO, CTA, ритм публикаций
4) Стратегия роста — конверсия звонков, сервис, HR, выручка, репутация
5) Навигация — открывай /settings, /today, /reports, /marketing, /assistant и др.
6) Честные жёсткие выводы без воды — как топ-консультант сети клиник

Формат строго JSON:
{"reply":"развёрнутый полезный ответ","navigate":"/path или null","suggestions":["следующий вопрос 1","..."]}
Структура reply: вердикт → цифры из CONTEXT → 2–4 действия. Не выдумывай данные вне CONTEXT.`
      : `Siz Radeski Skin Clinic uchun kuchli AI murabbiy + biznes sheriksiz.
Mahsulot nomi: «AI assistant».
Foydalanuvchi qaysi tilda yozsa — SHU tilda javob bering (uz/ru).

CONTEXT dagi real KPI, bajarilmagan ishlar, dalillar, haftalik trend, (agar boʻlsa) marketing kanallari holatidan foydalaning.
Siz:
- ish yuborilganda sifatni baholaysiz va kamchilikni ochiq aytasiz
- qilinmagan ishlarni prioritetlab, nima qilishni aniq buyurasiz
- SMM/SEO/Telegram/sayt boʻyicha amaliy maslahat berasiz
- menejerni ragʻbatlantirasiz, lekin yumshoq yolgʻon gapirmaysiz
- platforma boʻlimlarini ochasiz (navigate)

Javob faqat JSON:
{"reply":"...","navigate":"/path yoki null","suggestions":["..."]}
Aniq, qisqa, amaliy. CONTEXT dan tashqari raqam uydirmang.`;

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
