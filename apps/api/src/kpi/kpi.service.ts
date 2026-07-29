import { BadRequestException, Injectable, Inject, forwardRef } from '@nestjs/common';
import { CallType, ReviewQuality, ReviewSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService, CLINIC_ITEMS, RECEPTION_ITEMS, UNIFORM_ITEMS } from './scoring.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StaffService } from '../staff/staff.service';
import { pct, startOfWeek, toDateOnly } from '../common/kpi.constants';
import { openaiChat } from '../common/openai';

@Injectable()
export class KpiService {
  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
    private notifications: NotificationsService,
    @Inject(forwardRef(() => StaffService))
    private staff: StaffService,
  ) {}

  private async syncStaffTask(userId: string, blockKey: string, dateStr: string) {
    try {
      await this.staff.autoCompleteFromKpi(userId, blockKey, dateStr);
    } catch {
      // ignore sync errors
    }
  }

  meta() {
    return {
      clinic: CLINIC_ITEMS,
      reception: RECEPTION_ITEMS,
      uniform: UNIFORM_ITEMS,
      callTypes: [
        { key: 'NEW', label: 'Yangi bemorlar', target: 100 },
        { key: 'REPEAT', label: 'Takroriy bemorlar', target: null },
        { key: 'MISSED', label: 'O\'tkazib yuborilgan', target: null },
      ],
      reviewSources: Object.values(ReviewSource),
      reviewQualities: Object.values(ReviewQuality),
    };
  }

  async getDayOverview(dateStr?: string) {
    const date = toDateOnly(dateStr);
    // Har safar to'ldirilish holatini yangilab olish
    const scoreResult = await this.scoring.recalculateDailyScore(date);

    const [clinic, reception, uniform, warehouse, calls, reviews, seo, social, ads, flyers, stories, score] =
      await Promise.all([
        this.prisma.dailyClinicCheck.findUnique({ where: { date } }),
        this.prisma.receptionCheck.findUnique({ where: { date } }),
        this.prisma.uniformCheck.findUnique({ where: { date } }),
        this.prisma.warehouseCheck.findUnique({ where: { date } }),
        this.prisma.callEntry.findMany({ where: { date } }),
        this.prisma.review.findMany({ where: { date }, orderBy: { createdAt: 'desc' } }),
        this.prisma.seoCheck.findUnique({ where: { date } }),
        this.prisma.socialStats.findMany({ where: { date } }),
        this.prisma.adsCheck.findUnique({ where: { date } }),
        this.prisma.flyerEntry.findMany({ where: { date } }),
        this.prisma.doctorStory.findMany({
          where: { date },
          include: { doctor: { select: { id: true, name: true } } },
        }),
        this.prisma.dailyScore.findFirst({ where: { date, frequency: 'LEGACY' } }),
      ]);

    return {
      date: date.toISOString().slice(0, 10),
      clinic,
      reception,
      uniform,
      warehouse,
      calls,
      reviews,
      seo,
      social,
      ads,
      flyers,
      stories,
      score,
      completion: scoreResult.completion || score?.completion,
    };
  }

  private async audit(userId: string, action: string, entity: string, entityId?: string, meta?: object) {
    await this.prisma.auditLog.create({
      data: { userId, action, entity, entityId, meta: meta as any },
    });
  }

  async saveClinic(userId: string, dateStr: string, items: Record<string, boolean>) {
    const date = toDateOnly(dateStr);
    const percentage = this.scoring.checklistPct(items, CLINIC_ITEMS);
    const row = await this.prisma.dailyClinicCheck.upsert({
      where: { date },
      create: { date, items, percentage, adminId: userId },
      update: { items, percentage, adminId: userId },
    });
    await this.audit(userId, 'upsert', 'clinic', row.id, { percentage });
    await this.scoring.recalculateDailyScore(date);
    await this.syncStaffTask(userId, 'clinic', dateStr);
    return row;
  }

  async saveReception(userId: string, dateStr: string, items: Record<string, boolean>) {
    const date = toDateOnly(dateStr);
    const percentage = this.scoring.checklistPct(items, RECEPTION_ITEMS);
    const row = await this.prisma.receptionCheck.upsert({
      where: { date },
      create: { date, items, percentage, adminId: userId },
      update: { items, percentage, adminId: userId },
    });
    await this.audit(userId, 'upsert', 'reception', row.id);
    await this.scoring.recalculateDailyScore(date);
    await this.syncStaffTask(userId, 'reception', dateStr);
    return row;
  }

  async saveUniform(userId: string, dateStr: string, items: Record<string, boolean>) {
    const date = toDateOnly(dateStr);
    const percentage = this.scoring.checklistPct(items, UNIFORM_ITEMS);
    const row = await this.prisma.uniformCheck.upsert({
      where: { date },
      create: { date, items, percentage, adminId: userId },
      update: { items, percentage, adminId: userId },
    });
    await this.audit(userId, 'upsert', 'uniform', row.id);
    await this.scoring.recalculateDailyScore(date);
    await this.syncStaffTask(userId, 'uniform', dateStr);
    return row;
  }

  async saveWarehouse(_userId: string, _dateStr: string, _items: Record<string, boolean>, _minStockFlag?: boolean) {
    throw new BadRequestException('Ombor moduli olib tashlangan');
  }

  async saveCall(
    userId: string,
    dateStr: string,
    type: CallType,
    callsCount: number,
    bookedCount: number,
    recalledCount?: number,
  ) {
    const date = toDateOnly(dateStr);
    let conversion = 0;
    if (type === CallType.MISSED) {
      const denom = recalledCount || 0;
      conversion = denom ? pct(bookedCount, denom) : 0;
    } else {
      conversion = callsCount ? pct(bookedCount, callsCount) : 0;
    }

    const row = await this.prisma.callEntry.upsert({
      where: { date_type: { date, type } },
      create: {
        date,
        type,
        callsCount,
        bookedCount,
        recalledCount: recalledCount ?? 0,
        conversion,
        adminId: userId,
      },
      update: {
        callsCount,
        bookedCount,
        recalledCount: recalledCount ?? 0,
        conversion,
        adminId: userId,
      },
    });

    await this.audit(userId, 'upsert', 'calls', row.id, { type, conversion });
    await this.scoring.recalculateDailyScore(date);
    await this.syncStaffTask(userId, 'calls', dateStr);
    return row;
  }

  async addReview(
    userId: string,
    dateStr: string,
    count: number,
    source: ReviewSource,
    quality: ReviewQuality,
    note?: string,
  ) {
    const date = toDateOnly(dateStr);
    const row = await this.prisma.review.create({
      data: { date, count, source, quality, note, adminId: userId },
    });
    await this.scoring.recalculateDailyScore(date);
    await this.syncStaffTask(userId, 'reviews', dateStr);
    return row;
  }

  async saveSeo(
    userId: string,
    dateStr: string,
    data: {
      newArticle?: boolean;
      newVideo?: boolean;
      newReviews?: boolean;
      pageUpdated?: boolean;
      seoOk?: boolean;
      pagespeedScore?: number;
      note?: string;
    },
  ) {
    const date = toDateOnly(dateStr);
    const row = await this.prisma.seoCheck.upsert({
      where: { date },
      create: { date, adminId: userId, ...data },
      update: { ...data, adminId: userId },
    });
    await this.scoring.recalculateDailyScore(date);
    await this.syncStaffTask(userId, 'seo', dateStr);
    return row;
  }

  async saveSocial(
    dateStr: string,
    platform: string,
    data: {
      posts?: number;
      stories?: number;
      reels?: number;
      comments?: number;
      likes?: number;
      newFollowers?: number;
      views?: number;
      source?: string;
    },
    userId?: string,
  ) {
    const date = toDateOnly(dateStr);
    const platformKey = platform.toLowerCase();
    if (!['instagram', 'telegram', 'youtube'].includes(platformKey)) {
      throw new BadRequestException('Noto\'g\'ri platforma');
    }
    const row = await this.prisma.socialStats.upsert({
      where: { date_platform: { date, platform: platformKey } },
      create: { date, platform: platformKey, ...data },
      update: data,
    });
    await this.scoring.recalculateDailyScore(date);
    if (userId) await this.syncStaffTask(userId, 'social', dateStr);
    return row;
  }

  async saveAds(
    userId: string,
    dateStr: string,
    data: { aired: boolean; channel?: string; timeSlot?: string; note?: string },
  ) {
    const date = toDateOnly(dateStr);
    const row = await this.prisma.adsCheck.upsert({
      where: { date },
      create: { date, adminId: userId, ...data },
      update: { ...data, adminId: userId },
    });
    await this.scoring.recalculateDailyScore(date);
    await this.syncStaffTask(userId, 'ads', dateStr);
    return row;
  }

  async addFlyer(userId: string, dateStr: string, count: number, location: string) {
    const date = toDateOnly(dateStr);
    const row = await this.prisma.flyerEntry.create({
      data: { date, count, location, adminId: userId },
    });
    await this.scoring.recalculateDailyScore(date);
    return row;
  }

  async addBlogger(
    userId: string,
    weekStart: string,
    data: { name: string; followers: number; niche?: string; contact?: string; note?: string },
  ) {
    const date = toDateOnly(weekStart);
    const row = await this.prisma.bloggerEntry.create({
      data: { weekStart: date, adminId: userId, ...data },
    });
    await this.scoring.recalculateDailyScore(date);
    return row;
  }

  async listBloggers() {
    return this.prisma.bloggerEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async saveDoctorStories(userId: string, dateStr: string, entries: { doctorId: string; posted: boolean }[]) {
    const date = toDateOnly(dateStr);
    const results: any[] = [];
    for (const e of entries) {
      const row = await this.prisma.doctorStory.upsert({
        where: { date_doctorId: { date, doctorId: e.doctorId } },
        create: { date, doctorId: e.doctorId, posted: e.posted, adminId: userId },
        update: { posted: e.posted, adminId: userId },
      });
      results.push(row);
    }
    await this.scoring.recalculateDailyScore(date);
    return results;
  }

  async saveDoctorReferrals(
    userId: string,
    weekStart: string,
    entries: { doctorId: string; patientsCount: number }[],
  ) {
    const date = toDateOnly(weekStart);
    const results: any[] = [];
    for (const e of entries) {
      const row = await this.prisma.doctorReferral.upsert({
        where: { weekStart_doctorId: { weekStart: date, doctorId: e.doctorId } },
        create: {
          weekStart: date,
          doctorId: e.doctorId,
          patientsCount: e.patientsCount,
          adminId: userId,
        },
        update: { patientsCount: e.patientsCount, adminId: userId },
      });
      results.push(row);
    }
    await this.scoring.recalculateDailyScore(date);
    return results;
  }

  async listDoctorReferrals(weekStart?: string) {
    const date = toDateOnly(weekStart || new Date());
    const week = startOfWeek(date);
    return this.prisma.doctorReferral.findMany({
      where: { weekStart: week },
      include: { doctor: { select: { id: true, name: true } } },
    });
  }

  async saveMystery(userId: string, dateStr: string, booked: boolean, note?: string) {
    const date = toDateOnly(dateStr);
    const row = await this.prisma.mysteryPatientTest.upsert({
      where: { date },
      create: { date, booked, note, adminId: userId },
      update: { booked, note, adminId: userId },
    });
    await this.scoring.recalculateDailyScore(date);
    return row;
  }

  async listMystery() {
    return this.prisma.mysteryPatientTest.findMany({
      orderBy: { date: 'desc' },
      take: 20,
      include: { admin: { select: { name: true } } },
    });
  }

  async generateAiReport(
    type: 'SERVICES' | 'CALLS' | 'KPI',
    opts?: {
      period?: string;
      from?: string;
      to?: string;
      weekStart?: string;
      branchId?: string;
    },
  ) {
    const period = String(opts?.period || 'WEEK').toUpperCase();
    const { start, end } = resolveAiPeriod(period, opts?.from || opts?.weekStart, opts?.to);
    const startIso = start.toISOString().slice(0, 10);
    const endIso = end.toISOString().slice(0, 10);
    const periodLabel =
      period === 'DAY'
        ? 'Kunlik'
        : period === 'WEEK'
          ? 'Haftalik'
          : period === 'MONTH'
            ? 'Oylik'
            : period === 'YEAR'
              ? 'Yillik'
              : 'Davr';

    const scores = await this.prisma.dailyScore.findMany({
      where: {
        date: { gte: start, lte: end },
        frequency: 'DAILY',
        ...(opts?.branchId ? { branchId: opts.branchId } : {}),
      },
      orderBy: { date: 'asc' },
    });
    const avgScore = scores.length
      ? Math.round((scores.reduce((s, x) => s + x.totalScore, 0) / scores.length) * 10) / 10
      : 0;

    const entries = await this.prisma.kpiDayEntry.findMany({
      where: {
        date: { gte: start, lte: end },
        ...(opts?.branchId ? { branchId: opts.branchId } : {}),
      },
    });
    const doneCount = entries.filter((e) => e.done).length;

    let content = '';
    if (type === 'CALLS') {
      const calls = await this.prisma.callEntry.findMany({
        where: { date: { gte: start, lte: end } },
      });
      const total = calls.reduce((s, c) => s + c.callsCount, 0);
      const booked = calls.reduce((s, c) => s + c.bookedCount, 0);
      const avgConv = calls.length
        ? Math.round((calls.reduce((s, c) => s + c.conversion, 0) / calls.length) * 10) / 10
        : 0;
      content = [
        `# ${periodLabel} qo'ng'iroqlar tahlili`,
        `Davr: ${startIso} — ${endIso}`,
        `KPI o'rtacha: ${avgScore}% · Bajarilgan punktlar: ${doneCount}/${entries.length}`,
        ``,
        `## Asosiy`,
        `- Qo'ng'iroqlar: ${total}`,
        `- Yozilganlar: ${booked}`,
        `- Konversiya: ${avgConv}%`,
      ].join('\n');
    } else if (type === 'SERVICES') {
      const reviews = await this.prisma.review.findMany({
        where: { date: { gte: start, lte: end } },
      });
      const social = await this.prisma.socialStats.findMany({
        where: { date: { gte: start, lte: end } },
      });
      const pos = reviews.filter((r) => r.quality === 'POSITIVE').reduce((s, r) => s + r.count, 0);
      const totalR = reviews.reduce((s, r) => s + r.count, 0);
      content = [
        `# ${periodLabel} xizmatlar / marketing tahlili`,
        `Davr: ${startIso} — ${endIso}`,
        `KPI o'rtacha: ${avgScore}%`,
        ``,
        `## Sharhlar: ${totalR}, ijobiy: ${pos}`,
        ...social.map(
          (s) =>
            `- ${s.platform}: post ${s.posts}, stories ${s.stories}, reels ${s.reels}, +${s.newFollowers}`,
        ),
      ].join('\n');
    } else {
      const byKey: Record<string, { done: number; total: number }> = {};
      for (const e of entries) {
        const root = e.nodeKey.split('.')[0];
        if (!byKey[root]) byKey[root] = { done: 0, total: 0 };
        byKey[root].total++;
        if (e.done) byKey[root].done++;
      }
      content = [
        `# ${periodLabel} KPI hisobot`,
        `Davr: ${startIso} — ${endIso}`,
        `O'rtacha ball: ${avgScore}%`,
        `Kunlar: ${scores.length}`,
        `Bajarilgan: ${doneCount}/${entries.length}`,
        ``,
        `## Bo'limlar`,
        ...Object.entries(byKey).map(
          ([k, v]) => `- ${k}: ${v.done}/${v.total}`,
        ),
        ``,
        `## Kunlik ballar`,
        ...scores.map(
          (s) => `- ${String(s.date).slice(0, 10)}: ${s.totalScore}% (${s.colorStatus})`,
        ),
      ].join('\n');
    }

    const reportType = type === 'KPI' ? 'SERVICES' : type;
    const aiText = await openaiChat(
      `Siz Radeski KPI manager system AI tahlilchisiz. O'zbek tilida qisqa, amaliy ${periodLabel.toLowerCase()} hisobot yozing. Raqamlarni saqlang, aniq tavsiyalar bering.\n\n${content}`,
      {
        system:
          'Siz Radeski KPI AI nazoratchisisiz. Hisobotni o‘zbek tilida, tuzilmali (sarlavha, raqamlar, tavsiyalar) yozing.',
        maxTokens: 2200,
      },
    );
    if (aiText) content = aiText;

    const existing = await this.prisma.aiWeeklyReport.findFirst({
      where: { weekStart: start, type: reportType as any, period },
    });
    const report = existing
      ? await this.prisma.aiWeeklyReport.update({
          where: { id: existing.id },
          data: { content, periodEnd: end, period },
        })
      : await this.prisma.aiWeeklyReport.create({
          data: {
            weekStart: start,
            periodEnd: end,
            period,
            type: reportType as any,
            content,
          },
        });

    const preview = content.slice(0, 500) + (content.length > 500 ? '…' : '');
    await this.notifications.createForRoles(
      ['MANAGER', 'ADMIN', 'SUPER_ADMIN'],
      `AI: ${periodLabel} hisobot`,
      preview,
      'AI_REPORT',
      { emoji: '🤖' },
    );

    return report;
  }

  async listAiReports() {
    return this.prisma.aiWeeklyReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
  }
}

function resolveAiPeriod(
  period: string,
  from?: string,
  to?: string,
): { start: Date; end: Date } {
  const base = toDateOnly(from || new Date());
  if (period === 'DAY') {
    return { start: base, end: base };
  }
  if (period === 'WEEK') {
    const day = base.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + diff));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { start, end };
  }
  if (period === 'MONTH') {
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
    return { start, end };
  }
  if (period === 'YEAR') {
    const start = new Date(Date.UTC(base.getUTCFullYear(), 0, 1));
    const end = new Date(Date.UTC(base.getUTCFullYear(), 11, 31));
    return { start, end };
  }
  // CUSTOM
  const start = toDateOnly(from || new Date());
  const end = toDateOnly(to || from || new Date());
  if (end < start) return { start: end, end: start };
  return { start, end };
}
