import { Injectable } from '@nestjs/common';
import { KpiFrequency, KpiInputType, Role } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../prisma/prisma.service';
import { toDateOnly } from '../common/kpi.constants';
import { evalTaskWindow } from '../common/task-window';

type AnalyticsOpts = {
  from: string;
  to: string;
  branchId?: string;
  frequency?: KpiFrequency;
  user?: { id: string; role: Role };
};

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private fontPath() {
    const candidates = [
      path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf'),
      path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'),
      path.join(__dirname, '..', '..', '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'),
    ];
    return candidates.find((p) => fs.existsSync(p));
  }

  private async scopeBranchIds(user?: { id: string; role: Role }, branchId?: string) {
    if (branchId) return [branchId];
    if (!user) return null;
    if (user.role === Role.MANAGER) {
      const links = await this.prisma.branchManager.findMany({
        where: { userId: user.id },
        select: { branchId: true },
      });
      return links.map((l) => l.branchId);
    }
    return null; // all branches
  }

  async getRange(from: string, to: string, branchId?: string) {
    const start = toDateOnly(from);
    const end = toDateOnly(to);
    const scores = await this.prisma.dailyScore.findMany({
      where: {
        date: { gte: start, lte: end },
        frequency: 'DAILY',
        ...(branchId ? { branchId } : { branchId: { not: null } }),
      },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { date: 'asc' },
    });
    const avg = scores.length
      ? Math.round((scores.reduce((s, x) => s + x.totalScore, 0) / scores.length) * 10) / 10
      : 0;
    return { from, to, avg, scores };
  }

  async analytics(opts: AnalyticsOpts) {
    const start = toDateOnly(opts.from);
    const end = toDateOnly(opts.to);
    const freq = opts.frequency || KpiFrequency.DAILY;
    const scoped = await this.scopeBranchIds(opts.user, opts.branchId);
    const branchWhere =
      scoped === null
        ? { active: true }
        : { id: { in: scoped.length ? scoped : ['__none__'] }, active: true };

    const branches = await this.prisma.branch.findMany({
      where: branchWhere,
      include: {
        managers: {
          include: {
            user: { select: { id: true, name: true, email: true, active: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    const branchIds = branches.map((b) => b.id);

    const [scores, entries, assignments, catalog] = await Promise.all([
      this.prisma.dailyScore.findMany({
        where: {
          date: { gte: start, lte: end },
          frequency: freq === KpiFrequency.DAILY ? 'DAILY' : freq,
          branchId: { in: branchIds },
        },
        include: { branch: { select: { id: true, name: true } } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.kpiDayEntry.findMany({
        where: {
          date: { gte: start, lte: end },
          branchId: { in: branchIds },
        },
        include: {
          proofs: { orderBy: { createdAt: 'desc' }, take: 1 },
          user: { select: { id: true, name: true, email: true, role: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      this.prisma.kpiAssignmentTemplate.findMany({
        where: { branchId: { in: branchIds }, frequency: freq, active: true },
      }),
      this.prisma.kpiCatalogNode.findMany({
        where: { active: true, frequency: freq, inputType: { not: KpiInputType.GROUP } },
        select: {
          key: true,
          titleUz: true,
          titleRu: true,
          parentKey: true,
          windowStartMin: true,
          windowEndMin: true,
        },
      }),
    ]);

    // Filter entries to assigned keys for this frequency (approximate: node in catalog for freq)
    const catalogKeys = new Set(catalog.map((c) => c.key));
    const titleOf = Object.fromEntries(catalog.map((c) => [c.key, { uz: c.titleUz, ru: c.titleRu }]));
    const assignedByBranch = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (!assignedByBranch.has(a.branchId)) assignedByBranch.set(a.branchId, new Set());
      assignedByBranch.get(a.branchId)!.add(a.nodeKey);
    }

    const freqEntries = entries.filter((e) => {
      if (!catalogKeys.has(e.nodeKey)) return false;
      const assigned = assignedByBranch.get(e.branchId);
      return assigned ? assigned.has(e.nodeKey) : false;
    });

    // —— Summary
    const workingScores = scores.filter(
      (s) => s.colorStatus !== 'rest' && !(s.completion as any)?.restDay,
    );
    const avgScore = workingScores.length
      ? Math.round(
          (workingScores.reduce((s, x) => s + x.totalScore, 0) / workingScores.length) * 10,
        ) / 10
      : 0;
    const best = workingScores.length
      ? workingScores.reduce((a, b) => (a.totalScore >= b.totalScore ? a : b))
      : null;
    const worst = workingScores.length
      ? workingScores.reduce((a, b) => (a.totalScore <= b.totalScore ? a : b))
      : null;
    const statusCount = { green: 0, yellow: 0, red: 0, rest: 0, other: 0 };
    for (const s of scores) {
      if (s.colorStatus === 'green') statusCount.green++;
      else if (s.colorStatus === 'yellow') statusCount.yellow++;
      else if (s.colorStatus === 'red') statusCount.red++;
      else if (s.colorStatus === 'rest') statusCount.rest++;
      else statusCount.other++;
    }

    let proofApproved = 0;
    let proofPending = 0;
    let proofRejected = 0;
    for (const e of freqEntries) {
      const p = e.proofs[0];
      if (!p) continue;
      if (p.aiStatus === 'APPROVED') proofApproved++;
      else if (p.aiStatus === 'PENDING') proofPending++;
      else if (p.aiStatus === 'REJECTED') proofRejected++;
    }
    const proofTotal = proofApproved + proofPending + proofRejected;

    // —— By branch (bajarilish = done / assigned×davr, 100% fake emas)
    const byBranch = branches.map((b) => {
      const bScores = workingScores.filter((s) => s.branchId === b.id);
      const bEntries = freqEntries.filter((e) => e.branchId === b.id);
      const assigned = assignedByBranch.get(b.id)?.size || 0;
      const done = bEntries.filter((e) => e.done).length;
      const dayCount =
        freq === KpiFrequency.DAILY
          ? Math.max(1, bScores.length || (opts.from === opts.to ? 1 : 0))
          : 1;
      const expected = assigned > 0 ? assigned * dayCount : bEntries.length;
      const avg = bScores.length
        ? Math.round((bScores.reduce((s, x) => s + x.totalScore, 0) / bScores.length) * 10) / 10
        : 0;
      const latestScore = bScores.length ? bScores[bScores.length - 1].totalScore : null;
      return {
        branchId: b.id,
        name: b.name,
        avgScore: avg,
        score: latestScore ?? avg,
        days: bScores.length,
        entriesDone: Math.min(done, expected || done),
        entriesTotal: expected,
        assignedTasks: assigned,
        completionPct: expected
          ? Math.round((Math.min(done, expected) / expected) * 1000) / 10
          : 0,
        managers: b.managers
          .filter((m) => m.user?.active !== false)
          .map((m) => ({ id: m.userId, name: m.user?.name || m.userId })),
      };
    });
    byBranch.sort((a, b) => b.score - a.score || b.entriesDone - a.entriesDone);

    const totalEntries = byBranch.reduce((s, b) => s + b.entriesTotal, 0);
    const totalDone = byBranch.reduce((s, b) => s + b.entriesDone, 0);
    const completionPct = totalEntries
      ? Math.round((Math.min(totalDone, totalEntries) / totalEntries) * 1000) / 10
      : 0;

    const doneSet = new Set(
      freqEntries
        .filter((e) => e.done)
        .map((e) => `${e.branchId}|${e.date.toISOString().slice(0, 10)}|${e.nodeKey}`),
    );
    let missedOnTime = 0;
    const missedSamples: Array<{ title: string; branch: string; date: string }> = [];
    if (freq === KpiFrequency.DAILY) {
      const windowed = catalog.filter(
        (c) => c.windowStartMin != null && c.windowEndMin != null,
      );
      for (let t = start.getTime(); t <= end.getTime(); t += 24 * 3600 * 1000) {
        const dayISO = new Date(t).toISOString().slice(0, 10);
        for (const b of branches) {
          const assigned = assignedByBranch.get(b.id);
          if (!assigned?.size) continue;
          for (const node of windowed) {
            if (!assigned.has(node.key)) continue;
            const w = evalTaskWindow(node.windowStartMin, node.windowEndMin, {
              dateISO: dayISO,
            });
            if (w.status !== 'expired') continue;
            const k = `${b.id}|${dayISO}|${node.key}`;
            if (doneSet.has(k)) continue;
            missedOnTime += 1;
            if (missedSamples.length < 12) {
              missedSamples.push({ title: node.titleUz, branch: b.name, date: dayISO });
            }
          }
        }
      }
    }

    // —— By manager (filiallari boʻyicha: assigned vs done)
    const managerMap = new Map<
      string,
      {
        id: string;
        name: string;
        email: string;
        branches: Set<string>;
        done: number;
        total: number;
        scoreSum: number;
        scoreN: number;
        approved: number;
        rejected: number;
        pending: number;
      }
    >();
    for (const b of byBranch) {
      const branch = branches.find((x) => x.id === b.branchId);
      if (!branch) continue;
      for (const m of branch.managers) {
        if (!m.user || m.user.active === false) continue;
        if (!managerMap.has(m.userId)) {
          managerMap.set(m.userId, {
            id: m.userId,
            name: m.user.name,
            email: m.user.email,
            branches: new Set(),
            done: 0,
            total: 0,
            scoreSum: 0,
            scoreN: 0,
            approved: 0,
            rejected: 0,
            pending: 0,
          });
        }
        const row = managerMap.get(m.userId)!;
        row.branches.add(b.name);
        row.done += b.entriesDone;
        row.total += b.entriesTotal;
        if (b.avgScore > 0) {
          row.scoreSum += b.avgScore;
          row.scoreN++;
        }
      }
    }
    for (const e of freqEntries) {
      const managers = branches.find((b) => b.id === e.branchId)?.managers || [];
      for (const m of managers) {
        const row = managerMap.get(m.userId);
        if (!row) continue;
        const p = e.proofs[0];
        if (p?.aiStatus === 'APPROVED') row.approved++;
        else if (p?.aiStatus === 'REJECTED') row.rejected++;
        else if (p?.aiStatus === 'PENDING') row.pending++;
      }
    }
    const byManager = [...managerMap.values()]
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        branches: [...m.branches].filter(Boolean),
        done: m.done,
        total: m.total,
        completionPct: m.total ? Math.round((Math.min(m.done, m.total) / m.total) * 1000) / 10 : 0,
        avgTaskScore: m.scoreN ? Math.round((m.scoreSum / m.scoreN) * 10) / 10 : 0,
        proofsApproved: m.approved,
        proofsRejected: m.rejected,
        proofsPending: m.pending,
      }))
      .sort((a, b) => b.completionPct - a.completionPct || b.done - a.done);

    // —— By category (faqat dashKey — clinic, reception, …; _w/_m dublikatsiyasiz)
    const blockOf = (key: string) => {
      const root = key.split('.')[0] || key;
      return root.replace(/_w$/, '').replace(/_m$/, '');
    };
    const blockAgg = new Map<string, { sum: number; n: number; done: number; total: number }>();
    for (const s of workingScores) {
      const blocks = (s.blockScores as Record<string, number>) || {};
      for (const [k, v] of Object.entries(blocks)) {
        if (typeof v !== 'number') continue;
        // Faqat oddiy blok kalitlari (clinic, smm…) — root_w dublikatini o‘tkazib yuboramiz
        if (k.includes('.') || k.endsWith('_w') || k.endsWith('_m') || k.startsWith('_')) continue;
        const bk = blockOf(k);
        if (!blockAgg.has(bk)) blockAgg.set(bk, { sum: 0, n: 0, done: 0, total: 0 });
        const row = blockAgg.get(bk)!;
        row.sum += v;
        row.n++;
      }
    }
    for (const e of freqEntries) {
      const bk = blockOf(e.nodeKey);
      if (!blockAgg.has(bk)) blockAgg.set(bk, { sum: 0, n: 0, done: 0, total: 0 });
      const row = blockAgg.get(bk)!;
      row.total++;
      if (e.done) row.done++;
    }
    const byCategory = [...blockAgg.entries()]
      .map(([key, v]) => ({
        key,
        avgScore: v.n ? Math.round((v.sum / v.n) * 10) / 10 : 0,
        completionPct: v.total ? Math.round((v.done / v.total) * 1000) / 10 : 0,
        done: v.done,
        total: v.total,
      }))
      .filter((x) => x.total > 0 || x.avgScore > 0)
      .sort((a, b) => a.avgScore - b.avgScore);

    // —— Incomplete: faqat real ish kuni (DailyScore yozilgan) boʻyicha
    const entryDone = new Set(
      freqEntries
        .filter((e) => e.done)
        .map((e) => `${e.branchId}|${e.date.toISOString().slice(0, 10)}|${e.nodeKey}`),
    );
    const trackedDates = [
      ...new Set(
        workingScores
          .filter((s) => !(s.completion as any)?.restDay)
          .map((s) => s.date.toISOString().slice(0, 10)),
      ),
    ];
    const dates: string[] = trackedDates.length ? trackedDates : [];

    const missMap = new Map<
      string,
      { nodeKey: string; miss: number; opportunities: number; branches: Set<string> }
    >();
    for (const b of branches) {
      const assigned = assignedByBranch.get(b.id);
      if (!assigned?.size) continue;
      for (const nodeKey of assigned) {
        if (!catalogKeys.has(nodeKey)) continue;
        if (!missMap.has(nodeKey)) {
          missMap.set(nodeKey, {
            nodeKey,
            miss: 0,
            opportunities: 0,
            branches: new Set(),
          });
        }
        const row = missMap.get(nodeKey)!;
        for (const d of dates) {
          // Faqat shu filialda shu kunda real score boʻlsa opportunity
          const dayTracked = workingScores.some(
            (s) =>
              s.branchId === b.id &&
              s.date.toISOString().slice(0, 10) === d &&
              !(s.completion as any)?.restDay,
          );
          if (!dayTracked) continue;
          row.opportunities++;
          const k = `${b.id}|${d}|${nodeKey}`;
          if (!entryDone.has(k)) {
            row.miss++;
            row.branches.add(b.name);
          }
        }
      }
    }
    const incompleteTasks = [...missMap.values()]
      .map((r) => ({
        nodeKey: r.nodeKey,
        titleUz: titleOf[r.nodeKey]?.uz || r.nodeKey,
        titleRu: titleOf[r.nodeKey]?.ru || r.nodeKey,
        missed: r.miss,
        opportunities: r.opportunities,
        missPct: r.opportunities
          ? Math.round((r.miss / r.opportunities) * 1000) / 10
          : 0,
        branches: [...r.branches],
      }))
      .filter((r) => r.missed > 0)
      .sort((a, b) => b.missPct - a.missPct || b.missed - a.missed)
      .slice(0, 25);

    // —— Trend: aggregate by date (avg across branches)
    const trendMap = new Map<string, number[]>();
    for (const s of workingScores) {
      const d = s.date.toISOString().slice(0, 10);
      if (!trendMap.has(d)) trendMap.set(d, []);
      trendMap.get(d)!.push(s.totalScore);
    }
    const trend = [...trendMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, vals]) => ({
        date,
        score: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      }));

    // Branch trends for multi-line (top 5 branches)
    const topBranchIds = byBranch.slice(0, 5).map((b) => b.branchId);
    const branchTrend: Record<string, Array<{ date: string; score: number }>> = {};
    for (const id of topBranchIds) {
      const name = branches.find((b) => b.id === id)?.name || id;
      branchTrend[name] = workingScores
        .filter((s) => s.branchId === id)
        .map((s) => ({
          date: s.date.toISOString().slice(0, 10),
          score: s.totalScore,
        }));
    }

    return {
      from: opts.from,
      to: opts.to,
      frequency: freq,
      summary: {
        avgScore,
        bestScore: best?.totalScore ?? null,
        bestDate: best ? best.date.toISOString().slice(0, 10) : null,
        bestBranch: best?.branch?.name ?? null,
        worstScore: worst?.totalScore ?? null,
        worstDate: worst ? worst.date.toISOString().slice(0, 10) : null,
        worstBranch: worst?.branch?.name ?? null,
        daysTracked: workingScores.length,
        branches: branches.length,
        managers: byManager.length,
        completionPct,
        entriesDone: totalDone,
        entriesTotal: totalEntries,
        missedOnTime,
        missedOnTimeSamples: missedSamples,
        statusCount,
        proofs: {
          approved: proofApproved,
          pending: proofPending,
          rejected: proofRejected,
          total: proofTotal,
          approveRate: proofTotal
            ? Math.round((proofApproved / proofTotal) * 1000) / 10
            : 0,
        },
        daySpan: Math.max(
          1,
          Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1,
        ),
      },
      trend,
      branchTrend,
      byBranch,
      byManager,
      byCategory,
      incompleteTasks,
      statusPie: [
        { name: 'green', value: statusCount.green },
        { name: 'yellow', value: statusCount.yellow },
        { name: 'red', value: statusCount.red },
      ].filter((x) => x.value > 0),
    };
  }

  async excel(from: string, to: string, branchId?: string): Promise<Buffer> {
    const data = await this.getRange(from, to, branchId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Radeski KPI';
    const ws = wb.addWorksheet('KPI Hisobot');
    ws.columns = [
      { header: 'Sana', key: 'date', width: 14 },
      { header: 'Filial', key: 'branch', width: 22 },
      { header: 'Umumiy ball', key: 'score', width: 14 },
      { header: 'Holat', key: 'color', width: 12 },
      { header: 'Klinika', key: 'clinic', width: 10 },
      { header: 'Administrator', key: 'reception', width: 14 },
      { header: 'Sharhlar', key: 'reviews', width: 10 },
      { header: 'Uniforma', key: 'uniform', width: 10 },
      { header: 'SMM', key: 'smm', width: 10 },
      { header: 'Marketing', key: 'marketing', width: 12 },
      { header: "To'ldirilgan", key: 'required', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const s of data.scores) {
      const blocks = (s.blockScores as Record<string, any>) || {};
      const completion = (s.completion as any) || null;
      ws.addRow({
        date: s.date.toISOString().slice(0, 10),
        branch: (s as any).branch?.name || '',
        score: s.totalScore,
        color: s.colorStatus,
        clinic: blocks.clinic ?? '',
        reception: blocks.reception ?? '',
        reviews: blocks.reviews ?? '',
        uniform: blocks.uniform ?? '',
        smm: blocks.smm ?? '',
        marketing: blocks.marketing ?? '',
        required: completion ? `${completion.requiredFilled}/${completion.requiredTotal}` : '',
      });
    }
    ws.addRow({});
    ws.addRow({ date: "O'rtacha", score: data.avg });

    const analytics = await this.analytics({ from, to, branchId, frequency: KpiFrequency.DAILY });
    const missed = analytics.summary?.missedOnTime ?? 0;
    const samples = analytics.summary?.missedOnTimeSamples || [];
    const ws2 = wb.addWorksheet('Vaqtida yopilmagan');
    ws2.columns = [
      { header: 'Sana', key: 'date', width: 14 },
      { header: 'Filial', key: 'branch', width: 22 },
      { header: 'Ish', key: 'title', width: 50 },
    ];
    ws2.getRow(1).font = { bold: true };
    ws2.addRow({ date: 'Jami', title: String(missed) });
    for (const x of samples) {
      ws2.addRow({ date: x.date, branch: x.branch, title: x.title });
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async pdf(from: string, to: string, branchId?: string): Promise<Buffer> {
    const data = await this.getRange(from, to, branchId);
    const analytics = await this.analytics({ from, to, branchId, frequency: KpiFrequency.DAILY });
    const font = this.fontPath();
    const missed = analytics.summary?.missedOnTime ?? 0;
    const samples = analytics.summary?.missedOnTimeSamples || [];

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      if (font) {
        doc.registerFont('Noto', font);
        doc.font('Noto');
      }

      doc.fontSize(20).text('Radeski KPI Hisobot', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Davr: ${from} — ${to}`);
      doc.text(`O'rtacha ball: ${data.avg}%`);
      doc.text(`Yozuvlar: ${data.scores.length}`);
      doc.text(`Vaqtida yopilmagan: ${missed}`);
      doc.moveDown();
      doc.fontSize(11).text("Kunlik natijalar:", { underline: true });
      doc.moveDown(0.5);

      for (const s of data.scores) {
        const branch = (s as any).branch?.name ? ` | ${(s as any).branch.name}` : '';
        doc.fontSize(10).text(
          `${s.date.toISOString().slice(0, 10)}${branch}  |  ${s.totalScore}%  |  ${s.colorStatus}`,
        );
      }

      if (samples.length) {
        doc.moveDown();
        doc.fontSize(11).fillColor('#000').text('Vaqtida yopilmagan ishlar:', { underline: true });
        doc.moveDown(0.5);
        for (const x of samples) {
          doc.fontSize(10).text(`${x.date} | ${x.branch} | ${x.title}`);
        }
      }

      doc.moveDown();
      doc.fontSize(9).fillColor('#666').text('Radeski KPI', { align: 'center' });
      doc.end();
    });
  }
}
