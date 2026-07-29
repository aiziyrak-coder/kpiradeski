import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ScoringService } from '../kpi/scoring.service';
import { CalendarService } from '../common/calendar.service';
import { toDateOnly } from '../common/kpi.constants';
import { openaiIntegrationsAudit } from '../common/openai';

const INTEGRATIONS_KEY = 'integrations';
const INTEGRATIONS_AUDIT_KEY = 'integrations_last_audit';

export type WebsiteIntegration = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
};

export type IntegrationsConfig = {
  telegram: {
    enabled: boolean;
    channelUrl: string;
    botUsername: string;
    notes: string;
  };
  instagram: {
    enabled: boolean;
    username: string;
    profileUrl: string;
    notes: string;
  };
  websites: WebsiteIntegration[];
};

function defaultIntegrations(): IntegrationsConfig {
  return {
    telegram: { enabled: false, channelUrl: '', botUsername: '', notes: '' },
    instagram: { enabled: false, username: '', profileUrl: '', notes: '' },
    websites: [],
  };
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(html: string, name: string) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    'i',
  );
  return html.match(re)?.[1] || html.match(re2)?.[1] || '';
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private scoring: ScoringService,
    private calendar: CalendarService,
  ) {}

  getWeights() {
    return this.prisma.kpiCatalogNode.findMany({
      where: { active: true, parentKey: null, weight: { gt: 0 } },
      orderBy: [{ frequency: 'asc' }, { sortOrder: 'asc' }],
      select: {
        key: true,
        titleUz: true,
        titleRu: true,
        weight: true,
        frequency: true,
      },
    });
  }

  async updateWeights(items: { blockKey: string; weight: number }[]) {
    // Frequency boʻyicha guruhlab 100 ga tekshirish
    const roots = await this.prisma.kpiCatalogNode.findMany({
      where: {
        key: { in: items.map((i) => i.blockKey) },
        parentKey: null,
        active: true,
      },
    });
    const byFreq = new Map<string, number>();
    for (const item of items) {
      const root = roots.find((r) => r.key === item.blockKey);
      if (!root) throw new BadRequestException(`Blok topilmadi: ${item.blockKey}`);
      byFreq.set(root.frequency, (byFreq.get(root.frequency) || 0) + item.weight);
    }
    for (const [freq, sum] of byFreq) {
      if (Math.abs(sum - 100) > 0.05) {
        throw new BadRequestException(
          `${freq} ogʻirliklar yigʻindisi 100 boʻlishi kerak (hozir: ${sum})`,
        );
      }
    }
    for (const item of items) {
      await this.prisma.kpiCatalogNode.update({
        where: { key: item.blockKey },
        data: { weight: item.weight },
      });
      // Legacy KpiWeight sync (dash key)
      const dash = item.blockKey.replace(/_w$/, '').replace(/_m$/, '');
      try {
        await this.prisma.kpiWeight.upsert({
          where: { blockKey: dash },
          create: {
            blockKey: dash,
            blockName: dash,
            weight: item.weight,
            frequency: 'daily',
          },
          update: { weight: item.weight },
        });
      } catch {
        /* legacy jadval ixtiyoriy */
      }
    }
    return this.getWeights();
  }

  getCalendar() {
    return this.calendar.calendarConfig();
  }

  getDayInfo(date?: string) {
    return this.calendar.getDayInfo(date);
  }

  setRestWeekdays(days: number[]) {
    return this.calendar.setRestWeekdays(days);
  }

  addHoliday(date: string, title: string) {
    return this.calendar.addHoliday(date, title);
  }

  removeHoliday(id: string) {
    return this.calendar.removeHoliday(id);
  }

  listProducts() {
    return this.prisma.warehouseProduct.findMany({ orderBy: { name: 'asc' } });
  }

  createProduct(data: {
    name: string;
    category: string;
    minStock: number;
    currentStock: number;
    expiryDate?: string;
    branchId?: string;
  }) {
    return this.prisma.warehouseProduct.create({
      data: {
        name: data.name,
        category: data.category,
        minStock: data.minStock,
        currentStock: data.currentStock,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        branchId: data.branchId,
      },
    });
  }

  async updateProduct(
    id: string,
    data: {
      name?: string;
      category?: string;
      minStock?: number;
      currentStock?: number;
      expiryDate?: string | null;
      branchId?: string;
    },
  ) {
    const product = await this.prisma.warehouseProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Mahsulot topilmadi');

    const updated = await this.prisma.warehouseProduct.update({
      where: { id },
      data: {
        name: data.name,
        category: data.category,
        minStock: data.minStock,
        currentStock: data.currentStock,
        expiryDate:
          data.expiryDate === null
            ? null
            : data.expiryDate
              ? new Date(data.expiryDate)
              : undefined,
        branchId: data.branchId,
      },
    });

    if (updated.currentStock <= updated.minStock) {
      await this.notifications.createForRoles(
        ['ADMIN', 'MANAGER', 'DIRECTOR', 'SUPER_ADMIN'],
        'Past zaxira',
        `${updated.name}: ${updated.currentStock} dona (min ${updated.minStock})`,
        'STOCK',
      );
    }

    await this.scoring.recalculateDailyScore(toDateOnly(new Date()));
    return updated;
  }

  async deleteProduct(id: string) {
    await this.prisma.warehouseProduct.delete({ where: { id } });
    return { ok: true };
  }

  async lowStock() {
    const products = await this.prisma.warehouseProduct.findMany();
    return products.filter((p) => p.currentStock <= p.minStock);
  }

  async expiringSoon(days = 30) {
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + days);
    return this.prisma.warehouseProduct.findMany({
      where: {
        expiryDate: { not: null, lte: until },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async getIntegrations(): Promise<{
    config: IntegrationsConfig;
    runtime: { telegramBotConfigured: boolean; telegramChatConfigured: boolean };
    lastAudit: any;
  }> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: INTEGRATIONS_KEY } });
    const audit = await this.prisma.appSetting.findUnique({
      where: { key: INTEGRATIONS_AUDIT_KEY },
    });
    const base = defaultIntegrations();
    const saved = (row?.value as Partial<IntegrationsConfig>) || {};
    const config: IntegrationsConfig = {
      telegram: { ...base.telegram, ...(saved.telegram || {}) },
      instagram: { ...base.instagram, ...(saved.instagram || {}) },
      websites: Array.isArray(saved.websites) ? saved.websites : [],
    };
    return {
      config,
      runtime: {
        telegramBotConfigured: !!process.env.TELEGRAM_BOT_TOKEN?.trim(),
        telegramChatConfigured: !!process.env.TELEGRAM_CHAT_ID?.trim(),
      },
      lastAudit: audit?.value ?? null,
    };
  }

  async updateIntegrations(input: Partial<IntegrationsConfig>) {
    const current = await this.getIntegrations();
    const next: IntegrationsConfig = {
      telegram: {
        ...current.config.telegram,
        ...(input.telegram || {}),
        enabled: !!(input.telegram?.enabled ?? current.config.telegram.enabled),
        channelUrl: String(input.telegram?.channelUrl ?? current.config.telegram.channelUrl).trim(),
        botUsername: String(
          input.telegram?.botUsername ?? current.config.telegram.botUsername,
        ).trim(),
        notes: String(input.telegram?.notes ?? current.config.telegram.notes).trim(),
      },
      instagram: {
        ...current.config.instagram,
        ...(input.instagram || {}),
        enabled: !!(input.instagram?.enabled ?? current.config.instagram.enabled),
        username: String(input.instagram?.username ?? current.config.instagram.username)
          .trim()
          .replace(/^@/, ''),
        profileUrl: String(
          input.instagram?.profileUrl ?? current.config.instagram.profileUrl,
        ).trim(),
        notes: String(input.instagram?.notes ?? current.config.instagram.notes).trim(),
      },
      websites: Array.isArray(input.websites)
        ? input.websites
            .filter((w) => w?.url)
            .map((w, i) => ({
              id: w.id || `web_${Date.now()}_${i}`,
              name: String(w.name || 'Sayt').trim() || 'Sayt',
              url: String(w.url).trim(),
              enabled: w.enabled !== false,
            }))
        : current.config.websites,
    };

    if (next.instagram.username && !next.instagram.profileUrl) {
      next.instagram.profileUrl = `https://instagram.com/${next.instagram.username}`;
    }

    await this.prisma.appSetting.upsert({
      where: { key: INTEGRATIONS_KEY },
      create: { key: INTEGRATIONS_KEY, value: next as any },
      update: { value: next as any },
    });

    return this.getIntegrations();
  }

  private async snapshotWebsite(url: string) {
    try {
      const u = new URL(url);
      if (!['http:', 'https:'].includes(u.protocol)) {
        return { url, error: 'Faqat http/https' };
      }
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
          'user-agent': 'RadeskiKPI-AI-Monitor/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      });
      const html = (await res.text()).slice(0, 120_000);
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
      const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
        .map((m) => stripHtml(m[1]).slice(0, 120))
        .filter(Boolean)
        .slice(0, 5);
      return {
        url,
        status: res.status,
        ok: res.ok,
        title: stripHtml(title).slice(0, 200),
        description: metaContent(html, 'description').slice(0, 300),
        ogTitle: metaContent(html, 'og:title').slice(0, 200),
        ogDescription: metaContent(html, 'og:description').slice(0, 300),
        canonical:
          html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || '',
        h1s,
        textSample: stripHtml(html).slice(0, 2500),
      };
    } catch (e: any) {
      return { url, error: String(e?.message || e).slice(0, 200) };
    }
  }

  async runIntegrationsAiAudit(reason = 'manual') {
    const { config, runtime } = await this.getIntegrations();

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 14);
    const [social, seo, doneKpi] = await Promise.all([
      this.prisma.socialStats.findMany({
        where: { date: { gte: since } },
        orderBy: { date: 'desc' },
        take: 40,
      }),
      this.prisma.seoCheck.findMany({
        where: { date: { gte: since } },
        orderBy: { date: 'desc' },
        take: 14,
      }),
      this.prisma.kpiDayEntry.count({
        where: { date: { gte: since }, done: true },
      }),
    ]);

    const hasOperationalData = social.length > 0 || seo.length > 0 || doneKpi > 0;

    // Real maʼlumot yoʻq — AI chaqirmaymiz, uydirma ball/item YOʻQ
    if (!hasOperationalData) {
      const stored = {
        at: new Date().toISOString(),
        reason,
        score: 0,
        overview:
          'Ish hali boshlanmagan — integratsiya balli 0/100. KPI, SEO yoki social yozuvlar paydo boʻlgach baholanadi.',
        items: [] as any[],
        priorities: [] as string[],
        siteCount: 0,
        hasOperationalData: false,
        fallback: false,
      };
      await this.prisma.appSetting.upsert({
        where: { key: INTEGRATIONS_AUDIT_KEY },
        create: { key: INTEGRATIONS_AUDIT_KEY, value: stored as any },
        update: { value: stored as any },
      });
      if (reason === 'manual') {
        await this.notifications.createForRoles(
          ['ADMIN', 'SUPER_ADMIN'],
          'AI integratsiya · ish boshlanmagan (0/100)',
          stored.overview,
          'AI_REPORT',
          { telegram: false },
        );
      }
      this.logger.log(`Integrations AI audit skipped (${reason}) — no operational data`);
      return stored;
    }

    const enabledSites = config.websites.filter((w) => w.enabled && w.url);
    const siteSnapshots: any[] = [];
    for (const site of enabledSites.slice(0, 5)) {
      siteSnapshots.push({
        name: site.name,
        ...(await this.snapshotWebsite(site.url)),
      });
    }

    const payload = {
      reason,
      clinic: 'Radeski Skin Clinic',
      hasOperationalData: true,
      note: 'Operatsion metrikalar bor — faqat shu asosida baholang, uydirma raqam BERMANG.',
      telegram: {
        ...config.telegram,
        runtimeBot: runtime.telegramBotConfigured,
        runtimeChat: runtime.telegramChatConfigured,
      },
      instagram: config.instagram,
      websites: siteSnapshots,
      recentSocialStats: social,
      recentSeoChecks: seo,
      doneKpiEntries14d: doneKpi,
    };

    const audit = await openaiIntegrationsAudit(payload, { hasOperationalData: true });
    const score = audit?.score ?? 0;
    const overview = audit?.overview || null;

    const stored = {
      at: new Date().toISOString(),
      reason,
      score,
      overview,
      items: audit?.items ?? [],
      priorities: audit?.priorities ?? [],
      siteCount: siteSnapshots.length,
      hasOperationalData: true,
      fallback: !audit,
    };

    await this.prisma.appSetting.upsert({
      where: { key: INTEGRATIONS_AUDIT_KEY },
      create: { key: INTEGRATIONS_AUDIT_KEY, value: stored as any },
      update: { value: stored as any },
    });

    const critical = (stored.items || []).filter(
      (i: any) => i.severity === 'critical' || i.severity === 'high',
    );
    const shouldTelegram = critical.length > 0 || score < 50;

    if (overview && shouldTelegram) {
      const msg = [
        `Ball: ${score}/100`,
        overview,
        critical.length
          ? `Muhim:\n• ${critical
              .slice(0, 5)
              .map((c: any) => `${c.title}: ${c.action}`)
              .join('\n• ')}`
          : '',
        stored.priorities?.length
          ? `Prioritetlar: ${stored.priorities.slice(0, 4).join('; ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 1800);

      await this.notifications.createForRoles(
        ['ADMIN', 'SUPER_ADMIN', 'DIRECTOR'],
        `AI integratsiya auditi · ${score}/100`,
        msg,
        'AI_REPORT',
        { telegram: true, emoji: '📡' },
      );
    }

    this.logger.log(
      `Integrations AI audit done (${reason}) score=${stored.score} tg=${shouldTelegram}`,
    );
    return stored;
  }

  @Cron('0 10,18 * * *', { timeZone: 'Asia/Tashkent' })
  async integrationsAuditCron() {
    try {
      const { config } = await this.getIntegrations();
      const any =
        config.telegram.enabled ||
        config.instagram.enabled ||
        config.websites.some((w) => w.enabled);
      if (!any) return;
      await this.runIntegrationsAiAudit('cron');
    } catch (e) {
      this.logger.warn(`Integrations cron failed: ${e}`);
    }
  }
}
