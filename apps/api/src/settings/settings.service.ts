import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ScoringService } from '../kpi/scoring.service';
import { CalendarService } from '../common/calendar.service';
import { toDateOnly } from '../common/kpi.constants';
import { openaiIntegrationsAudit } from '../common/openai';
import {
  defaultIntegrations,
  normalizeIntegrations,
  type IntegrationsConfig,
  type WebsiteIntegration,
} from './integrations.types';

export type { IntegrationsConfig, WebsiteIntegration };

const INTEGRATIONS_KEY = 'integrations';
const INTEGRATIONS_AUDIT_KEY = 'integrations_last_audit';

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
    const config = normalizeIntegrations(
      (row?.value as Partial<IntegrationsConfig>) || defaultIntegrations(),
    );
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
    const merged: Partial<IntegrationsConfig> = {
      ...current.config,
      ...input,
      telegram: {
        ...current.config.telegram,
        ...(input.telegram || {}),
        botUsername: String(
          input.telegram?.botUsername ?? current.config.telegram.botUsername,
        ).trim(),
      },
      telegramChannels: Array.isArray(input.telegramChannels)
        ? input.telegramChannels
        : current.config.telegramChannels,
      instagramProfiles: Array.isArray(input.instagramProfiles)
        ? input.instagramProfiles
        : current.config.instagramProfiles,
      websites: Array.isArray(input.websites) ? input.websites : current.config.websites,
    };

    // Agar faqat legacy single telegram yuborilsa — massivga koʻchir
    if (
      !Array.isArray(input.telegramChannels) &&
      input.telegram?.channelUrl &&
      !merged.telegramChannels?.length
    ) {
      merged.telegramChannels = [
        {
          id: 'tg_main',
          name: 'Asosiy kanal',
          url: String(input.telegram.channelUrl).trim(),
          enabled: input.telegram.enabled !== false,
          notes: String(input.telegram.notes || '').trim(),
        },
      ];
    }
    if (
      !Array.isArray(input.instagramProfiles) &&
      (input.instagram?.profileUrl || input.instagram?.username) &&
      !merged.instagramProfiles?.length
    ) {
      const username = String(input.instagram.username || '')
        .trim()
        .replace(/^@/, '');
      merged.instagramProfiles = [
        {
          id: 'ig_main',
          name: username || 'Instagram',
          username,
          profileUrl:
            String(input.instagram.profileUrl || '').trim() ||
            (username ? `https://instagram.com/${username}` : ''),
          enabled: input.instagram.enabled !== false,
          notes: String(input.instagram.notes || '').trim(),
        },
      ];
    }

    const next = normalizeIntegrations(merged);

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

  /** t.me/xxx → preview URL (ochiq kanallar uchun) */
  private telegramPreviewUrl(url: string): string | null {
    try {
      const u = new URL(url);
      if (!/(^|\.)t\.me$/i.test(u.hostname)) return null;
      const parts = u.pathname.split('/').filter(Boolean);
      if (!parts.length || parts[0] === 's') return url;
      const handle = parts[0].replace(/^@/, '');
      if (!handle || handle === 'joinchat' || handle === 'c') return null;
      return `https://t.me/s/${handle}`;
    } catch {
      return null;
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

    const enabledTg = config.telegramChannels.filter((c) => c.enabled && c.url);
    const enabledIg = config.instagramProfiles.filter(
      (p) => p.enabled && (p.profileUrl || p.username),
    );
    const enabledSites = config.websites.filter((w) => w.enabled && w.url);
    const hasLinks = enabledTg.length > 0 || enabledIg.length > 0 || enabledSites.length > 0;
    const hasOperationalData = social.length > 0 || seo.length > 0 || doneKpi > 0;

    if (!hasLinks) {
      const stored = {
        at: new Date().toISOString(),
        reason,
        score: 0,
        overview:
          'Integratsiya linklari yoʻq. Telegram kanal, Instagram sahifa yoki sayt (radeski.uz) qoʻshing — keyin AI tahlil qiladi.',
        items: [] as any[],
        priorities: ['Telegram/Instagram/sayt linklarini Integratsiyalar sahifasida qoʻshing'],
        siteCount: 0,
        hasOperationalData: false,
        hasLinks: false,
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
          'AI integratsiya · linklar yoʻq',
          stored.overview,
          'AI_REPORT',
          { telegram: false },
        );
      }
      return stored;
    }

    const siteSnapshots: any[] = [];
    for (const site of enabledSites.slice(0, 6)) {
      siteSnapshots.push({
        name: site.name,
        ...(await this.snapshotWebsite(site.url)),
      });
    }

    const telegramSnapshots: any[] = [];
    for (const ch of enabledTg.slice(0, 5)) {
      const preview = this.telegramPreviewUrl(ch.url);
      telegramSnapshots.push({
        name: ch.name,
        url: ch.url,
        notes: ch.notes || '',
        preview: preview ? await this.snapshotWebsite(preview) : { url: ch.url, note: 'preview yoʻq' },
      });
    }

    const instagramSnapshots = enabledIg.slice(0, 5).map((p) => ({
      name: p.name,
      username: p.username,
      profileUrl: p.profileUrl,
      notes: p.notes || '',
      note: 'Instagram HTML odatda bloklanadi — URL/username va izohlar asosida baholang',
    }));

    const payload = {
      reason,
      clinic: 'Radeski Skin Clinic',
      hasLinks: true,
      hasOperationalData,
      note: hasOperationalData
        ? 'Kanal linklari + operatsion metrikalar bor. Uydirma follower/like BERMANG.'
        : 'Kanal linklari va sayt snapshotlari asosida tahlil qiling. Follower/like uydirmang.',
      telegramBot: {
        runtimeBot: runtime.telegramBotConfigured,
        runtimeChat: runtime.telegramChatConfigured,
        botUsername: config.telegram.botUsername || null,
      },
      telegramChannels: telegramSnapshots,
      instagramProfiles: instagramSnapshots,
      websites: siteSnapshots,
      recentSocialStats: social,
      recentSeoChecks: seo,
      doneKpiEntries14d: doneKpi,
    };

    const audit = await openaiIntegrationsAudit(payload, {
      hasOperationalData,
      hasLinks: true,
    });
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
      telegramCount: telegramSnapshots.length,
      instagramCount: instagramSnapshots.length,
      hasOperationalData,
      hasLinks: true,
      fallback: !audit,
      channels: {
        websites: siteSnapshots.map((s) => ({
          name: s.name,
          url: s.url,
          ok: s.ok,
          title: s.title,
          error: s.error,
        })),
        telegram: enabledTg.map((c) => ({ name: c.name, url: c.url })),
        instagram: enabledIg.map((p) => ({
          name: p.name,
          username: p.username,
          profileUrl: p.profileUrl,
        })),
      },
    };

    await this.prisma.appSetting.upsert({
      where: { key: INTEGRATIONS_AUDIT_KEY },
      create: { key: INTEGRATIONS_AUDIT_KEY, value: stored as any },
      update: { value: stored as any },
    });

    // Faqat ichki bildirishnoma — Telegram spam yoʻq (soʻralganda AI javob beradi)
    if (reason === 'manual' && overview) {
      await this.notifications.createForRoles(
        ['ADMIN', 'SUPER_ADMIN', 'DIRECTOR'],
        `AI integratsiya auditi · ${score}/100`,
        overview.slice(0, 500),
        'AI_REPORT',
        { telegram: false, emoji: '📡' },
      );
    }

    this.logger.log(`Integrations AI audit done (${reason}) score=${stored.score}`);
    return stored;
  }

  @Cron('0 10,18 * * *', { timeZone: 'Asia/Tashkent' })
  async integrationsAuditCron() {
    try {
      const { config } = await this.getIntegrations();
      const any =
        config.telegramChannels.some((c) => c.enabled && c.url) ||
        config.instagramProfiles.some((p) => p.enabled && (p.profileUrl || p.username)) ||
        config.websites.some((w) => w.enabled && w.url);
      if (!any) return;
      await this.runIntegrationsAiAudit('cron');
    } catch (e) {
      this.logger.warn(`Integrations cron failed: ${e}`);
    }
  }
}
