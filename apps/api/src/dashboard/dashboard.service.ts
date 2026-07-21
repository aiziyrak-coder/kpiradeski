import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toDateOnly } from '../common/kpi.constants';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async overview(dateStr?: string, opts?: { userId?: string; role?: Role; branchId?: string }) {
    const date = toDateOnly(dateStr);
    let branchFilter: string[] | undefined;

    if (opts?.branchId) {
      branchFilter = [opts.branchId];
    } else if (opts?.role === Role.MANAGER && opts.userId) {
      const links = await this.prisma.branchManager.findMany({
        where: { userId: opts.userId },
        select: { branchId: true },
      });
      branchFilter = links.map((l) => l.branchId);
    }

    const branchWhere = branchFilter?.length
      ? { branchId: { in: branchFilter } }
      : { branchId: { not: null } };

    const todayScores = await this.prisma.dailyScore.findMany({
      where: { date, ...branchWhere },
      include: { branch: { select: { id: true, name: true } } },
    });

    const today =
      todayScores.length === 1
        ? todayScores[0]
        : todayScores.length > 1
          ? {
              date,
              totalScore:
                Math.round(
                  (todayScores.reduce((s, x) => s + x.totalScore, 0) / todayScores.length) * 10,
                ) / 10,
              blockScores: todayScores[0]?.blockScores || {},
              completion: todayScores[0]?.completion || null,
              colorStatus: todayScores[0]?.colorStatus || 'yellow',
              branches: todayScores.map((s) => ({
                branchId: s.branchId,
                name: s.branch?.name,
                totalScore: s.totalScore,
              })),
            }
          : null;

    const from30 = new Date(date);
    from30.setUTCDate(from30.getUTCDate() - 29);

    const historyRaw = await this.prisma.dailyScore.findMany({
      where: { date: { gte: from30, lte: date }, ...branchWhere },
      orderBy: { date: 'asc' },
    });

    // Aggregate by date
    const byDate = new Map<string, number[]>();
    for (const h of historyRaw) {
      const k = h.date.toISOString().slice(0, 10);
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k)!.push(h.totalScore);
    }
    const history = [...byDate.entries()].map(([d, scores]) => ({
      date: d,
      totalScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    }));

    const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    const monthScores = await this.prisma.dailyScore.findMany({
      where: { date: { gte: monthStart, lte: monthEnd }, ...branchWhere },
      orderBy: { date: 'asc' },
    });

    const avg30 =
      history.length > 0
        ? Math.round((history.reduce((s, h) => s + h.totalScore, 0) / history.length) * 10) / 10
        : 0;

    const branches = await this.prisma.branch.findMany({
      where: {
        active: true,
        ...(branchFilter ? { id: { in: branchFilter } } : {}),
      },
      include: {
        managers: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    const latestAi = await this.prisma.aiWeeklyReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    return {
      date: date.toISOString().slice(0, 10),
      today,
      avg30,
      history,
      heatmap: monthScores.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        score: s.totalScore,
        color: s.colorStatus,
        branchId: s.branchId,
      })),
      branchScores: todayScores,
      branches,
      latestAi,
      completion: (today as any)?.completion || null,
      alerts: {},
    };
  }
}
