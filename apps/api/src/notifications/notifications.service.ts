import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { CalendarService } from '../common/calendar.service';
import { toDateOnly } from '../common/kpi.constants';
import { blockLabel, scoreIcon } from '../telegram/tg-format';

const TZ = 'Asia/Tashkent';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => TelegramBotService))
    private telegram: TelegramBotService,
    private calendar: CalendarService,
  ) {}

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async sendTelegram(text: string) {
    return this.telegram.send(text);
  }

  async testTelegram() {
    const configured = {
      botToken: !!process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID || null,
      duties: [
        '08:00 — ish kuni: kunlik vazifalar ochiladi',
        'Dam olish (Sh/Ya + bayram) — vazifa yoʻq',
        '09:00–22:00 — soatlik qisqa eslatma',
        '19:00 — AI kunlik nazorat',
        'Shanba 18:00 — haftalik vazifalar ijrosi hisoboti',
        'Buyruqlar: /bugun /holat /vazifalar /yordam',
      ],
    };
    const result = await this.telegram.send(this.telegram.testText(), undefined, {
      buttons: false,
    });
    return { ...configured, ...result };
  }

  async createForRoles(
    roles: Array<'ADMIN' | 'MANAGER' | 'DIRECTOR' | 'SUPER_ADMIN'>,
    title: string,
    message: string,
    type: 'REMINDER' | 'ALERT' | 'AI_REPORT' | 'STOCK' | 'SCORE' | 'MYSTERY' | 'SYSTEM' = 'SYSTEM',
    opts?: { telegram?: boolean; emoji?: string; category?: string },
  ) {
    const users = await this.prisma.user.findMany({ where: { role: { in: roles }, active: true } });
    if (users.length) {
      await this.prisma.notification.createMany({
        data: users.map((u) => ({ userId: u.id, title, message, type })),
      });
    }
    if (opts?.telegram !== false) {
      const emoji =
        opts?.emoji ||
        ({
          REMINDER: '⏰',
          ALERT: '🚨',
          AI_REPORT: '🤖',
          STOCK: '📦',
          SCORE: '📉',
          MYSTERY: '🕵️',
          SYSTEM: '🔔',
        }[type] || '🔔');
      const category =
        opts?.category ||
        ({
          REMINDER: 'Eslatma',
          ALERT: 'Ogohlantirish',
          AI_REPORT: 'AI',
          STOCK: 'Ombor',
          SCORE: 'KPI',
          MYSTERY: 'Sifat',
          SYSTEM: 'Tizim',
        }[type] || 'Bildirishnoma');
      await this.telegram.notify(title, message, emoji, {
        category,
        buttons: false,
      });
    }
  }

  async pushTelegram(title: string, message: string, emoji = '🔔') {
    return this.telegram.notify(title, message, emoji, { buttons: false });
  }

  @Cron('0 9 * * *', { timeZone: TZ })
  async morningReminder() {
    if (await this.calendar.isRestDay()) return;
    await this.createForRoles(
      ['ADMIN', 'MANAGER'],
      'Ish kuni eslatmasi',
      'Kunlik vazifalar ochilgan. Chek-list va vazifalarni bajaring.',
      'REMINDER',
      { telegram: false },
    );
    // Telegram: soatlik pulse (09–22) qamrab oladi
  }

  @Cron('0 18 * * *', { timeZone: TZ })
  async eveningReminder() {
    if (await this.calendar.isRestDay()) return;
    await this.createForRoles(
      ['ADMIN', 'MANAGER'],
      'Kunlik chek-list eslatmasi',
      "Kechki KPI — to'ldirilmagan bloklarni yakunlang (18:00)",
      'REMINDER',
      { telegram: false },
    );
    // Telegram: soatlik pulse (09–22) qamrab oladi
  }

  /** Ish vaqti har soat (09–22): guruhga qisqa holat + eslatma */
  @Cron('0 9-22 * * *', { timeZone: TZ })
  async hourlyWorkPulseCron() {
    try {
      await this.telegram.hourlyWorkPulse();
    } catch (e) {
      this.logger.warn(`Hourly pulse failed: ${e}`);
    }
  }

  @Cron('0 10 * * 1', { timeZone: TZ })
  async mysteryReminder() {
    const last = await this.prisma.mysteryPatientTest.findFirst({ orderBy: { date: 'desc' } });
    const today = toDateOnly(new Date());
    if (last) {
      const diff = (today.getTime() - last.date.getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 14) return;
    }
    await this.createForRoles(
      ['MANAGER', 'SUPER_ADMIN'],
      'Maxfiy bemor testi',
      'Har 2 haftada bir marta maxfiy bemor testini oʻtkazing.\nNatijani platformaga kiriting — sifat nazorati shu yerda boshlanadi.',
      'MYSTERY',
      { emoji: '🕵️', category: 'Sifat auditi' },
    );
  }

  @Cron('0 8 * * *', { timeZone: TZ })
  async lowScoreAlert() {
    const yesterday = toDateOnly(new Date());
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    if (await this.calendar.isRestDay(yesterday)) return;
    const scores = await this.prisma.dailyScore.findMany({
      where: { date: yesterday, frequency: 'DAILY', branchId: { not: null } },
      include: { branch: { select: { name: true } } },
    });
    for (const score of scores) {
      if (!score || score.colorStatus === 'rest' || (score.completion as any)?.restDay) continue;
      if (score.totalScore < 50) {
        const blocks = (score.blockScores as Record<string, any>) || {};
        const weak = Object.entries(blocks)
          .filter(
            ([k, v]) =>
              !k.includes('.') &&
              !k.endsWith('_w') &&
              !k.endsWith('_m') &&
              typeof v === 'number' &&
              v < 50,
          )
          .map(([k, v]) => `${blockLabel(k)} ${v}`)
          .join(', ');
        const dateStr = yesterday.toISOString().slice(0, 10);
        const branchName = score.branch?.name || 'Filial';
        await this.createForRoles(
          ['DIRECTOR', 'SUPER_ADMIN', 'MANAGER'],
          'Past kunlik ball',
          `${branchName} · ${dateStr}: ${score.totalScore}/100 ${scoreIcon(score.totalScore)}\nZaif: ${weak || '—'}\nBugun shu yerga eʼtibor.`,
          'SCORE',
          { emoji: '📉', category: 'KPI', telegram: true },
        );
      }
    }
  }

  @Cron('0 9 * * *', { timeZone: TZ })
  async expiryAlert() {
    return;
  }

  @Cron('30 8 * * *', { timeZone: TZ })
  async lowStockDaily() {
    return;
  }

  @Cron('0 9 * * 1', { timeZone: TZ })
  async weeklyDigest() {
    const end = toDateOnly(new Date());
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
    const scores = await this.prisma.dailyScore.findMany({
      where: { date: { gte: start, lte: end }, frequency: 'DAILY', branchId: { not: null } },
      include: { branch: { select: { name: true } } },
    });
    const working = scores.filter(
      (s) => s.colorStatus !== 'rest' && !(s.completion as any)?.restDay,
    );
    if (!working.length) return;
    const avg =
      Math.round((working.reduce((s, x) => s + x.totalScore, 0) / working.length) * 10) / 10;
    const red = working.filter((s) => s.colorStatus === 'red').length;
    const best = [...working].sort((a, b) => b.totalScore - a.totalScore)[0];
    await this.createForRoles(
      ['DIRECTOR', 'MANAGER', 'SUPER_ADMIN'],
      'Haftalik KPI xulosa',
      `Ish kunlari oʻrtacha: ${avg}/100 ${scoreIcon(avg)}\nQizil kunlar: ${red}/${working.length}\nEng yaxshi: ${best?.branch?.name || '—'} (${best?.totalScore ?? '—'})\n\nBatafsil: /hafta`,
      'SYSTEM',
      { emoji: '📊', category: 'Haftalik hisobot' },
    );
  }
}
