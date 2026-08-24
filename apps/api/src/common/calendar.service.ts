import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toDateOnly, BUSINESS_TZ } from './kpi.constants';

const REST_WEEKDAYS_KEY = 'rest_weekdays';

/** JS getUTCDay: 0=Yakshanba … 6=Shanba. Faqat yakshanba + bayramlar */
export const DEFAULT_REST_WEEKDAYS = [0];

export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Yakshanba',
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
};

/** Oʻzbekiston rasmiy bayramlari (fixed + taxminiy hayitlar) */
const UZ_HOLIDAYS: Array<{ date: string; title: string }> = [
  // 2025
  { date: '2025-01-01', title: 'Yangi yil' },
  { date: '2025-03-08', title: 'Xalqaro xotin-qizlar kuni' },
  { date: '2025-03-21', title: 'Navroʻz bayrami' },
  { date: '2025-03-22', title: 'Navroʻz bayrami' },
  { date: '2025-03-23', title: 'Navroʻz bayrami' },
  { date: '2025-03-30', title: 'Roʻza hayiti' },
  { date: '2025-03-31', title: 'Roʻza hayiti' },
  { date: '2025-05-09', title: 'Xotira va qadrlash kuni' },
  { date: '2025-06-06', title: 'Qurbon hayiti' },
  { date: '2025-06-07', title: 'Qurbon hayiti' },
  { date: '2025-09-01', title: 'Mustaqillik kuni' },
  { date: '2025-10-01', title: 'Ustoz va murabbiylar kuni' },
  { date: '2025-12-08', title: 'Konstitutsiya kuni' },
  // 2026
  { date: '2026-01-01', title: 'Yangi yil' },
  { date: '2026-03-08', title: 'Xalqaro xotin-qizlar kuni' },
  { date: '2026-03-20', title: 'Roʻza hayiti' },
  { date: '2026-03-21', title: 'Navroʻz bayrami / Roʻza hayiti' },
  { date: '2026-03-22', title: 'Navroʻz bayrami' },
  { date: '2026-03-23', title: 'Navroʻz bayrami' },
  { date: '2026-05-09', title: 'Xotira va qadrlash kuni' },
  { date: '2026-05-27', title: 'Qurbon hayiti' },
  { date: '2026-05-28', title: 'Qurbon hayiti' },
  { date: '2026-09-01', title: 'Mustaqillik kuni' },
  { date: '2026-10-01', title: 'Ustoz va murabbiylar kuni' },
  { date: '2026-12-08', title: 'Konstitutsiya kuni' },
  // 2027
  { date: '2027-01-01', title: 'Yangi yil' },
  { date: '2027-03-08', title: 'Xalqaro xotin-qizlar kuni' },
  { date: '2027-03-10', title: 'Roʻza hayiti' },
  { date: '2027-03-11', title: 'Roʻza hayiti' },
  { date: '2027-03-21', title: 'Navroʻz bayrami' },
  { date: '2027-03-22', title: 'Navroʻz bayrami' },
  { date: '2027-03-23', title: 'Navroʻz bayrami' },
  { date: '2027-05-09', title: 'Xotira va qadrlash kuni' },
  { date: '2027-05-17', title: 'Qurbon hayiti' },
  { date: '2027-05-18', title: 'Qurbon hayiti' },
  { date: '2027-09-01', title: 'Mustaqillik kuni' },
  { date: '2027-10-01', title: 'Ustoz va murabbiylar kuni' },
  { date: '2027-12-08', title: 'Konstitutsiya kuni' },
];

@Injectable()
export class CalendarService implements OnModuleInit {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.ensureSundayOnlyRest();
      await this.ensureUzHolidays();
    } catch (e) {
      this.logger.warn(`Calendar ensure failed: ${e}`);
    }
  }

  /** Dam olish: faqat yakshanba (shanba ish kuni) */
  async ensureSundayOnlyRest() {
    const current = await this.getRestWeekdays();
    if (current.length === 1 && current[0] === 0) return;
    await this.setRestWeekdays([0]);
    this.logger.log('Rest weekdays → faqat Yakshanba');
  }

  async ensureUzHolidays() {
    let n = 0;
    for (const h of UZ_HOLIDAYS) {
      const date = toDateOnly(h.date);
      const existing = await this.prisma.holiday.findUnique({ where: { date } });
      if (existing) continue;
      await this.prisma.holiday.create({
        data: { date, title: h.title },
      });
      n += 1;
    }
    if (n) this.logger.log(`UZ holidays seeded: +${n}`);
  }

  async getRestWeekdays(): Promise<number[]> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: REST_WEEKDAYS_KEY } });
    if (!row || !Array.isArray(row.value) || !(row.value as number[]).length) {
      return [...DEFAULT_REST_WEEKDAYS];
    }
    return (row.value as number[]).map(Number).filter((d) => d >= 0 && d <= 6);
  }

  async setRestWeekdays(days: number[]) {
    const unique = [...new Set(days.map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    await this.prisma.appSetting.upsert({
      where: { key: REST_WEEKDAYS_KEY },
      create: { key: REST_WEEKDAYS_KEY, value: unique },
      update: { value: unique },
    });
    return unique;
  }

  listHolidays() {
    return this.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  }

  async addHoliday(dateStr: string, title: string) {
    const date = toDateOnly(dateStr);
    return this.prisma.holiday.upsert({
      where: { date },
      create: { date, title: title.trim() || 'Dam olish' },
      update: { title: title.trim() || 'Dam olish' },
    });
  }

  async removeHoliday(id: string) {
    await this.prisma.holiday.delete({ where: { id } });
    return { ok: true };
  }

  async isRestDay(dateInput?: string | Date): Promise<boolean> {
    const date = toDateOnly(dateInput);
    const weekday = date.getUTCDay();
    const restDays = await this.getRestWeekdays();
    if (restDays.includes(weekday)) return true;
    const holiday = await this.prisma.holiday.findUnique({ where: { date } });
    return !!holiday;
  }

  async getDayInfo(dateInput?: string | Date) {
    const date = toDateOnly(dateInput);
    const rest = await this.isRestDay(date);
    const weekday = date.getUTCDay();
    const holiday = await this.prisma.holiday.findUnique({ where: { date } });
    return {
      date: date.toISOString().slice(0, 10),
      timezone: BUSINESS_TZ,
      weekday,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      restDay: rest,
      holiday: holiday ? { id: holiday.id, title: holiday.title } : null,
      workingDay: !rest,
    };
  }

  async calendarConfig() {
    const [restWeekdays, holidays] = await Promise.all([
      this.getRestWeekdays(),
      this.listHolidays(),
    ]);
    return {
      timezone: BUSINESS_TZ,
      restWeekdays,
      restWeekdayLabels: restWeekdays.map((d) => WEEKDAY_LABELS[d]),
      holidays: holidays.map((h) => ({
        id: h.id,
        date: h.date.toISOString().slice(0, 10),
        title: h.title,
      })),
      weekdayOptions: Object.entries(WEEKDAY_LABELS).map(([value, label]) => ({
        value: Number(value),
        label,
      })),
    };
  }
}
