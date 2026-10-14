import { BadRequestException, Injectable, Inject, forwardRef } from '@nestjs/common';
import { CallType, ReviewQuality, ReviewSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService, CLINIC_ITEMS, RECEPTION_ITEMS, UNIFORM_ITEMS } from './scoring.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StaffService } from '../staff/staff.service';
import { pct, startOfWeek, toDateOnly } from '../common/kpi.constants';
import {
  pctTone,
  reportPreview,
  rulesAiPart,
  scoreTone,
  writeAiPart,
  type AiReportV2,
  type ReportBar,
  type ReportBranch,
  type ReportDay,
  type ReportMissed,
  type ReportTile,
  type Tone,
} from './ai-report';

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

    const entries = await this.prisma.kpiDayEntry.findMany({
      where: {
        date: { gte: start, lte: end },
        ...(opts?.branchId ? { branchId: opts.branchId } : {}),
      },
    });
    const today = toDateOnly().toISOString().slice(0, 10);
    const branchRows = await this.prisma.branch.findMany({ select: { id: true, name: true } });
    const branchName = new Map(branchRows.map((b) => [b.id, b.name]));
    const branchLabel = opts?.branchId ? branchName.get(opts.branchId) || null : null;
    const r1 = (x: number) => Math.round(x * 10) / 10;
    const avgOf = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

    // Kunlik ballar: filial tanlanmasa — filiallar oʻrtachasi. Bugun hali tugamagan.
    const perDay = new Map<string, number[]>();
    for (const sc of scores) {
      if (!opts?.branchId && !sc.branchId) continue;
      const d = sc.date.toISOString().slice(0, 10);
      if (!perDay.has(d)) perDay.set(d, []);
      perDay.get(d)!.push(sc.totalScore);
    }
    const days: ReportDay[] = [...perDay.entries()]
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([date, xs]) => {
        const score = avgOf(xs);
        return { date, score, tone: scoreTone(score), ...(date === today ? { partial: true } : {}) };
      });
    const closedDays = days.filter((d) => !d.partial);
    const scoreDays = closedDays.length ? closedDays : days;
    const score = scoreDays.length ? avgOf(scoreDays.map((d) => d.score)) : null;

    const base = {
      v: 2 as const,
      kind: type,
      period,
      start: startIso,
      end: endIso,
      branch: branchLabel,
      score,
      scoreTone: scoreTone(score),
      tiles: [] as ReportTile[],
      days,
      bars: [] as ReportBar[],
      missed: [] as ReportMissed[],
      branches: [] as ReportBranch[],
    };
    const L = (uz: string, ru: string) => ({ uz, ru });

    if (type === 'CALLS') {
      // Qoʻngʻiroqlar filialga bogʻlanmagan — butun klinika boʻyicha
      base.branch = null;
      const calls = await this.prisma.callEntry.findMany({
        where: { date: { gte: start, lte: end } },
      });
      const sum = (t: string | null, f: (c: (typeof calls)[number]) => number) =>
        calls.filter((c) => !t || c.type === t).reduce((acc, c) => acc + f(c), 0);
      const total = sum(null, (c) => c.callsCount);
      const booked = sum(null, (c) => c.bookedCount);
      const conv = total ? r1((booked / total) * 100) : 0;
      const missedCalls = sum('MISSED', (c) => c.callsCount);
      const recalled = sum('MISSED', (c) => c.recalledCount || 0);
      base.tiles = [
        { label: L('Qoʻngʻiroqlar', 'Звонки'), value: String(total), tone: 'neutral' },
        { label: L('Yozildi', 'Записано'), value: String(booked), tone: 'neutral' },
        { label: L('Konversiya', 'Конверсия'), value: `${conv}%`, tone: conv >= 40 ? 'good' : conv >= 25 ? 'warn' : 'bad' },
        {
          label: L('Javobsiz → qayta', 'Пропущ. → перезвон'),
          value: `${recalled}/${missedCalls}`,
          tone: !missedCalls ? 'neutral' : pctTone((recalled / missedCalls) * 100),
        },
      ];
      base.bars = (['NEW', 'REPEAT', 'MISSED'] as const).map((t) => {
        const c = sum(t, (x) => x.callsCount);
        const bk = sum(t, (x) => x.bookedCount);
        const pct = c ? Math.round((bk / c) * 100) : 0;
        const name = t === 'NEW' ? 'Yangi / Новые' : t === 'REPEAT' ? 'Takroriy / Повторные' : 'Javobsiz / Пропущенные';
        return { name, done: bk, total: c, pct, tone: (!c ? 'neutral' : pct >= 40 ? 'good' : pct >= 25 ? 'warn' : 'bad') as Tone };
      });
    } else if (type === 'SERVICES') {
      base.branch = null;
      const [reviews, social] = await Promise.all([
        this.prisma.review.findMany({ where: { date: { gte: start, lte: end } } }),
        this.prisma.socialStats.findMany({ where: { date: { gte: start, lte: end } } }),
      ]);
      const totalR = reviews.reduce((acc, r) => acc + r.count, 0);
      const pos = reviews.filter((r) => r.quality === 'POSITIVE').reduce((acc, r) => acc + r.count, 0);
      const neg = totalR - pos;
      const posPct = totalR ? Math.round((pos / totalR) * 100) : 0;
      const followers = social.reduce((acc, x) => acc + (x.newFollowers || 0), 0);
      const posts = social.reduce((acc, x) => acc + (x.posts || 0) + (x.reels || 0), 0);
      base.tiles = [
        { label: L('Sharhlar', 'Отзывы'), value: String(totalR), tone: totalR ? 'neutral' : 'warn' },
        { label: L('Ijobiy', 'Позитивные'), value: totalR ? `${posPct}%` : '—', tone: totalR ? pctTone(posPct) : 'neutral' },
        { label: L('Salbiy', 'Негативные'), value: String(neg), tone: neg ? 'bad' : 'good' },
        { label: L('Yangi obunachi', 'Новые подписчики'), value: `+${followers}`, tone: 'neutral', hint: L(`${posts} post/reels`, `${posts} постов/reels`) },
      ];
      const byPlatform = new Map<string, { posts: number; followers: number }>();
      for (const x of social) {
        const k = String(x.platform);
        const cur = byPlatform.get(k) || { posts: 0, followers: 0 };
        cur.posts += (x.posts || 0) + (x.reels || 0) + (x.stories || 0);
        cur.followers += x.newFollowers || 0;
        byPlatform.set(k, cur);
      }
      base.bars = [...byPlatform.entries()].map(([name, v]) => ({
        name: `${name} · +${v.followers}`,
        done: v.posts,
        total: v.posts,
        pct: 100,
        tone: 'neutral' as Tone,
      }));
    } else {
      const nodes = await this.prisma.kpiCatalogNode.findMany({ select: { key: true, titleUz: true } });
      const titleOf = new Map(nodes.map((n) => [n.key, n.titleUz]));
      const blockName = (root: string) =>
        (titleOf.get(root) || root).replace(/\s*·\s*(kunlik|haftalik|oylik)$/i, '');

      const byBlock: Record<string, { done: number; total: number }> = {};
      const missed: Record<string, number> = {};
      for (const e of entries) {
        const block = blockName(e.nodeKey.split('.')[0]);
        if (!byBlock[block]) byBlock[block] = { done: 0, total: 0 };
        byBlock[block].total++;
        if (e.done) byBlock[block].done++;
        else {
          const t = titleOf.get(e.nodeKey) || e.nodeKey;
          missed[t] = (missed[t] || 0) + 1;
        }
      }
      const doneCount = entries.filter((e) => e.done).length;
      const donePct = entries.length ? Math.round((doneCount / entries.length) * 100) : 0;
      const best = closedDays.length ? closedDays.reduce((m, d) => (d.score > m.score ? d : m)) : null;
      const worst = closedDays.length ? closedDays.reduce((m, d) => (d.score < m.score ? d : m)) : null;

      base.tiles = [
        { label: L('Bajarilgan ishlar', 'Выполнено задач'), value: `${doneCount}/${entries.length}`, tone: entries.length ? pctTone(donePct) : 'neutral', hint: L(`${donePct}%`, `${donePct}%`) },
        { label: L('Toʻliq kunlar', 'Закрытых дней'), value: String(closedDays.length), tone: 'neutral', hint: days.some((d) => d.partial) ? L('+ bugun jarayonda', '+ сегодня в процессе') : undefined },
        ...(best ? [{ label: L('Eng yaxshi kun', 'Лучший день'), value: `${best.score}%`, tone: best.tone, hint: L(best.date, best.date) }] : []),
        ...(worst && worst !== best ? [{ label: L('Eng past kun', 'Худший день'), value: `${worst.score}%`, tone: worst.tone, hint: L(worst.date, worst.date) }] : []),
      ];
      base.bars = Object.entries(byBlock)
        .map(([name, v]) => {
          const pct = v.total ? Math.round((v.done / v.total) * 100) : 0;
          return { name, done: v.done, total: v.total, pct, tone: pctTone(pct) };
        })
        .sort((x, y) => x.pct - y.pct);
      base.missed = Object.entries(missed)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 8)
        .map(([title, count]) => ({ title, count }));
      if (!opts?.branchId) {
        const byBranch: Record<string, number[]> = {};
        for (const sc of scores) {
          if (!sc.branchId) continue;
          const d = sc.date.toISOString().slice(0, 10);
          if (d === today && closedDays.length) continue;
          const name = branchName.get(sc.branchId) || sc.branchId;
          (byBranch[name] ||= []).push(sc.totalScore);
        }
        base.branches = Object.entries(byBranch)
          .map(([name, xs]) => ({ name, avg: avgOf(xs), days: xs.length, tone: scoreTone(avgOf(xs)) }))
          .sort((x, y) => x.avg - y.avg);
      }
    }

    const ai = await writeAiPart(base);
    const full: AiReportV2 = { ...base, ai: ai || rulesAiPart(base), aiSource: ai ? 'ai' : 'rules' };
    const content = JSON.stringify(full);

    const reportType = type === 'CALLS' ? 'CALLS' : 'SERVICES';
    const scopeBranch = base.branch ? opts?.branchId || '' : '';
    const existing = await this.prisma.aiWeeklyReport.findFirst({
      where: { weekStart: start, type: reportType as any, period, kind: type, branchId: scopeBranch },
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
            kind: type,
            branchId: scopeBranch,
            content,
          },
        });

    await this.notifications.createForRoles(
      ['MANAGER', 'ADMIN', 'SUPER_ADMIN'],
      `AI: ${periodLabel} hisobot`,
      reportPreview(full, periodLabel),
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
