import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toDateOnly, BUSINESS_TZ } from './kpi.constants';

const REST_WEEKDAYS_KEY = 'rest_weekdays';

/** JS getUTCDay: 0=Yakshanba … 6=Shanba. Default UZ: Shanba+Yakshanba */
export const DEFAULT_REST_WEEKDAYS = [0, 6];

export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Yakshanba',
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
};

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  async getRestWeekdays(): Promise<number[]> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: REST_WEEKDAYS_KEY } });
    if (!row || !Array.isArray(row.value)) return [...DEFAULT_REST_WEEKDAYS];
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
