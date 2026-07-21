import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { CalendarService } from '../common/calendar.service';
import { toDateOnly } from '../common/kpi.constants';

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
        '06:00 — ish kuni: kunlik vazifalar ochiladi',
        'Dam olish (Sh/Ya + bayram) — vazifa yoʻq',
        '12:00 / 17:00 / 18:00 — eslatmalar (ish kuni)',
        '19:00 — AI kunlik nazorat',
        'Buyruqlar: /kun /vazifalar /xodim /ai /dam /bugun',
      ],
    };
    const result = await this.telegram.send(
      '<b>KliniKPI</b>\nTelegram ulanish testi muvaffaqiyatli.\n\nModel: kunlik vazifalar · dam olish · AI\nBuyruqlar: /yordam',
    );
    return { ...configured, ...result };
  }

  async createForRoles(
    roles: Array<'ADMIN' | 'MANAGER' | 'DIRECTOR' | 'SUPER_ADMIN'>,
    title: string,
    message: string,
    type: 'REMINDER' | 'ALERT' | 'AI_REPORT' | 'STOCK' | 'SCORE' | 'MYSTERY' | 'SYSTEM' = 'SYSTEM',
    opts?: { telegram?: boolean; emoji?: string },
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
      await this.telegram.notify(title, message, emoji);
    }
  }

  /** Tashqi chaqiriqlar uchun (KPI AI va h.k.) */
  async pushTelegram(title: string, message: string, emoji = '🔔') {
    return this.telegram.notify(title, message, emoji);
  }

  @Cron('0 9 * * *', { timeZone: TZ })
  async morningReminder() {
    if (await this.calendar.isRestDay()) return;
    await this.createForRoles(
      ['ADMIN', 'MANAGER'],
      'Ish kuni eslatmasi',
      'Kunlik vazifalar ochilgan. Chek-list va vazifalarni /my orqali bajaring.',
      'REMINDER',
      { telegram: false },
    );
    await this.telegram.morningChecklistAlert();
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
    await this.telegram.eveningIncompleteAlert();
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
      'Har 2 haftada bir marta maxfiy bemor testini o\'tkazing. Natijani KliniKPI ga kiriting.',
      'MYSTERY',
      { emoji: '🕵️' },
    );
  }

  @Cron('0 8 * * *', { timeZone: TZ })
  async lowScoreAlert() {
    const yesterday = toDateOnly(new Date());
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    if (await this.calendar.isRestDay(yesterday)) return;
    const score = await this.prisma.dailyScore.findUnique({ where: { date: yesterday } });
    if (!score || score.colorStatus === 'rest' || (score.completion as any)?.restDay) return;
    if (score.totalScore < 50) {
      const blocks = (score.blockScores as Record<string, any>) || {};
      const weak = Object.entries(blocks)
        .filter(([k, v]) => !k.startsWith('_') && typeof v === 'number' && v < 50)
        .map(([k, v]) => `${k}: ${v}%`)
        .join(', ');
      await this.createForRoles(
        ['DIRECTOR', 'SUPER_ADMIN', 'MANAGER'],
        'Past kunlik ball',
        `${yesterday.toISOString().slice(0, 10)}: ${score.totalScore}%` +
          (weak ? `\nZaif bloklar: ${weak}` : ''),
        'SCORE',
        { emoji: '📉' },
      );
    }
  }

  @Cron('0 9 * * *', { timeZone: TZ })
  async expiryAlert() {
    return; // Ombor olib tashlandi
  }

  @Cron('30 8 * * *', { timeZone: TZ })
  async lowStockDaily() {
    return; // Ombor olib tashlandi
  }

  /** Har dushanba ertalab haftalik qisqa xulosa */
  @Cron('0 9 * * 1', { timeZone: TZ })
  async weeklyDigest() {
    const end = toDateOnly(new Date());
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
    const scores = await this.prisma.dailyScore.findMany({
      where: { date: { gte: start, lte: end } },
    });
    const working = scores.filter(
      (s) => s.colorStatus !== 'rest' && !(s.completion as any)?.restDay,
    );
    if (!working.length) return;
    const avg =
      Math.round((working.reduce((s, x) => s + x.totalScore, 0) / working.length) * 10) / 10;
    const red = working.filter((s) => s.colorStatus === 'red').length;
    await this.createForRoles(
      ['DIRECTOR', 'MANAGER', 'SUPER_ADMIN'],
      'Haftalik KPI xulosa',
      `Ish kunlari o'rtacha: ${avg}%\nQizil kunlar: ${red}/${working.length}\nBatafsil: /hafta`,
      'SYSTEM',
      { emoji: '📊' },
    );
  }
}
