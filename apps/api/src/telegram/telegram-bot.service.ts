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
import { startOfWeek, toDateOnly } from '../common/kpi.constants';
import { evalTaskWindow } from '../common/task-window';
import { isCompanyWideTaskKey } from '../common/company-wide-tasks';
import { ATTENDANCE_NODE_KEY } from '../attendance/attendance.constants';
import { KpiInputType, AttendanceStatus } from '@prisma/client';
import {
  blockLabel,
  branchProgressLine,
  chunkHtml,
  colorIcon,
  scoreIcon,
  tgBold,
  tgCard,
  tgClock,
  tgCode,
  tgEscape,
  tgProgressBar,
  tgUzDate,
  TG_BRAND,
  webBaseUrl,
} from './tg-format';

type IncompleteTask = {
  key: string;
  title: string;
  section: string;
  shared: boolean;
};

type FreqBranchStat = {
  id: string;
  name: string;
  done: number;
  assigned: number;
  incomplete: IncompleteTask[];
  managers: string[];
};

type FreqStats = {
  lines: string[];
  branches: FreqBranchStat[];
  sharedIncomplete: IncompleteTask[];
  totalAssigned: number;
  totalDone: number;
  laggingManagers: string[];
};

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
        '• <b>09:00–21:00</b> — har 2 soat: holat + ochiq kunlik ishlar',
        '• <b>10/14/18/20</b> — hodimlar davomati',
        '• <b>Dushanba 10:00</b> — haftalik ishlar',
        '• <b>Dushanba 10:15</b> — oylik ishlar',
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
        'Eslatma: har <b>2 soatda</b> (09:00–21:00).',
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

    const stats = await this.collectFreqStats('DAILY', date);
    const incompleteByName = new Map(stats.branches.map((b) => [b.name, b.incomplete]));
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
      const left = incompleteByName.get(name) || [];
      if (left.length) {
        htmlLines.push(`   ochiq: ${left.length} ta`);
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
    const stats = await this.collectFreqStats('DAILY', date);
    const branchName = score.branch?.name || 'Filial';
    const branchInc = stats.branches.find((b) => b.name === branchName)?.incomplete || [];
    const htmlLines = [
      ...entries.map(
        ([k, v]) => `${scoreIcon(v)} ${tgEscape(blockLabel(k))}: ${tgBold(`${v}`)}`,
      ),
      ...(weak.length
        ? ['', `Zaif: ${weak.map(([k]) => blockLabel(k)).join(', ')}`]
        : []),
    ];
    if (branchInc.length) {
      htmlLines.push('');
      htmlLines.push(`📋 ${tgBold('Bajarilmagan ishlar')} — ${branchInc.length} ta`);
      htmlLines.push(...this.groupedIncompleteLines(branchInc));
    }
    return tgCard({
      emoji: colorIcon(score.colorStatus),
      category: 'Holat',
      title: `${branchName} · ${score.totalScore}/100`,
      meta: [day.date],
      compact: true,
      htmlLines,
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
   * Ish vaqti har 2 soat (09/11/13/15/17/19/21):
   * 1) tushunarli holat
   * 2) har filial — bajarilmagan kunlik ishlarning aniq roʻyxati
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

    const allowed = new Set([9, 11, 13, 15, 17, 19, 21]);
    if (!allowed.has(h)) {
      return { ok: true, skipped: true, hour: h };
    }

    if (day.restDay) {
      return { ok: true, restDay: true, hour: h };
    }

    const date = toDateOnly(day.date);
    const stats = await this.collectFreqStats('DAILY', date);
    if (!stats.totalAssigned) {
      return { ok: true, empty: true };
    }

    await this.sendDailySummaryCard({
      stats,
      dateLabel: day.date,
      weekdayLabel: day.weekdayLabel,
      hour: h,
    });

    const allDone =
      stats.totalDone >= stats.totalAssigned && stats.sharedIncomplete.length === 0;
    if (!allDone) {
      await this.sendDailyIncompleteByBranch({
        stats,
        dateLabel: day.date,
        hour: h,
      });
    }

    return {
      ok: true,
      totalDone: stats.totalDone,
      totalAssigned: stats.totalAssigned,
      allDone,
    };
  }

  /** Haftalik ishlar — haftada 1 marta (dushanba 10:00) */
  async weeklyWorkPulse() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) return { ok: true, restDay: true };
    const period = startOfWeek(toDateOnly(day.date));
    return this.sendFreqProgressPulse({
      frequency: 'WEEKLY',
      date: period,
      dateLabel: day.date,
      weekdayLabel: day.weekdayLabel,
      title: `Haftalik ishlar · ${day.date}`,
    });
  }

  /** Oylik ishlar — haftada 1 marta (dushanba 10:15) */
  async monthlyWorkPulse() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) return { ok: true, restDay: true };
    const d = toDateOnly(day.date);
    const period = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    return this.sendFreqProgressPulse({
      frequency: 'MONTHLY',
      date: period,
      dateLabel: day.date,
      weekdayLabel: day.weekdayLabel,
      title: `Oylik ishlar · ${day.date}`,
    });
  }

  private async sendFreqProgressPulse(opts: {
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    date: Date;
    dateLabel: string;
    weekdayLabel?: string;
    hour?: number;
    title: string;
  }) {
    const stats = await this.collectFreqStats(opts.frequency, opts.date);
    if (!stats.totalAssigned) {
      return { ok: true, empty: true };
    }
    const kind =
      opts.frequency === 'WEEKLY' ? 'Haftalik' : opts.frequency === 'MONTHLY' ? 'Oylik' : 'Kunlik';
    const left = Math.max(0, stats.totalAssigned - stats.totalDone);
    const allDone = left === 0;
    const lines: string[] = [];
    for (const b of stats.branches) {
      const pct = b.assigned ? Math.round((b.done / b.assigned) * 100) : 0;
      lines.push(`${scoreIcon(pct)} ${tgBold(b.name)} — <b>${b.done}/${b.assigned}</b>`);
      lines.push(tgProgressBar(b.done, b.assigned));
    }
    lines.push('');
    if (allDone) {
      lines.push(
        opts.frequency === 'WEEKLY'
          ? '🏆 Haftalik ishlar yopildi. Rahmat!'
          : '🏆 Oylik ishlar yopildi. Rahmat!',
      );
    } else {
      lines.push(`Hali <b>${left}</b> ta ish ochiq.`);
      if (stats.laggingManagers.length) {
        lines.push(`Javobgar: ${tgEscape(stats.laggingManagers.slice(0, 6).join(', '))}`);
      }
    }

    await this.sendCard(
      [`📅 <b>${kind} ishlar</b>`, tgUzDate(opts.dateLabel, opts.weekdayLabel), '', ...lines].join(
        '\n',
      ),
      { buttons: false },
    );

    return { ok: true, totalDone: stats.totalDone, totalAssigned: stats.totalAssigned, allDone };
  }

  private async sendDailySummaryCard(opts: {
    stats: FreqStats;
    dateLabel: string;
    weekdayLabel?: string;
    hour: number;
  }) {
    const { stats, hour } = opts;
    const left = Math.max(0, stats.totalAssigned - stats.totalDone);
    const allDone = left === 0 && stats.sharedIncomplete.length === 0;
    const lines: string[] = [
      `⏰ <b>${tgClock(hour)} · Kunlik eslatma</b>`,
      tgUzDate(opts.dateLabel, opts.weekdayLabel),
      '',
      '<b>Filiallar holati</b>',
    ];
    for (const b of stats.branches) {
      const pct = b.assigned ? Math.round((b.done / b.assigned) * 100) : 0;
      const leftB = Math.max(0, b.assigned - b.done);
      lines.push(
        `${scoreIcon(pct)} ${tgBold(b.name)} — <b>${b.done}/${b.assigned}</b>` +
          (leftB ? ` · qoldi ${leftB}` : ' · tayyor'),
      );
      lines.push(tgProgressBar(b.done, b.assigned));
    }
    lines.push('');
    if (allDone) {
      lines.push('🏆 Bugungi kunlik ishlarning hammasi yopildi. Jamoaga rahmat!');
    } else {
      lines.push(`Hali <b>${left}</b> ta kunlik ish ochiq.`);
      if (stats.sharedIncomplete.length) {
        lines.push(
          `Shundan <b>${stats.sharedIncomplete.length}</b> tasi umumiy (SEO/SMM/marketing).`,
        );
      }
      lines.push('Quyidagi xabarlarda — qaysi ishlar qolgani.');
    }
    await this.sendCard(lines.join('\n'), { buttons: false });
  }

  private async sendDailyIncompleteByBranch(opts: {
    stats: FreqStats;
    dateLabel: string;
    hour: number;
  }) {
    const { stats, hour } = opts;
    const pending = stats.branches.filter((b) => b.incomplete.length > 0);
    if (!pending.length && !stats.sharedIncomplete.length) return { ok: true, sent: 0 };

    const hh = tgClock(hour);
    let sent = 0;
    for (const b of pending) {
      const left = b.incomplete.length;
      const who = b.managers.length
        ? `Javobgar: ${tgEscape(b.managers.slice(0, 4).join(', '))}`
        : '';
      const html = [
        `📋 <b>${tgEscape(b.name)}</b> — bajarilmagan kunlik ishlar`,
        `${hh} · tayyor ${b.done}/${b.assigned} · qoldi <b>${left}</b>`,
        '',
        ...this.groupedIncompleteLines(b.incomplete),
        ...(who ? ['', who] : []),
      ].join('\n');
      await this.sendCard(html, { buttons: false });
      sent += 1;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (stats.sharedIncomplete.length) {
      const html = [
        `🌐 <b>Umumiy biznes</b> — SEO / SMM / marketing`,
        `${hh} · qoldi <b>${stats.sharedIncomplete.length}</b> ta`,
        'Bitta filial yopsa, qolganlarida ham yopiladi.',
        '',
        ...this.groupedIncompleteLines(stats.sharedIncomplete),
      ].join('\n');
      await this.sendCard(html, { buttons: false });
      sent += 1;
    }
    return { ok: true, sent };
  }

  private groupedIncompleteLines(tasks: IncompleteTask[]): string[] {
    if (!tasks.length) return ['✅ Bajarilmagan ish yoʻq.'];
    const lines: string[] = [];
    let lastSection = '';
    let n = 1;
    for (const t of tasks) {
      const section = t.section || 'Boshqa';
      if (section !== lastSection) {
        if (lines.length) lines.push('');
        lines.push(`<b>${tgEscape(section)}</b>`);
        lastSection = section;
        n = 1;
      }
      lines.push(`${n}. ${tgEscape(t.title)}`);
      n += 1;
    }
    return lines;
  }

  private async collectFreqStats(
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY',
    date: Date,
  ): Promise<FreqStats> {
    const branches = await this.prisma.branch.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        managers: {
          include: {
            user: { select: { id: true, name: true, active: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const catalog = await this.prisma.kpiCatalogNode.findMany({
      where: { active: true },
      select: {
        key: true,
        titleUz: true,
        parentKey: true,
        inputType: true,
        frequency: true,
        sharedAcrossBranches: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: 'asc' },
    });
    const nodeByKey = new Map(catalog.map((n) => [n.key, n]));
    const childrenOf = new Map<string, typeof catalog>();
    for (const n of catalog) {
      if (!n.parentKey) continue;
      const arr = childrenOf.get(n.parentKey) || [];
      arr.push(n);
      childrenOf.set(n.parentKey, arr);
    }

    const rootSectionOf = (key: string): string => {
      let cur = nodeByKey.get(key);
      if (!cur?.parentKey) return '';
      let last = nodeByKey.get(cur.parentKey);
      cur = last;
      while (cur?.parentKey) {
        last = nodeByKey.get(cur.parentKey) || last;
        cur = nodeByKey.get(cur.parentKey);
      }
      return last?.titleUz || '';
    };

    const expandLeaves = (keys: string[]) => {
      const out: typeof catalog = [];
      const seen = new Set<string>();
      const walk = (key: string) => {
        const n = nodeByKey.get(key);
        if (!n) return;
        if (n.inputType !== KpiInputType.GROUP) {
          if (n.frequency === frequency && !seen.has(n.key)) {
            seen.add(n.key);
            out.push(n);
          }
          return;
        }
        for (const c of childrenOf.get(n.key) || []) walk(c.key);
      };
      for (const k of keys) walk(k);
      return out.sort((a, b) => a.sortOrder - b.sortOrder);
    };

    const branchIds = branches.map((b) => b.id);
    const [templates, doneEntries, attRows] = await Promise.all([
      branchIds.length
        ? this.prisma.kpiAssignmentTemplate.findMany({
            where: { frequency, active: true, branchId: { in: branchIds } },
            select: { branchId: true, nodeKey: true },
          })
        : Promise.resolve([] as Array<{ branchId: string; nodeKey: string }>),
      branchIds.length
        ? this.prisma.kpiDayEntry.findMany({
            where: { date, done: true, branchId: { in: branchIds } },
            select: { branchId: true, nodeKey: true },
          })
        : Promise.resolve([] as Array<{ branchId: string; nodeKey: string }>),
      frequency === 'DAILY' && branchIds.length
        ? this.prisma.employeeAttendance.findMany({
            where: {
              date,
              branchId: { in: branchIds },
              status: { in: [AttendanceStatus.ON_TIME, AttendanceStatus.LATE] },
            },
            select: { branchId: true },
          })
        : Promise.resolve([] as Array<{ branchId: string }>),
    ]);

    const assignedKeysByBranch = new Map<string, string[]>();
    for (const t of templates) {
      const arr = assignedKeysByBranch.get(t.branchId) || [];
      arr.push(t.nodeKey);
      assignedKeysByBranch.set(t.branchId, arr);
    }
    const doneSet = new Set(doneEntries.map((e) => `${e.branchId}:${e.nodeKey}`));
    const sharedDoneGlobally = new Set<string>();
    for (const e of doneEntries) {
      const n = nodeByKey.get(e.nodeKey);
      if (n && (n.sharedAcrossBranches || isCompanyWideTaskKey(e.nodeKey))) {
        sharedDoneGlobally.add(e.nodeKey);
      }
    }
    const attArrived = new Set<string>();
    for (const a of attRows) attArrived.add(a.branchId);

    const lines: string[] = [];
    const branchStats: FreqBranchStat[] = [];
    const sharedSeen = new Set<string>();
    const sharedIncomplete: IncompleteTask[] = [];
    let totalAssigned = 0;
    let totalDone = 0;
    const laggingManagers: string[] = [];

    for (const b of branches) {
      const leaves = expandLeaves(assignedKeysByBranch.get(b.id) || []);
      const assigned = leaves.length;
      if (!assigned) continue;

      const incomplete: IncompleteTask[] = [];
      let done = 0;
      for (const node of leaves) {
        const shared = Boolean(node.sharedAcrossBranches) || isCompanyWideTaskKey(node.key);
        const attDone =
          node.key === ATTENDANCE_NODE_KEY && attArrived.has(b.id);
        const locallyDone = doneSet.has(`${b.id}:${node.key}`) || attDone;
        const globallySharedDone = shared && sharedDoneGlobally.has(node.key);
        if (locallyDone || globallySharedDone) {
          done += 1;
          continue;
        }
        if (shared) {
          if (!sharedSeen.has(node.key)) {
            sharedSeen.add(node.key);
            sharedIncomplete.push({
              key: node.key,
              title: node.titleUz || node.key,
              section: rootSectionOf(node.key) || 'Umumiy biznes',
              shared: true,
            });
          }
          continue;
        }
        incomplete.push({
          key: node.key,
          title: node.titleUz || node.key,
          section: rootSectionOf(node.key),
          shared: false,
        });
      }
      done = Math.min(done, assigned);

      const managers = b.managers
        .filter((m) => m.user?.active !== false && m.user?.name)
        .map((m) => m.user!.name);

      totalAssigned += assigned;
      totalDone += done;
      lines.push(branchProgressLine({ name: b.name, done, assigned }));
      branchStats.push({
        id: b.id,
        name: b.name,
        done,
        assigned,
        incomplete,
        managers,
      });

      if (done < assigned) laggingManagers.push(...managers);
    }

    return {
      lines,
      branches: branchStats,
      sharedIncomplete,
      totalAssigned,
      totalDone,
      laggingManagers: [...new Set(laggingManagers)],
    };
  }

  private async collectExpiredWindowLines(date: Date) {
    const dateISO = date.toISOString().slice(0, 10);
    const nodes = await this.prisma.kpiCatalogNode.findMany({
      where: {
        active: true,
        frequency: 'DAILY',
        windowStartMin: { not: null },
        windowEndMin: { not: null },
        inputType: { not: 'GROUP' },
      },
      select: { key: true, titleUz: true, windowStartMin: true, windowEndMin: true },
    });
    const expiredKeys = nodes
      .filter((n) => evalTaskWindow(n.windowStartMin, n.windowEndMin, { dateISO }).status === 'expired')
      .map((n) => n.key);
    if (!expiredKeys.length) return { count: 0, titles: [] as string[], managers: [] as string[] };

    const branches = await this.prisma.branch.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        managers: { include: { user: { select: { name: true, active: true } } } },
      },
    });
    const titles: string[] = [];
    const managers = new Set<string>();
    let count = 0;
    for (const b of branches) {
      const assigned = await this.prisma.kpiAssignmentTemplate.findMany({
        where: { branchId: b.id, frequency: 'DAILY', active: true, nodeKey: { in: expiredKeys } },
        select: { nodeKey: true },
      });
      if (!assigned.length) continue;
      const keys = assigned.map((a) => a.nodeKey);
      const done = await this.prisma.kpiDayEntry.findMany({
        where: { branchId: b.id, date, done: true, nodeKey: { in: keys } },
        select: { nodeKey: true },
      });
      const doneSet = new Set(done.map((d) => d.nodeKey));
      for (const key of keys) {
        if (doneSet.has(key)) continue;
        count += 1;
        const title = nodes.find((n) => n.key === key)?.titleUz || key;
        if (titles.length < 8) titles.push(`${b.name}: ${title}`);
        for (const m of b.managers) {
          if (m.user?.active !== false && m.user?.name) managers.add(m.user.name);
        }
      }
    }
    return { count, titles, managers: [...managers] };
  }

  async morningChecklistAlert() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
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
          'Eslatma: har <b>2 soatda</b> (09:00–21:00) — bajarilmagan kunlik ishlar roʻyxati.',
        ],
      }),
      { buttons: false },
    );
  }
}
