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

    const avg30 =
      history.length > 0
        ? Math.round((history.reduce((s, h) => s + h.totalScore, 0) / history.length) * 10) / 10
        : 0;

    const completion = (today?.completion as any) || null;

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
      completion,
      alerts: {},
    };
  }
}
