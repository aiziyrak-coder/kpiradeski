import { Injectable } from '@nestjs/common';
import { CallType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CLINIC_ITEMS,
  RECEPTION_ITEMS,
  UNIFORM_ITEMS,
  colorStatus,
  pct,
  startOfWeek,
  toDateOnly,
} from '../common/kpi.constants';

/** Majburiy kunlik bloklar — menejer ishi (ombor/shifokor yoʻq) */
const REQUIRED_DAILY = ['clinic', 'reception', 'calls', 'uniform'] as const;
/** Ixtiyoriy — yo'q bo'lsa o'rtachaga kirmaydi */
const OPTIONAL = ['reviews', 'smm', 'marketing'] as const;

@Injectable()
export class ScoringService {
  constructor(private prisma: PrismaService) {}

  checklistPct(items: Record<string, boolean>, keys: readonly { key: string }[]) {
    const done = keys.filter((k) => items[k.key] === true).length;
    return pct(done, keys.length);
  }

  private scoreLocks = new Map<string, Promise<unknown>>();

  async recalculateDailyScore(dateInput?: string | Date) {
    const date = toDateOnly(dateInput);
    const key = date.toISOString().slice(0, 10);
    const prev = this.scoreLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const chained = prev.then(() => gate);
    this.scoreLocks.set(key, chained);
    await prev;
    try {
      return await this.recalculateDailyScoreUnlocked(date);
    } finally {
      release();
      if (this.scoreLocks.get(key) === chained) this.scoreLocks.delete(key);
    }
  }

