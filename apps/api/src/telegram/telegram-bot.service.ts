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

type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string; title?: string };
    from?: { id: number; first_name?: string; username?: string };
  };
};

const BLOCK_NAMES: Record<string, string> = {
  clinic: "Klinika ko'rigi",
  reception: 'Retsepshn',
  calls: "Qo'ng'iroqlar",
  reviews: 'Sharhlar',
  uniform: 'Uniforma',
  smm: 'SMM / SEO',
  marketing: 'Marketing',
};

const REQUIRED = ['clinic', 'reception', 'calls', 'uniform'] as const;

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
        { command: 'start', description: 'Bot haqida' },
        { command: 'yordam', description: "Buyruqlar ro'yxati" },
        { command: 'kun', description: 'Bugungi kun (dam olish / ish)' },
        { command: 'vazifalar', description: 'Kunlik vazifalar holati' },
        { command: 'xodim', description: 'Bajarilmagan vazifalar' },
        { command: 'ai', description: 'AI kunlik nazorat' },
        { command: 'dam', description: 'Dam olish kalendari' },
        { command: 'bugun', description: 'Bugungi KPI ball' },
        { command: 'holat', description: "Bloklar to'ldirish" },
        { command: 'ombor', description: 'Past zaxira' },
        { command: 'hafta', description: "7 kunlik o'rtacha" },
        { command: 'test', description: 'Ulanishni tekshirish' },
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

  async send(text: string, chatId = this.chatId): Promise<{ ok: boolean; error?: string }> {
    if (!this.token || !chatId) {
      return { ok: false, error: 'Telegram sozlanmagan' };
    }
    try {
      const json = await this.api('sendMessage', {
        chat_id: chatId,
        text: text.slice(0, 4000),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      if (!json.ok) {
        this.logger.warn(`Telegram: ${json.description}`);
        return { ok: false, error: json.description || 'xato' };
      }
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.logger.warn(error);
      return { ok: false, error };
    }
  }

  async notify(title: string, message: string, emoji = '🔔') {
    return this.send(`${emoji} <b>${this.escape(title)}</b>\n${this.escape(message)}`);
  }

  private escape(s: string) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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

    // Faqat sozlangan guruh (TELEGRAM_CHAT_ID)
    if (String(msg.chat.id) !== String(this.chatId)) return;

    const cmd = text.split(/\s+/)[0].replace(/@\w+$/, '').toLowerCase();
    const replyTo = String(msg.chat.id);

    try {
      switch (cmd) {
        case '/start':
          await this.send(this.helpText(true), replyTo);
          break;
        case '/yordam':
        case '/help':
          await this.send(this.helpText(false), replyTo);
          break;
        case '/kun':
          await this.send(await this.dayStatusText(), replyTo);
          break;
        case '/dam':
        case '/kalendar':
          await this.send(await this.restCalendarText(), replyTo);
          break;
        case '/vazifalar':
        case '/jamoa':
        case '/toplam':
          await this.send(await this.tasksDigestText(), replyTo);
          break;
        case '/xodim':
          await this.send(await this.incompleteTasksText(), replyTo);
          break;
        case '/ai':
        case '/nazorat':
          await this.send(await this.aiMonitorText(), replyTo);
          break;
        case '/bugun':
        case '/kpi':
          await this.send(await this.todayScoreText(), replyTo);
          break;
        case '/holat':
          await this.send(await this.completionText(), replyTo);
          break;
        case '/hafta':
          await this.send(await this.weekText(), replyTo);
          break;
        case '/test':
          await this.send('✅ KliniKPI bot ishlayapti. Model: kunlik vazifalar + dam olish + AI.', replyTo);
          break;
        default:
          await this.send("Noma'lum buyruq. /yordam ni bosing.", replyTo);
      }
    } catch (e) {
      this.logger.warn(`Command error: ${e}`);
      await this.send("Xatolik yuz berdi. Keyinroq urinib ko'ring.", replyTo);
    }
  }

  helpText(welcome: boolean) {
    const head = welcome
      ? '<b>KliniKPI bot</b>\nKunlik vazifalar · dam olish · AI nazorat\n\n'
      : '<b>Buyruqlar</b>\n\n';
    return (
      head +
      '<b>Avtomatik (Asia/Tashkent):</b>\n' +
      '• <b>06:00</b> — ish kuni: kunlik vazifalar ochiladi\n' +
      '• Dam olish (Shanba/Yakshanba + bayram) — vazifa yoʻq, hisoblanmaydi\n' +
      '• 12:00 / 17:00 / 18:00 — eslatmalar (faqat ish kuni)\n' +
      '• <b>19:00</b> — AI kunlik nazorat\n\n' +
      '<b>Buyruqlar:</b>\n' +
      '/kun — bugun ish kuni yoki dam olish\n' +
      '/bugun — KPI ball (menejer)\n' +
      '/holat — majburiy bloklar\n' +
      '/hafta — 7 kunlik o\'rtacha\n' +
      '/test — ulanish'
    );
  }

  async dayStatusText() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return (
        `🌴 <b>Dam olish kuni</b>\n` +
        `Sana: ${day.date} · ${day.weekdayLabel}\n` +
        `${day.holiday ? `Sabab: ${this.escape(day.holiday.title)}\n` : ''}` +
        `\nBugun vazifa ochilmaydi va hisoblanmaydi.`
      );
    }
    return (
      `☀️ <b>Ish kuni</b>\n` +
      `Sana: ${day.date} · ${day.weekdayLabel}\n` +
      `Kunlik vazifalar 06:00 da ochiladi · AI nazorat 19:00 da.\n` +
      `Holat: /vazifalar`
    );
  }

  async restCalendarText() {
    const cfg = await this.calendar.calendarConfig();
    const days = (cfg.restWeekdayLabels || []).join(', ') || '—';
    const holidays = (cfg.holidays || [])
      .slice(0, 15)
      .map((h: any) => `• ${h.date}: ${this.escape(h.title)}`)
      .join('\n');
    return (
      `📅 <b>Dam olish kalendari</b>\n` +
      `Vaqt zonasi: ${cfg.timezone}\n` +
      `Haftalik: <b>${this.escape(days)}</b>\n\n` +
      `<b>Bayramlar:</b>\n` +
      (holidays || '• Qoʻshimcha bayram yoʻq') +
      `\n\nSozlash: platforma → Sozlamalar`
    );
  }

  async tasksDigestText() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return (
        `🌴 <b>Dam olish — ${day.date}</b>\n` +
        `${day.holiday?.title || day.weekdayLabel}\n` +
        `Kunlik vazifalar ochilmagan, hisoblanmaydi.`
      );
    }
    if (!this.staff) return 'Xodim moduli yuklanmagan';
    const board = await this.staff.teamBoard(day.date);
    const lines = (board.members || []).map(
      (m: any) =>
        `• ${this.escape(m.user.name)} (${this.escape(m.user.positionLabel || '—')}): ` +
        `<b>${m.stats.completionPct}%</b> · ✅${m.stats.approved} 📎${m.stats.submitted} ⏳${m.stats.pending}`,
    );
    return (
      `<b>Kunlik vazifalar — ${day.date}</b>\n` +
      (lines.join('\n') || 'Lavozimli xodim yoʻq. /team orqali vazifa biriktiring.')
    );
  }

  async incompleteTasksText() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return `🌴 Dam olish kuni (${day.date}) — bajarilmagan vazifa hisoblanmaydi.`;
    }
    if (!this.staff) return 'Xodim moduli yuklanmagan';
    const text = await this.staff.incompleteDigestText();
    // staff digesti HTML qisman berishi mumkin — escape qilib oddiy chiqaramiz
    return this.escape(text.replace(/<\/?b>/g, ''));
  }

  async aiMonitorText() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return `🌴 Dam olish (${day.date}) — AI nazorat ishlamaydi.`;
    }
    if (!this.staff) return 'Xodim moduli yuklanmagan';
    await this.send('🤖 AI kunlik nazorat ishga tushdi…', this.chatId);
    const res = await this.staff.runAiDailyMonitor('telegram-/ai');
    if (res.restDay) return this.escape(res.message || 'Dam olish');
    return (
      `<b>AI kunlik nazorat — ${res.date}</b>\n` +
      `Xodimlar: ${res.members}\n\n` +
      this.escape((res.report || '').slice(0, 3200))
    );
  }

  async todayScoreText() {
    const day = await this.calendar.getDayInfo();
    const date = toDateOnly(day.date);
    if (day.restDay) {
      return (
        `🌴 <b>${day.date}</b> — dam olish\n` +
        `KPI ball hisoblanmaydi (${day.holiday?.title || day.weekdayLabel}).`
      );
    }
    const score = await this.prisma.dailyScore.findUnique({ where: { date } });
    if (!score) {
      return `📅 <b>${day.date}</b>\nHali kunlik ball hisoblanmagan.`;
    }
    if (score.colorStatus === 'rest' || (score.completion as any)?.restDay) {
      return `🌴 <b>${day.date}</b> — dam olish (KPI hisoblanmagan).`;
    }
    const blocks = (score.blockScores as Record<string, any>) || {};
    const completion = (score.completion as any) || null;
    const lines = Object.entries(blocks)
      .filter(([k]) => !k.startsWith('_') && typeof blocks[k] === 'number')
      .map(([k, v]) => `• ${BLOCK_NAMES[k] || k}: <b>${v}%</b>`);

    const color =
      score.colorStatus === 'green' ? '🟢' : score.colorStatus === 'yellow' ? '🟡' : '🔴';

    return (
      `${color} <b>Bugungi KPI: ${score.totalScore}%</b>\n` +
      `Sana: ${day.date}\n` +
      (completion
        ? `To'ldirish: ${completion.requiredFilled}/${completion.requiredTotal} majburiy\n`
        : '') +
      `\n${lines.join('\n') || "Blok ma'lumoti yo'q"}`
    );
  }

  async completionText() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return `🌴 Dam olish (${day.date}) — majburiy bloklar talab qilinmaydi.`;
    }
    const date = toDateOnly(day.date);
    const [clinic, reception, uniform, calls] = await Promise.all([
      this.prisma.dailyClinicCheck.findUnique({ where: { date } }),
      this.prisma.receptionCheck.findUnique({ where: { date } }),
      this.prisma.uniformCheck.findUnique({ where: { date } }),
      this.prisma.callEntry.findMany({ where: { date } }),
    ]);
    const filled: Record<string, boolean> = {
      clinic: !!clinic,
      reception: !!reception,
      uniform: !!uniform,
      calls: calls.length > 0,
    };
    const missing = REQUIRED.filter((k) => !filled[k]);
    const done = REQUIRED.filter((k) => filled[k]);

    if (!missing.length) {
      return `✅ <b>Bugun majburiy bloklar to'liq</b>\n${done.map((k) => `• ${BLOCK_NAMES[k]}`).join('\n')}`;
    }
    return (
      `⚠️ <b>To'ldirilmagan majburiy bloklar</b>\n` +
      missing.map((k) => `• ${BLOCK_NAMES[k]}`).join('\n') +
      `\n\n✅ Tayyor:\n` +
      (done.length ? done.map((k) => `• ${BLOCK_NAMES[k]}`).join('\n') : "• Hali yo'q")
    );
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
      return "✅ Ombor holati yaxshi — past zaxira va yaqin muddat yo'q.";
    }
    let text = '';
    if (low.length) {
      text +=
        `📦 <b>Past zaxira (${low.length})</b>\n` +
        low.map((p) => `• ${this.escape(p.name)}: ${p.currentStock}/${p.minStock}`).join('\n');
    }
    if (expiring.length) {
      text +=
        (text ? '\n\n' : '') +
        `⏳ <b>30 kun ichida muddati tugaydi (${expiring.length})</b>\n` +
        expiring
          .map((p) => `• ${this.escape(p.name)}: ${p.expiryDate?.toISOString().slice(0, 10)}`)
          .join('\n');
    }
    return text;
  }

  async weekText() {
    const end = toDateOnly(new Date());
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    const scores = await this.prisma.dailyScore.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });
    // Dam olish kunlarini o'rtachadan chiqarish
    const working = scores.filter(
      (s) => s.colorStatus !== 'rest' && !(s.completion as any)?.restDay,
    );
    if (!working.length) return "Haftalik ish kuni ma'lumoti yo'q (yoki faqat dam olish).";
    const avg =
      Math.round((working.reduce((s, x) => s + x.totalScore, 0) / working.length) * 10) / 10;
    const lines = scores.map((s) => {
      const rest = s.colorStatus === 'rest' || (s.completion as any)?.restDay;
      if (rest) return `• ${s.date.toISOString().slice(0, 10)}: 🌴 dam olish`;
      const icon =
        s.colorStatus === 'green' ? '🟢' : s.colorStatus === 'yellow' ? '🟡' : '🔴';
      return `• ${s.date.toISOString().slice(0, 10)}: ${s.totalScore}% ${icon}`;
    });
    return `📊 <b>7 kunlik o'rtacha (ish kunlari): ${avg}%</b>\n\n${lines.join('\n')}`;
  }

  /** Kechki eslatma: aniq qaysi bloklar yo'q */
  async eveningIncompleteAlert() {
    if (await this.calendar.isRestDay()) {
      await this.notify('Dam olish', 'Bugun kechki KPI eslatmasi yoʻq.', '🌴');
      return;
    }
    const text = await this.completionText();
    if (text.includes("to'liq")) {
      await this.notify('Kun yakunlandi', "Barcha majburiy KPI bloklari to'ldirilgan. Rahmat!", '✅');
      return;
    }
    await this.notify(
      'Kechki eslatma (18:00)',
      "Kunlik KPI hali to'liq emas.\n\n" + text.replace(/<\/?b>/g, ''),
      '⏰',
    );
  }

  async morningChecklistAlert() {
    if (await this.calendar.isRestDay()) {
      const day = await this.calendar.getDayInfo();
      await this.notify(
        'Dam olish kuni',
        `${day.date}: chek-list va vazifa yoʻq (${day.holiday?.title || day.weekdayLabel}).`,
        '🌴',
      );
      return;
    }
    await this.notify(
      'Ish kuni eslatmasi',
      'Kunlik vazifalar ochilgan (06:00).\nMajburiy bloklar: Klinika, Retsepshn, Uniforma, Ombor, Qoʻngʻiroqlar.\n\n/vazifalar · /holat',
      '☀️',
    );
  }
}
