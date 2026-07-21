import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../kpi/scoring.service';
import { toDateOnly } from '../common/kpi.constants';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
  ) {}

  async overview(dateStr?: string) {
    const date = toDateOnly(dateStr);
    const today = await this.scoring.recalculateDailyScore(date).then(async () =>
      this.prisma.dailyScore.findUnique({ where: { date } }),
    );

    const from30 = new Date(date);
    from30.setUTCDate(from30.getUTCDate() - 29);

    const history = await this.prisma.dailyScore.findMany({
      where: { date: { gte: from30, lte: date } },
      orderBy: { date: 'asc' },
    });

    const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    const monthScores = await this.prisma.dailyScore.findMany({
      where: { date: { gte: monthStart, lte: monthEnd } },
      orderBy: { date: 'asc' },
    });

    const calls = await this.prisma.callEntry.findMany({ where: { date } });
    const funnel = {
      new: calls.find((c) => c.type === 'NEW') || null,
      repeat: calls.find((c) => c.type === 'REPEAT') || null,
      missed: calls.find((c) => c.type === 'MISSED') || null,
    };

    const social = await this.prisma.socialStats.findMany({
      where: { date: { gte: from30, lte: date } },
      orderBy: { date: 'asc' },
    });

    const latestAi = await this.prisma.aiWeeklyReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    const doctors = await this.prisma.doctor.findMany({
      where: { active: true },
      include: {
        stories: { where: { date: { gte: from30, lte: date } } },
        referrals: { orderBy: { weekStart: 'desc' }, take: 4 },
      },
    });

    const doctorRanking = doctors
      .map((d) => ({
        id: d.id,
        name: d.name,
        storiesPosted: d.stories.filter((s) => s.posted).length,
        storiesTotal: d.stories.length,
        referrals: d.referrals.reduce((s, r) => s + r.patientsCount, 0),
      }))
      .sort((a, b) => b.storiesPosted + b.referrals - (a.storiesPosted + a.referrals));

    const avg30 =
      history.length > 0
        ? Math.round((history.reduce((s, h) => s + h.totalScore, 0) / history.length) * 10) / 10
        : 0;

    const blocks = (today?.blockScores as Record<string, any>) || {};
    const completion = (today?.completion as any) || null;
    const lowStock = await this.prisma.warehouseProduct.findMany();
    const lowStockItems = lowStock.filter((p) => p.currentStock <= p.minStock);

    return {
      date: date.toISOString().slice(0, 10),
      today,
      avg30,
      history,
      heatmap: monthScores.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        score: s.totalScore,
        color: s.colorStatus,
      })),
      funnel,
      social,
      latestAi,
      doctorRanking,
      completion,
      alerts: {
        lowStock: lowStockItems.map((p) => ({
          id: p.id,
          name: p.name,
          currentStock: p.currentStock,
          minStock: p.minStock,
        })),
      },
    };
  }
}
