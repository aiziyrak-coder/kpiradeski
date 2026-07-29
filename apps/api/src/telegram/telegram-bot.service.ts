import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { CalendarService } from '../common/calendar.service';
import { toDateOnly } from '../common/kpi.constants';
import {
  blockLabel,
  branchProgressLine,
  chunkHtml,
  colorIcon,
  scoreIcon,
  tgBold,
  tgCard,
  tgCode,
  tgEscape,
  TG_BRAND,
  webBaseUrl,
} from './tg-format';

type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string; title?: string };
    from?: { id: number; first_name?: string; username?: string };
  };
};

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private offset = 0;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private calendar: CalendarService,
    @Optional()
    @Inject(forwardRef(() => StaffService))
    private staff?: StaffService,
  ) {}

  private get token() {
    return process.env.TELEGRAM_BOT_TOKEN || '';
  }

  private get chatId() {
    return process.env.TELEGRAM_CHAT_ID || '';
  }

  private get enabled() {
    return Boolean(this.token && this.chatId);
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn("Telegram bot o'chirilgan (token/chatId yo'q)");
      return;
    }
    await this.api('setMyCommands', {
      commands: [
        { command: 'start', description: `${TG_BRAND} — salom` },
        { command: 'yordam', description: 'Barcha buyruqlar' },
        { command: 'kun', description: 'Ish kuni / dam olish' },
        { command: 'vazifalar', description: 'Jamoa vazifalari' },
        { command: 'xodim', description: 'Bajarilmagan ishlar' },
        { command: 'ai', description: 'AI kunlik nazorat' },
        { command: 'dam', description: 'Dam olish kalendari' },
        { command: 'bugun', description: 'Bugungi KPI ball' },
        { command: 'holat', description: 'Bloklar holati' },
        { command: 'ombor', description: 'Ombor / zaxira' },
        { command: 'hafta', description: '7 kunlik trend' },
        { command: 'test', description: 'Ulanish testi' },
      ],
    }).catch(() => undefined);

    this.running = true;
    this.logger.log('Telegram bot polling boshlandi');
    this.pollLoop();
  }

  onModuleDestroy() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private async api(method: string, body?: Record<string, unknown>) {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return (await res.json()) as { ok: boolean; result?: any; description?: string };
  }

  private keyboard(extra?: Array<Array<{ text: string; url?: string; callback_data?: string }>>) {
    const web = webBaseUrl().replace(/\/$/, '');
    const rows = [
      [
        { text: '📊 Dashboard', url: `${web}/dashboard` },
        { text: '✅ Ishlar', url: `${web}/today` },
      ],
      [
        { text: '🤖 AI assistant', url: `${web}/assistant` },
        { text: '📈 Hisobotlar', url: `${web}/reports` },
      ],
      ...(extra || []),
    ];
    return { inline_keyboard: rows };
  }

  async send(
    text: string,
    chatId = this.chatId,
    opts?: { buttons?: boolean; replyMarkup?: any },
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.token || !chatId) {
      return { ok: false, error: 'Telegram sozlanmagan' };
    }
    try {
      const chunks = chunkHtml(text, 3800);
      let lastOk = true;
      let lastErr: string | undefined;
      for (let i = 0; i < chunks.length; i++) {
        const chunk =
          chunks.length > 1
            ? `${chunks[i]}\n\n<i>… ${i + 1}/${chunks.length}</i>`
            : chunks[i];
        const body: Record<string, unknown> = {
          chat_id: chatId,
          text: chunk,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        };
        if (i === chunks.length - 1 && (opts?.buttons || opts?.replyMarkup)) {
          body.reply_markup = opts.replyMarkup || this.keyboard();
        }
        const json = await this.api('sendMessage', body);
        if (!json.ok) {
          this.logger.warn(`Telegram: ${json.description}`);
          lastOk = false;
          lastErr = json.description || 'xato';
        }
      }
      return lastOk ? { ok: true } : { ok: false, error: lastErr };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.logger.warn(error);
      return { ok: false, error };
    }
  }

  /**
   * title escape + message escape (oddiy matn)
   * htmlBody=true boʻlsa message allaqachon xavfsiz HTML
   */
  async notify(
    title: string,
    message: string,
    emoji = '🔔',
    opts?: {
      htmlBody?: boolean;
      category?: string;
      buttons?: boolean;
      meta?: string[];
      compact?: boolean;
      actions?: string;
    },
  ) {
    const text = tgCard({
      emoji,
      category: opts?.category || 'Bildirishnoma',
      title,
      meta: opts?.meta,
      body: opts?.htmlBody ? undefined : message,
      htmlLines: opts?.htmlBody ? message.split('\n') : undefined,
      compact: opts?.compact !== false,
      actions: opts?.actions,
    });
    return this.send(text, this.chatId, { buttons: opts?.buttons === true });
  }

  /** Toʻliq HTML card yuborish */
  async sendCard(html: string, opts?: { buttons?: boolean }) {
    return this.send(html, this.chatId, { buttons: opts?.buttons !== false });
  }

  private escape(s: string) {
    return tgEscape(s);
  }

  private async pollLoop() {
    while (this.running) {
      try {
        const json = await this.api('getUpdates', {
          offset: this.offset,
          timeout: 25,
          allowed_updates: ['message'],
        });
        if (json.ok && Array.isArray(json.result)) {
          for (const upd of json.result as TgUpdate[]) {
            this.offset = upd.update_id + 1;
            await this.handleUpdate(upd);
          }
        } else {
          this.logger.warn(`getUpdates ok=false: ${JSON.stringify(json).slice(0, 200)}`);
          await new Promise((r) => setTimeout(r, 5000));
        }
      } catch (e) {
        this.logger.warn(`Polling xato: ${e}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  private async handleUpdate(upd: TgUpdate) {
    const msg = upd.message;
    if (!msg?.text) return;
    const text = msg.text.trim();
    if (!text.startsWith('/')) return;
    if (String(msg.chat.id) !== String(this.chatId)) return;

    const cmd = text.split(/\s+/)[0].replace(/@\w+$/, '').toLowerCase();
    const replyTo = String(msg.chat.id);

    try {
      switch (cmd) {
        case '/start':
          await this.send(this.helpText(true), replyTo, { buttons: true });
          break;
        case '/yordam':
        case '/help':
          await this.send(this.helpText(false), replyTo, { buttons: true });
          break;
        case '/kun':
          await this.send(await this.dayStatusText(), replyTo, { buttons: true });
          break;
        case '/dam':
        case '/kalendar':
          await this.send(await this.restCalendarText(), replyTo, { buttons: true });
          break;
        case '/vazifalar':
        case '/jamoa':
        case '/toplam':
          await this.send(await this.tasksDigestText(), replyTo, { buttons: true });
          break;
        case '/xodim':
          await this.send(await this.incompleteTasksText(), replyTo, { buttons: true });
          break;
        case '/ai':
        case '/nazorat':
          await this.send(await this.aiMonitorText(), replyTo, { buttons: true });
          break;
        case '/bugun':
        case '/kpi':
          await this.send(await this.todayScoreText(), replyTo, { buttons: true });
          break;
        case '/holat':
          await this.send(await this.completionText(), replyTo, { buttons: true });
          break;
        case '/ombor':
          await this.send(await this.stockText(), replyTo, { buttons: true });
          break;
        case '/hafta':
          await this.send(await this.weekText(), replyTo, { buttons: true });
          break;
        case '/test':
          await this.send(this.testText(), replyTo, { buttons: true });
          break;
        default:
          await this.send(
            tgCard({
              emoji: '❓',
              category: 'Buyruq',
              title: 'Nomaʼlum buyruq',
              body: 'Mavjud buyruqlar roʻyxati uchun /yordam ni bosing.',
              actions: '/yordam · /bugun · /vazifalar',
            }),
            replyTo,
            { buttons: true },
          );
      }
    } catch (e) {
      this.logger.warn(`Command error: ${e}`);
      await this.send(
        tgCard({
          emoji: '⚠️',
          category: 'Xato',
          title: 'Vaqtincha ishlamadi',
          body: 'Keyinroq qayta urinib koʻring yoki /test bilan ulanishni tekshiring.',
        }),
        replyTo,
      );
    }
  }

  helpText(welcome: boolean) {
    return tgCard({
      emoji: welcome ? '✨' : '📖',
      category: welcome ? 'Xush kelibsiz' : 'Yordam',
      title: welcome ? `${TG_BRAND} guruh boti` : 'Buyruqlar',
      meta: ['Asia/Tashkent'],
      compact: true,
      htmlLines: [
        welcome ? 'KPI va ishlar holati — qisqa xabarlar bilan.' : '',
        '<b>Ish kuni</b>',
        '• <b>08:00</b> — vazifalar ochiladi',
        '• <b>09:00–22:00</b> — soatlik eslatma',
        '• <b>19:00</b> — AI yakuniy baho',
        '',
        '<b>Buyruqlar</b>',
        '• /bugun — bugungi ball',
        '• /holat — nima qolgan',
        '• /vazifalar — jamoa',
        '• /hafta · /ai · /kun · /test',
      ],
    });
  }

  testText() {
    return tgCard({
      emoji: '✅',
      category: 'Test',
      title: 'Bot ulandi',
      meta: [new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })],
      compact: true,
      body: 'Xabar kelgan boʻlsa — hammasi joyida.',
    });
  }

  async dayStatusText() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return tgCard({
        emoji: '🌴',
        category: 'Kun holati',
        title: 'Dam olish kuni',
        meta: [day.date, day.weekdayLabel],
        htmlLines: [
          day.holiday
            ? `Sabab: ${tgBold(day.holiday.title)}`
            : 'Haftalik dam olish (sozlamalar boʻyicha).',
          '',
          'Bugun vazifa ochilmaydi va KPI hisoblanmaydi.',
        ],
        actions: '/dam · /hafta',
      });
    }
    return tgCard({
      emoji: '☀️',
      category: 'Kun holati',
      title: 'Ish kuni',
      meta: [day.date, day.weekdayLabel],
      compact: true,
      htmlLines: [
        'Vazifalar <b>08:00</b> da ochiladi.',
        'Eslatma: <b>09:00–22:00</b> har soat.',
        'AI baho: <b>19:00</b>.',
      ],
    });
  }

  async restCalendarText() {
    const cfg = await this.calendar.calendarConfig();
    const days = (cfg.restWeekdayLabels || []).join(', ') || '—';
    const holidays = (cfg.holidays || []).slice(0, 12);
    return tgCard({
      emoji: '📅',
      category: 'Kalendar',
      title: 'Dam olish rejimlari',
      meta: [cfg.timezone || 'Asia/Tashkent'],
      sections: [
        { heading: 'Haftalik dam', lines: [days] },
        {
          heading: 'Bayramlar',
          lines: holidays.length
            ? holidays.map((h: any) => `${h.date} — ${h.title}`)
            : ['Qoʻshimcha bayram yoʻq'],
        },
      ],
      footer: 'Sozlash: platforma → Sozlamalar',
      actions: '/kun · /yordam',
    });
  }

  async tasksDigestText() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return tgCard({
        emoji: '🌴',
        category: 'Vazifalar',
        title: 'Dam olish — vazifa yoʻq',
        meta: [day.date, day.holiday?.title || day.weekdayLabel],
        body: 'Kunlik vazifalar ochilmagan, hisoblanmaydi.',
      });
    }
    if (!this.staff) {
      return tgCard({
        emoji: '⚠️',
        category: 'Vazifalar',
        title: 'Modul yuklanmagan',
        body: 'Xodim moduli mavjud emas.',
      });
    }
    const board = await this.staff.teamBoard(day.date);
    const members: any[] = board.members || [];
    const lines = members.map((m: any) => {
      const pct = m.stats?.completionPct ?? 0;
      const left = Number(m.stats?.pending) || 0;
      return (
        `${scoreIcon(pct)} ${tgBold(m.user.name)} — ${tgBold(`${pct}%`)}` +
        (left > 0 ? ` · qoldi ${left}` : '')
      );
    });
    const avg =
      members.length > 0
        ? Math.round(
            members.reduce((s: number, m: any) => s + (Number(m.stats?.completionPct) || 0), 0) /
              members.length,
          )
        : 0;
    return tgCard({
      emoji: '👥',
      category: 'Jamoa',
      title: `Vazifalar · ${day.date}`,
      meta: [`Oʻrtacha ${avg}%`, `${members.length} kishi`],
      compact: true,
      htmlLines: lines.length ? lines : ['Hali vazifa yoʻq.'],
    });
  }

  async incompleteTasksText() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return tgCard({
        emoji: '🌴',
        category: 'Xodim',
        title: 'Dam olish kuni',
        meta: [day.date],
        body: 'Bajarilmagan vazifa hisoblanmaydi.',
      });
    }
    if (!this.staff) {
      return tgCard({
        emoji: '⚠️',
        category: 'Xodim',
        title: 'Modul yuklanmagan',
        body: 'Xodim moduli mavjud emas.',
      });
    }
    const raw = await this.staff.incompleteDigestText();
    const cleaned = String(raw || '')
      .replace(/<\/?b>/gi, '')
      .trim();
    if (!cleaned || /yoʻq|yok|yo'q|toʻliq|to'liq|hammasi/i.test(cleaned) && cleaned.length < 80) {
      return tgCard({
        emoji: '🎉',
        category: 'Xodim',
        title: 'Ajoyib — kechikish yoʻq',
        meta: [day.date],
        body: cleaned || 'Barcha faol vazifalar yopilgan yoki navbatda yoʻq.',
        actions: '/vazifalar · /ai',
      });
    }
    const lines = cleaned
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 25)
      .map((l) => `• ${tgEscape(l.replace(/^•\s*/, ''))}`);
    return tgCard({
      emoji: '📋',
      category: 'Xodim',
      title: 'Bajarilmagan vazifalar',
      meta: [day.date],
      htmlLines: lines,
      actions: '/vazifalar · /ai',
      footer: 'Menejerlar tekshiruvni platformada yakunlasin.',
    });
  }

  async aiMonitorText() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return tgCard({
        emoji: '🌴',
        category: 'AI',
        title: 'Dam olish — AI dam oladi',
        meta: [day.date],
        body: 'Bugun AI kunlik nazorat ishlamaydi.',
      });
    }
    if (!this.staff) {
      return tgCard({
        emoji: '⚠️',
        category: 'AI',
        title: 'Modul yuklanmagan',
        body: 'Xodim moduli mavjud emas.',
      });
    }
    const res = await this.staff.runAiDailyMonitor('telegram-/ai', { skipTelegram: true });
    if (res.restDay) {
      return tgCard({
        emoji: '🌴',
        category: 'AI',
        title: 'Dam olish',
        body: res.message || 'Dam olish kuni',
      });
    }
    return tgCard({
      emoji: '🤖',
      category: 'AI',
      title: `AI baho · ${res.date || day.date}`,
      meta: [`${res.members ?? '—'} xodim`],
      compact: true,
      body: String(res.report || 'Hisobot yoʻq').slice(0, 1200),
    });
  }

  async todayScoreText() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return tgCard({
        emoji: '🌴',
        category: 'KPI',
        title: 'Dam olish — ball hisoblanmaydi',
        meta: [day.date, day.holiday?.title || day.weekdayLabel],
      });
    }
    const date = toDateOnly(day.date);
    const scores = await this.prisma.dailyScore.findMany({
      where: { date, frequency: 'DAILY', branchId: { not: null } },
      include: { branch: { select: { name: true } } },
      orderBy: { totalScore: 'desc' },
    });
    if (!scores.length) {
      return tgCard({
        emoji: '📅',
        category: 'KPI',
        title: 'Hali ball yoʻq',
        meta: [day.date],
        body: 'Ishlar bajarilgach ball avtomatik yangilanadi.',
        actions: '/vazifalar · /holat',
      });
    }

    const htmlLines: string[] = [];
    for (const score of scores) {
      const name = score.branch?.name || 'Filial';
      const c = score.completion as any;
      const progress =
        c?.assignedTotal != null
          ? ` · ish ${c.assignedDone ?? 0}/${c.assignedTotal}`
          : '';
      htmlLines.push(
        `${colorIcon(score.colorStatus)} ${tgBold(name)} — ${tgBold(`${score.totalScore}`)}${progress}`,
      );
      const blocks = (score.blockScores as Record<string, number>) || {};
      const weak = Object.entries(blocks)
        .filter(
          ([k, v]) =>
            !k.includes('.') &&
            !k.endsWith('_w') &&
            !k.endsWith('_m') &&
            typeof v === 'number' &&
            v < 50,
        )
        .slice(0, 3);
      if (weak.length) {
        htmlLines.push(
          `   zaif: ${weak.map(([k, v]) => `${blockLabel(k)} ${v}`).join(', ')}`,
        );
      }
    }

    const top = scores[0];
    return tgCard({
      emoji: colorIcon(top.colorStatus),
      category: 'KPI',
      title: `Bugun · ${day.date}`,
      meta: [`${scores.length} filial`],
      compact: true,
      htmlLines,
    });
  }

  async completionText() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return tgCard({
        emoji: '🌴',
        category: 'Holat',
        title: 'Dam olish',
        meta: [day.date],
        body: 'Majburiy bloklar talab qilinmaydi.',
      });
    }
    const date = toDateOnly(day.date);
    const score = await this.prisma.dailyScore.findFirst({
      where: { date, frequency: 'DAILY', branchId: { not: null } },
      include: { branch: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!score) {
      return tgCard({
        emoji: '⚠️',
        category: 'Holat',
        title: 'KPI hali yoʻq',
        meta: [day.date],
        body: 'Filialda bugungi ball hisoblanmagan.',
        actions: '/bugun · /vazifalar',
      });
    }
    const blocks = (score.blockScores as Record<string, number>) || {};
    const entries = Object.entries(blocks).filter(
      ([k, v]) => !k.includes('.') && !k.endsWith('_w') && !k.endsWith('_m') && typeof v === 'number',
    );
    const weak = entries.filter(([, v]) => v < 50);
    return tgCard({
      emoji: colorIcon(score.colorStatus),
      category: 'Holat',
      title: `${score.branch?.name || 'Filial'} · ${score.totalScore}/100`,
      meta: [day.date],
      compact: true,
      htmlLines: [
        ...entries.map(
          ([k, v]) => `${scoreIcon(v)} ${tgEscape(blockLabel(k))}: ${tgBold(`${v}`)}`,
        ),
        ...(weak.length
          ? ['', `Zaif: ${weak.map(([k]) => blockLabel(k)).join(', ')}`]
          : []),
      ],
    });
  }

  async stockText() {
    const products = await this.prisma.warehouseProduct.findMany({ orderBy: { name: 'asc' } });
    const low = products.filter((p) => p.currentStock <= p.minStock);
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + 30);
    const expiring = products.filter(
      (p) => p.expiryDate && p.expiryDate.getTime() <= until.getTime(),
    );

    if (!low.length && !expiring.length) {
      return tgCard({
        emoji: '✅',
        category: 'Ombor',
        title: 'Ombor holati yaxshi',
        body: 'Past zaxira va yaqin muddatli mahsulot yoʻq.',
        actions: '/yordam',
      });
    }
    const sections: Array<{ heading: string; lines: string[] }> = [];
    if (low.length) {
      sections.push({
        heading: `Past zaxira (${low.length})`,
        lines: low.map((p) => `${p.name}: ${p.currentStock}/${p.minStock}`),
      });
    }
    if (expiring.length) {
      sections.push({
        heading: `30 kun ichida muddat (${expiring.length})`,
        lines: expiring.map(
          (p) => `${p.name}: ${p.expiryDate?.toISOString().slice(0, 10) || '—'}`,
        ),
      });
    }
    return tgCard({
      emoji: '📦',
      category: 'Ombor',
      title: 'Zaxira diqqati',
      sections,
      actions: '/yordam',
    });
  }

  async weekText() {
    const end = toDateOnly(new Date());
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    const scores = await this.prisma.dailyScore.findMany({
      where: { date: { gte: start, lte: end }, frequency: 'DAILY', branchId: { not: null } },
      include: { branch: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });
    const working = scores.filter(
      (s) => s.colorStatus !== 'rest' && !(s.completion as any)?.restDay,
    );
    if (!working.length) {
      return tgCard({
        emoji: '📊',
        category: 'Hafta',
        title: 'Ish kuni maʼlumoti yoʻq',
        body: 'Oxirgi 7 kunda hisoblanadigan ish kuni topilmadi.',
      });
    }
    const avg =
      Math.round((working.reduce((s, x) => s + x.totalScore, 0) / working.length) * 10) / 10;
    const byDay = new Map<string, typeof working>();
    for (const s of working) {
      const k = s.date.toISOString().slice(0, 10);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(s);
    }
    const lines: string[] = [];
    for (const [d, list] of [...byDay.entries()].sort()) {
      const dayAvg = Math.round(list.reduce((a, x) => a + x.totalScore, 0) / list.length);
      lines.push(`${colorIcon(list[0].colorStatus)} ${tgCode(d)} — ${tgBold(`${dayAvg}`)}`);
    }
    const red = working.filter((s) => s.colorStatus === 'red').length;
    return tgCard({
      emoji: scoreIcon(avg),
      category: 'Hafta',
      title: `7 kunlik oʻrtacha: ${avg}`,
      meta: [`${working.length} yozuv`, `Qizil: ${red}`],
      htmlLines: lines,
      actions: '/bugun · /holat',
      footer: 'Faqat ish kunlari hisobga olingan.',
    });
  }

  async eveningIncompleteAlert() {
    if (await this.calendar.isRestDay()) {
      return;
    }
    // Soatlik pulse 18:00 da yuboriladi — qoʻshimcha uzun xabar yoʻq
    return;
  }

  /**
   * Ish vaqti soatlik eslatma (09–22).
   * 08:00 da ertalabki ochilish alohida yuboriladi.
   * Dam olishda faqat 09:00 da bir marta qisqa xabar.
   */
  async hourlyWorkPulse(hour?: number) {
    const day = await this.calendar.getDayInfo();
    const h =
      typeof hour === 'number'
        ? hour
        : Number(
            new Intl.DateTimeFormat('en-GB', {
              timeZone: 'Asia/Tashkent',
              hour: 'numeric',
              hour12: false,
            }).format(new Date()),
          );

    // 08:00 — ertalabki spawn xabari yetarli; pulse 09–22
    if (h < 9 || h > 22) {
      return { ok: true, skipped: true, hour: h };
    }

    if (day.restDay) {
      if (h === 9) {
        await this.sendCard(
          tgCard({
            emoji: '🌴',
            category: `${String(h).padStart(2, '0')}:00`,
            title: 'Dam olish kuni',
            meta: [day.date, day.holiday?.title || day.weekdayLabel],
            compact: true,
            body: 'Bugun KPI eslatmasi yoʻq. Yaxshi dam oling!',
          }),
          { buttons: false },
        );
      }
      return { ok: true, restDay: true, hour: h };
    }

    const date = toDateOnly(day.date);
    const branches = await this.prisma.branch.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const lines: string[] = [];
    let totalAssigned = 0;
    let totalDone = 0;
    let lagging: string[] = [];

    for (const b of branches) {
      const templates = await this.prisma.kpiAssignmentTemplate.findMany({
        where: { branchId: b.id, frequency: 'DAILY', active: true },
        select: { nodeKey: true },
      });
      const keys = templates.map((t) => t.nodeKey);
      const assigned = keys.length;
      let done = 0;
      if (keys.length) {
        done = await this.prisma.kpiDayEntry.count({
          where: {
            branchId: b.id,
            date,
            done: true,
            nodeKey: { in: keys },
          },
        });
      }
      const score = await this.prisma.dailyScore.findFirst({
        where: { branchId: b.id, date, frequency: 'DAILY' },
      });
      const pct = assigned ? Math.round((done / assigned) * 100) : 0;
      totalAssigned += assigned;
      totalDone += done;
      lines.push(
        branchProgressLine({
          name: b.name,
          done,
          assigned,
          score: score?.totalScore ?? null,
        }),
      );
      if (assigned > 0 && pct < 50) lagging.push(b.name);
    }

    const overallPct = totalAssigned
      ? Math.round((totalDone / totalAssigned) * 100)
      : 0;
    const left = Math.max(0, totalAssigned - totalDone);

    let tip = 'Davom eting — ochiq ishlarni yuboring.';
    let emoji = '⏱';
    if (h <= 10) {
      emoji = '☀️';
      tip = 'Kun boshlandi. Birinchi muhim ishlarni yuboring.';
    } else if (h <= 13) {
      emoji = '📋';
      tip =
        overallPct < 30
          ? 'Ertalabki ishlar ortda — tempni oshiring.'
          : 'Yaxshi. Tushgacha ochiq ishlarni yoping.';
    } else if (h <= 17) {
      emoji = '⚡';
      tip =
        overallPct < 50
          ? 'Yarim kun — eng muhim ochiq ishlarga qayting.'
          : 'Yaxshi temp. Qolganini kechga qoldirmang.';
    } else if (h <= 20) {
      emoji = '🏁';
      tip =
        left > 0
          ? `Yakunlash: hali ${left} ta ish ochiq.`
          : 'Deyarli tayyor — oxirgi ishlarni yoping.';
    } else {
      emoji = '🌙';
      tip =
        left > 0
          ? `Ish kuni tugayapti — qolgan ${left} ta ishni hozir yuboring.`
          : 'Kun yopildi. Rahmat!';
    }

    if (totalAssigned === 0) {
      tip = 'Filialga kunlik ish biriktirilmagan (Admin → Bugun).';
    } else if (lagging.length && overallPct < 60) {
      tip += ` Ortda: ${lagging.slice(0, 3).join(', ')}.`;
    }

    await this.sendCard(
      tgCard({
        emoji,
        category: `${String(h).padStart(2, '0')}:00`,
        title: `Holat · ${day.date}`,
        meta: [
          day.weekdayLabel,
          `Jami ${totalDone}/${totalAssigned} (${overallPct}%)`,
        ],
        compact: true,
        htmlLines: [
          ...lines,
          '',
          `👉 ${tgEscape(tip)}`,
        ],
      }),
      { buttons: false },
    );

    return { ok: true, hour: h, totalDone, totalAssigned, overallPct };
  }

  async morningChecklistAlert() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      await this.sendCard(
        tgCard({
          emoji: '🌴',
          category: 'Ertalab',
          title: 'Dam olish kuni',
          meta: [day.date, day.holiday?.title || day.weekdayLabel],
          compact: true,
          body: 'Bugun chek-list yoʻq. Yaxshi dam oling!',
        }),
        { buttons: false },
      );
      return;
    }
    await this.sendCard(
      tgCard({
        emoji: '☀️',
        category: 'Ertalab (08:00)',
        title: 'Ish kuni boshlandi',
        meta: [day.date, day.weekdayLabel],
        compact: true,
        htmlLines: [
          'Vazifalar <b>08:00</b> dan ochiq.',
          'Soatlik eslatma: <b>09:00–22:00</b>.',
          'AI yakuniy baho: <b>19:00</b>.',
        ],
      }),
      { buttons: false },
    );
  }
}
