import {
  Controller,
  Get,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  telegramPollingHealthy,
  telegramStatus,
} from '../telegram/telegram-status';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  /** Readiness — DB kerak; down bo'lsa 503 */
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    // Bot pollingi jim oʻlishi mumkin (masalan webhook 409) — health yashil
    // qolmasin, aks holda uzilish kunlar davomida sezilmaydi
    const tgPolling = telegramPollingHealthy();
    const ok = db === 'up' && tgPolling;
    if (!ok) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    const now = new Date();
    return {
      status: ok ? 'ok' : 'degraded',
      db,
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      telegramPolling: telegramStatus.enabled
        ? {
            healthy: tgPolling,
            lastOkAt: telegramStatus.lastPollOkAt
              ? new Date(telegramStatus.lastPollOkAt).toISOString()
              : null,
            lastError: telegramStatus.lastError,
          }
        : { healthy: true, disabled: true },
      timezone: 'Asia/Tashkent',
      time: now.toISOString(),
      timeTashkent: new Intl.DateTimeFormat('uz-UZ', {
        timeZone: 'Asia/Tashkent',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now),
      version: '1.0.0',
    };
  }

  /** Liveness — jarayon tirikligini tekshiradi */
  @Get('live')
  live() {
    return { status: 'ok' };
  }
}