  private async recalculateDailyScoreUnlocked(date: Date) {
    const weekday = date.getUTCDay();
    const setting = await this.prisma.appSetting.findUnique({ where: { key: 'rest_weekdays' } });
    const restWeekdays = Array.isArray(setting?.value)
      ? (setting!.value as number[])
      : [0, 6];
    const holiday = await this.prisma.holiday.findUnique({ where: { date } });
    if (restWeekdays.includes(weekday) || holiday) {
      const branch = await this.prisma.branch.findFirst({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!branch) {
        return {
          date,
          totalScore: 0,
          blockScores: {},
          colorStatus: 'rest',
          completion: { restDay: true },
        };
      }
      return this.prisma.dailyScore.upsert({
        where: { branchId_date: { branchId: branch.id, date } },
        create: {
          branchId: branch.id,
          date,
          totalScore: 0,
          blockScores: {},
          completion: {
            restDay: true,
            reason: holiday?.title || 'Dam olish kuni',
            requiredPct: 100,
            requiredFilled: 0,
            requiredTotal: 0,
            incomplete: [],
            filled: {},
            allFilledKeys: [],
          },
          colorStatus: 'rest',
        },
        update: {
          totalScore: 0,
          blockScores: {},
          completion: {
            restDay: true,
            reason: holiday?.title || 'Dam olish kuni',
            requiredPct: 100,
            requiredFilled: 0,
            requiredTotal: 0,
            incomplete: [],
            filled: {},
            allFilledKeys: [],
          },
          colorStatus: 'rest',
        },
      });
    }

    const weekStart = startOfWeek(date);
    const weights = await this.prisma.kpiWeight.findMany();
    const weightMap = Object.fromEntries(weights.map((w) => [w.blockKey, w.weight]));

    const [
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
      referrals,
      mystery,
      bloggers,
      products,
    ] = await Promise.all([
      this.prisma.dailyClinicCheck.findUnique({ where: { date } }),
      this.prisma.receptionCheck.findUnique({ where: { date } }),
      this.prisma.uniformCheck.findUnique({ where: { date } }),
      this.prisma.warehouseCheck.findUnique({ where: { date } }),
      this.prisma.callEntry.findMany({ where: { date } }),
      this.prisma.review.findMany({ where: { date } }),
      this.prisma.seoCheck.findUnique({ where: { date } }),
      this.prisma.socialStats.findMany({ where: { date } }),
      this.prisma.adsCheck.findUnique({ where: { date } }),
      this.prisma.flyerEntry.findMany({ where: { date } }),
      this.prisma.doctorStory.findMany({ where: { date } }),
      this.prisma.doctorReferral.findMany({ where: { weekStart } }),
      this.prisma.mysteryPatientTest.findFirst({
        where: { date },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bloggerEntry.findMany({ where: { weekStart } }),
      this.prisma.warehouseProduct.findMany({ select: { currentStock: true, minStock: true } }),
    ]);

    const lowStockCount = products.filter((p) => p.currentStock <= p.minStock).length;

    const filled: Record<string, boolean> = {
      clinic: !!clinic,
      reception: !!reception,
      uniform: !!uniform,
      warehouse: !!warehouse,
      calls: calls.length > 0,
      reviews: reviews.length > 0,
      smm: !!seo || social.length > 0,
      marketing: !!ads || flyers.length > 0 || bloggers.length > 0,
      doctors: stories.length > 0 || referrals.length > 0 || !!mystery,
    };

    // --- block scores (null = optional empty) ---
    let clinicPct: number | null = clinic ? clinic.percentage : null;
    let receptionPct: number | null = reception ? reception.percentage : null;
    let uniformPct: number | null = uniform ? uniform.percentage : null;
    let warehousePct: number | null = warehouse ? warehouse.percentage : null;
    if (warehouse && lowStockCount > 0) {
      warehousePct = Math.max(0, Math.round((warehouse.percentage - Math.min(30, lowStockCount * 10)) * 10) / 10);
    }

    let callsPct: number | null = null;
    if (calls.length) {
      const byType = Object.fromEntries(calls.map((c) => [c.type, c]));
      const scores: number[] = [];
      const neu = byType[CallType.NEW];
      if (neu) {
        const conv = neu.callsCount ? pct(neu.bookedCount, neu.callsCount) : 0;
        const target = Math.min(100, (neu.callsCount / 100) * 100);
        scores.push(target * 0.4 + conv * 0.6);
      }
      const rep = byType[CallType.REPEAT];
      if (rep) scores.push(rep.callsCount ? pct(rep.bookedCount, rep.callsCount) : 0);
      const miss = byType[CallType.MISSED];
      if (miss) {
        const denom = miss.recalledCount || 0;
        scores.push(denom ? pct(miss.bookedCount, denom) : 0);
      }
      callsPct = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    }

    let reviewsPct: number | null = null;
    if (reviews.length) {
      const total = reviews.reduce((s, r) => s + r.count, 0);
      const positive = reviews.filter((r) => r.quality === 'POSITIVE').reduce((s, r) => s + r.count, 0);
      reviewsPct = total ? pct(positive, total) : 0;
    }

    let smmPct: number | null = null;
    {
      const parts: number[] = [];
      if (seo) {
        const seoDone = [seo.newArticle, seo.newVideo, seo.newReviews, seo.pageUpdated, seo.seoOk].filter(Boolean).length;
        let seoScore = pct(seoDone, 5);
        if (seo.pagespeedScore != null) seoScore = (seoScore + seo.pagespeedScore) / 2;
        parts.push(seoScore);
      }
      if (social.length) {
        const activity = social.reduce((s, p) => s + p.posts + p.stories + p.reels, 0);
        parts.push(Math.min(100, activity * 20));
      }
      if (parts.length) smmPct = parts.reduce((a, b) => a + b, 0) / parts.length;
    }

    let marketingPct: number | null = null;
    {
      const parts: number[] = [];
      if (ads) parts.push(ads.aired ? 100 : 20);
      if (flyers.length) {
        const total = flyers.reduce((s, f) => s + f.count, 0);
        parts.push(Math.min(100, total > 0 ? 70 + Math.min(30, total / 20) : 0));
      }
      if (bloggers.length) parts.push(Math.min(100, 50 + bloggers.length * 15));
      if (parts.length) marketingPct = parts.reduce((a, b) => a + b, 0) / parts.length;
    }

    let doctorsPct: number | null = null;
    {
      const parts: number[] = [];
      if (stories.length) {
        const posted = stories.filter((s) => s.posted).length;
        parts.push(pct(posted, stories.length));
      }
      if (referrals.length) {
        const totalRef = referrals.reduce((s, r) => s + r.patientsCount, 0);
        parts.push(Math.min(100, totalRef * 8));
      }
      if (mystery) parts.push(mystery.booked ? 100 : 35);
      if (parts.length) doctorsPct = parts.reduce((a, b) => a + b, 0) / parts.length;
    }

    const raw: Record<string, number | null> = {
      clinic: clinicPct,
      reception: receptionPct,
      calls: callsPct,
      reviews: reviewsPct,
      uniform: uniformPct,
      warehouse: warehousePct,
      smm: smmPct,
      marketing: marketingPct,
      doctors: doctorsPct,
    };

    const blockScores: Record<string, number> = {};
    let totalWeight = 0;
    let weighted = 0;

    // Majburiy: yo'q bo'lsa 0%
    for (const key of REQUIRED_DAILY) {
      const w = weightMap[key] ?? 0;
      if (w <= 0) continue;
      const score = raw[key] == null ? 0 : Math.round(raw[key]! * 10) / 10;
      blockScores[key] = score;
      weighted += score * w;
      totalWeight += w;
    }

    // Ixtiyoriy: faqat to'ldirilganlari
    for (const key of OPTIONAL) {
      if (raw[key] == null) continue;
      const w = weightMap[key] ?? 0;
      if (w <= 0) continue;
      const score = Math.round(raw[key]! * 10) / 10;
      blockScores[key] = score;
      weighted += score * w;
      totalWeight += w;
    }

    const totalScore = totalWeight ? Math.round((weighted / totalWeight) * 10) / 10 : 0;
    const status = colorStatus(totalScore);

    const requiredFilled = REQUIRED_DAILY.filter((k) => filled[k]).length;
    const completion = {
      filled,
      requiredFilled,
      requiredTotal: REQUIRED_DAILY.length,
      requiredPct: pct(requiredFilled, REQUIRED_DAILY.length),
      incomplete: REQUIRED_DAILY.filter((k) => !filled[k]),
      allFilledKeys: Object.keys(filled).filter((k) => filled[k]),
    };

    const branch = await this.prisma.branch.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) {
      return { date, totalScore, blockScores, colorStatus: status, completion };
    }

    await this.prisma.dailyScore.upsert({
      where: { branchId_date: { branchId: branch.id, date } },
      create: {
        branchId: branch.id,
        date,
        totalScore,
        blockScores: blockScores as Prisma.InputJsonValue,
        completion: completion as Prisma.InputJsonValue,
        colorStatus: status,
      },
      update: {
        totalScore,
        blockScores: blockScores as Prisma.InputJsonValue,
        completion: completion as Prisma.InputJsonValue,
        colorStatus: status,
      },
    });

    return { date, totalScore, blockScores, colorStatus: status, completion };
  }
}

export { CLINIC_ITEMS, RECEPTION_ITEMS, UNIFORM_ITEMS };
