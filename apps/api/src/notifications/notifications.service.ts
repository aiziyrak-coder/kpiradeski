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
        '08:00 — ish kuni: kunlik vazifalar ochiladi',
        'Dam olish (Sh/Ya + bayram) — vazifa yoʻq',
        '09:00–21:00 — har 2 soat: holat + bajarilmagan kunlik ishlar',
        '10/14/18/20 — hodimlar davomati',
        'Dushanba 10:00 — haftalik ishlar',
        'Dushanba 10:15 — oylik ishlar',
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

  /** Ish vaqti har 2 soat: holat + bajarilmagan kunlik ishlar */
  @Cron('0 9,11,13,15,17,19,21 * * *', { timeZone: TZ })
  async hourlyWorkPulseCron() {
    try {
      await this.telegram.hourlyWorkPulse();
    } catch (e) {
      this.logger.warn(`Work pulse failed: ${e}`);
    }
  }

  /** Haftalik ishlar — dushanba 10:00 */
  @Cron('0 10 * * 1', { timeZone: TZ })
  async weeklyWorkPulseCron() {
    try {
      await this.telegram.weeklyWorkPulse();
    } catch (e) {
      this.logger.warn(`Weekly pulse failed: ${e}`);
    }
  }

  /** Oylik ishlar — dushanba 10:15 (haftada 1 marta) */
  @Cron('15 10 * * 1', { timeZone: TZ })
  async monthlyWorkPulseCron() {
    try {
      await this.telegram.monthlyWorkPulse();
    } catch (e) {
      this.logger.warn(`Monthly pulse failed: ${e}`);
    }
  }

  @Cron('0 10 * * 1', { timeZone: TZ })
  async mysteryReminder() {
    // Telegram spam yoʻq — faqat ichki eslatma
    const last = await this.prisma.mysteryPatientTest.findFirst({ orderBy: { date: 'desc' } });
    const today = toDateOnly(new Date());
    if (last) {
      const diff = (today.getTime() - last.date.getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 14) return;
    }
    await this.createForRoles(
      ['MANAGER', 'SUPER_ADMIN'],
      'Maxfiy bemor testi',
      'Har 2 haftada bir marta maxfiy bemor testini oʻtkazing.',
      'MYSTERY',
      { emoji: '🕵️', category: 'Sifat auditi', telegram: false },
    );
  }

  @Cron('0 8 * * *', { timeZone: TZ })
  async lowScoreAlert() {
    // Telegramga past ball / AI xulosasi yuborilmaydi
    return;
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
    // Eski AI/haftalik xulosa o‘rniga weeklyWorkPulse ishlaydi
    return;
  }
}
