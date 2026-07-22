import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  AiAction,
  AiProofStatus,
  KpiFrequency,
  KpiInputType,
  NotificationType,
  Role,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';
import { openaiVisionProof } from '../common/openai';
import { colorStatus, toDateOnly } from '../common/kpi.constants';
import { seedKpiCatalog } from '../../prisma/seed-catalog';

type CatalogNode = {
  key: string;
  parentKey: string | null;
  titleUz: string;
  titleRu: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  inputType: KpiInputType;
  frequency: KpiFrequency;
  weight: number;
  sortOrder: number;
  proofRequired: boolean;
  children?: CatalogNode[];
};

function periodDate(freq: KpiFrequency, dateStr?: string): Date {
  const d = toDateOnly(dateStr);
  if (freq === KpiFrequency.WEEKLY) {
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  }
  if (freq === KpiFrequency.MONTHLY) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }
  return d;
}

@Injectable()
export class ManagerKpiService implements OnModuleInit {
  private readonly logger = new Logger(ManagerKpiService.name);
  private uploadRoot = path.join(process.cwd(), 'uploads', 'kpi-proofs');

  constructor(
    private prisma: PrismaService,
    private branches: BranchesService,
  ) {}

  async onModuleInit() {
    fs.mkdirSync(this.uploadRoot, { recursive: true });
    try {
      await seedKpiCatalog(this.prisma as any);
      this.logger.log('KPI katalog sync');
      let branch = await this.prisma.branch.findFirst();
      if (!branch) {
        branch = await this.prisma.branch.create({
          data: { name: 'Radeski Dermatologiya', address: 'Toshkent' },
        });
      }
      const managers = await this.prisma.user.findMany({
        where: { role: Role.MANAGER, active: true },
      });
      for (const manager of managers) {
        await this.prisma.branchManager.upsert({
          where: { branchId_userId: { branchId: branch.id, userId: manager.id } },
          create: { branchId: branch.id, userId: manager.id },
          update: {},
        });
        if (!manager.branchId) {
          await this.prisma.user.update({
            where: { id: manager.id },
            data: { branchId: branch.id },
          });
        }
      }
    } catch (e) {
      this.logger.warn(`Catalog seed: ${e}`);
    }
  }

  async catalog(lang: 'uz' | 'ru' = 'uz', frequency?: KpiFrequency) {
    const all = await this.prisma.kpiCatalogNode.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });

    const map = new Map<string, CatalogNode>();
    for (const r of all) {
      map.set(r.key, {
        key: r.key,
        parentKey: r.parentKey,
        titleUz: r.titleUz,
        titleRu: r.titleRu,
        descriptionUz: r.descriptionUz,
        descriptionRu: r.descriptionRu,
        inputType: r.inputType,
        frequency: r.frequency,
        weight: r.weight,
        sortOrder: r.sortOrder,
        proofRequired: r.proofRequired,
        children: [],
      });
    }
    const roots: CatalogNode[] = [];
    for (const node of map.values()) {
      if (node.parentKey && map.has(node.parentKey)) {
        map.get(node.parentKey)!.children!.push(node);
      } else if (!node.parentKey) {
        roots.push(node);
      }
    }

    const filterFreq = (nodes: CatalogNode[]): CatalogNode[] => {
      if (!frequency) return nodes;
      return nodes
        .map((n) => {
          const kids = filterFreq(n.children || []);
          if (n.frequency === frequency || kids.length) {
            return { ...n, children: kids };
          }
          return null;
        })
        .filter(Boolean) as CatalogNode[];
    };

    const filtered = filterFreq(roots);
    const sortRec = (nodes: CatalogNode[]) => {
      nodes.sort((a, b) => a.sortOrder - b.sortOrder);
      nodes.forEach((n) => n.children && sortRec(n.children));
    };
    sortRec(filtered);

    const localize = (n: CatalogNode): any => ({
      key: n.key,
      parentKey: n.parentKey,
      title: lang === 'ru' ? n.titleRu : n.titleUz,
      titleUz: n.titleUz,
      titleRu: n.titleRu,
      description: lang === 'ru' ? n.descriptionRu : n.descriptionUz,
      inputType: n.inputType,
      frequency: n.frequency,
      weight: n.weight,
      sortOrder: n.sortOrder,
      proofRequired: n.proofRequired,
      children: (n.children || []).map(localize),
    });

    return filtered.map(localize);
  }

  async getDay(
    user: { id: string; role: Role },
    branchId: string,
    dateStr?: string,
    frequency: KpiFrequency = KpiFrequency.DAILY,
  ) {
    await this.branches.assertCanAccessBranch(user.id, user.role, branchId);
    const date = periodDate(frequency, dateStr);
    const allNodes = await this.prisma.kpiCatalogNode.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    const roots = allNodes.filter((c) => !c.parentKey && c.frequency === frequency);

    const entries = await this.prisma.kpiDayEntry.findMany({
      where: { branchId, date },
      include: {
        proofs: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            aiStatus: true,
            aiNote: true,
            aiFeedback: true,
            aiAction: true,
            aiPenalty: true,
            createdAt: true,
          },
        },
      },
    });
    const byKey = Object.fromEntries(entries.map((e) => [e.nodeKey, e]));
    const score = await this.recalculate(branchId, date, frequency);

    const tasks = roots.map((r) => {
      const entry = byKey[r.key];
      const proof = entry?.proofs?.[0];
      return {
        key: r.key,
        titleUz: r.titleUz,
        titleRu: r.titleRu,
        inputType: r.inputType,
        frequency: r.frequency,
        weight: r.weight,
        proofRequired: r.proofRequired,
        hasChildren: allNodes.some((n) => n.parentKey === r.key),
        entry: entry || null,
        score: entry?.score ?? null,
        done: entry?.done ?? false,
        aiStatus: proof?.aiStatus ?? null,
        aiNote: proof?.aiNote ?? null,
        aiFeedback: proof?.aiFeedback ?? null,
        aiAction: proof?.aiAction ?? null,
        aiPenalty: proof?.aiPenalty ?? 0,
      };
    });

    const buildTree = (parentKey: string | null): any[] => {
      const list = parentKey
        ? allNodes.filter((n) => n.parentKey === parentKey)
        : roots;
      return list.map((n) => {
        const entry = byKey[n.key];
        const proof = entry?.proofs?.[0];
        return {
          key: n.key,
          parentKey: n.parentKey,
          titleUz: n.titleUz,
          titleRu: n.titleRu,
          inputType: n.inputType,
          proofRequired: true,
          done: entry?.done ?? false,
          score: entry?.score ?? null,
          value: entry?.value ?? null,
          aiStatus: proof?.aiStatus ?? null,
          aiNote: proof?.aiNote ?? null,
          assigned: false,
          children: buildTree(n.key),
        };
      });
    };

    const assignments = await this.prisma.kpiTaskAssignment.findMany({
      where: { branchId, date, frequency, active: true },
    });
    const assignedKeys = new Set(assignments.map((a) => a.nodeKey));

    const markAssigned = (nodes: any[]): any[] =>
      nodes.map((n) => ({
        ...n,
        assigned: assignedKeys.has(n.key),
        children: markAssigned(n.children || []),
      }));

    const tree = markAssigned(buildTree(null));

    const leaves = allNodes.filter(
      (n) => n.frequency === frequency && n.inputType !== KpiInputType.GROUP,
    );
    const titleOf = (key: string) => {
      const parts: string[] = [];
      let cur = allNodes.find((n) => n.key === key);
      while (cur) {
        parts.unshift(cur.titleUz);
        cur = cur.parentKey ? allNodes.find((n) => n.key === cur!.parentKey) : undefined;
      }
      return {
        titleUz: parts[parts.length - 1] || key,
        titleRu:
          allNodes.find((n) => n.key === key)?.titleRu ||
          parts[parts.length - 1] ||
          key,
        sectionUz: parts.length > 1 ? parts[0] : '',
        sectionRu: (() => {
          const root = allNodes.find((n) => n.key === key);
          let p = root;
          while (p?.parentKey) p = allNodes.find((n) => n.key === p!.parentKey);
          return p?.titleRu || '';
        })(),
      };
    };

    const rows = leaves
      .filter((n) => assignedKeys.has(n.key))
      .map((n) => {
        const entry = byKey[n.key];
        const proof = entry?.proofs?.[0] || null;
        const titles = titleOf(n.key);
        const status =
          proof?.aiStatus === AiProofStatus.APPROVED || entry?.done
            ? 'DONE'
            : proof?.aiStatus === AiProofStatus.REJECTED
              ? 'REJECTED'
              : proof?.aiStatus === AiProofStatus.PENDING
                ? 'PENDING'
                : 'TODO';
        return {
          key: n.key,
          ...titles,
          inputType: n.inputType,
          proofRequired: true,
          done: entry?.done ?? false,
          score: entry?.score ?? null,
          value: entry?.value ?? null,
          status,
          aiStatus: proof?.aiStatus ?? null,
          aiNote: proof?.aiNote ?? null,
          aiFeedback: proof?.aiFeedback ?? null,
          proof: proof
            ? {
                id: proof.id,
                fileName: proof.fileName,
                aiStatus: proof.aiStatus,
                createdAt: proof.createdAt,
              }
            : null,
        };
      });

    const isManager = user.role === Role.MANAGER;
    const pending = rows.filter((r) => r.status === 'TODO' || r.status === 'REJECTED');
    const inReview = rows.filter((r) => r.status === 'PENDING');
    const completed = rows.filter((r) => r.status === 'DONE');

    return {
      date: date.toISOString().slice(0, 10),
      branchId,
      frequency,
      mode: isManager ? 'manager' : 'admin',
      period: {
        frequency,
        from: date.toISOString().slice(0, 10),
        to:
          frequency === KpiFrequency.WEEKLY
            ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 6))
                .toISOString()
                .slice(0, 10)
            : frequency === KpiFrequency.MONTHLY
              ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
                  .toISOString()
                  .slice(0, 10)
              : date.toISOString().slice(0, 10),
      },
      columns: tasks,
      tasks,
      tree,
      rows,
      pending,
      inReview,
      completed,
      assignedCount: assignedKeys.size,
      assignableCount: leaves.length,
      entries: byKey,
      totalScore: score.totalScore,
      colorStatus: score.colorStatus,
      blockScores: score.blockScores,
      completion: score.completion,
    };
  }

  async saveEntry(
    user: { id: string; role: Role },
    data: {
      branchId: string;
      date?: string;
      nodeKey: string;
      value?: any;
      done?: boolean;
    },
  ) {
    if (user.role === Role.MANAGER) {
      throw new ForbiddenException(
        'Manager ishlarni galochka bilan belgilay olmaydi — dalil yuklab yuboring',
      );
    }
    await this.branches.assertCanAccessBranch(user.id, user.role, data.branchId);
    const node = await this.prisma.kpiCatalogNode.findUnique({
      where: { key: data.nodeKey },
    });
    if (!node || !node.active) throw new NotFoundException('Vazifa topilmadi');

    const date = periodDate(node.frequency, data.date);
    const value = data.value ?? null;
    const done = data.done ?? this.inferDone(node.inputType, value);
    const leafScore = this.scoreLeaf(node.inputType, value, done);

    const entry = await this.prisma.kpiDayEntry.upsert({
      where: {
        branchId_date_nodeKey: {
          branchId: data.branchId,
          date,
          nodeKey: data.nodeKey,
        },
      },
      create: {
        branchId: data.branchId,
        date,
        nodeKey: data.nodeKey,
        value: value as any,
        done,
        score: leafScore,
        userId: user.id,
      },
      update: {
        value: value as any,
        done,
        score: leafScore,
        userId: user.id,
      },
      include: { proofs: { take: 3, orderBy: { createdAt: 'desc' } } },
    });

    if (node.inputType === KpiInputType.GROUP || node.parentKey) {
      await this.rollupParents(data.branchId, date, data.nodeKey, user.id);
    }

    const dayScore = await this.recalculate(data.branchId, date, node.frequency);
    return { entry, dayScore };
  }

  async saveEntryBulk(
    user: { id: string; role: Role },
    data: { branchId: string; date?: string; nodeKeys: string[]; done: boolean },
  ) {
    if (user.role === Role.MANAGER) {
      throw new ForbiddenException(
        'Manager ommaviy belgilay olmaydi — har bir ishni dalil bilan yuboring',
      );
    }
    await this.branches.assertCanAccessBranch(user.id, user.role, data.branchId);
    const keys = [...new Set(data.nodeKeys.filter(Boolean))];
    const nodes = await this.prisma.kpiCatalogNode.findMany({
      where: { key: { in: keys }, active: true },
    });
    let lastFreq: KpiFrequency = KpiFrequency.DAILY;
    let lastDate = periodDate(KpiFrequency.DAILY, data.date);

    for (const node of nodes) {
      if (node.inputType === KpiInputType.GROUP) continue;
      const date = periodDate(node.frequency, data.date);
      lastFreq = node.frequency;
      lastDate = date;
      const value =
        node.inputType === KpiInputType.CHECKBOX
          ? data.done
          : node.inputType === KpiInputType.NOTE_CHECK
            ? { checked: data.done }
            : data.done;
      const leafScore = this.scoreLeaf(node.inputType, value, data.done);
      await this.prisma.kpiDayEntry.upsert({
        where: {
          branchId_date_nodeKey: {
            branchId: data.branchId,
            date,
            nodeKey: node.key,
          },
        },
        create: {
          branchId: data.branchId,
          date,
          nodeKey: node.key,
          value: value as any,
          done: data.done,
          score: leafScore,
          userId: user.id,
        },
        update: {
          value: value as any,
          done: data.done,
          score: leafScore,
          userId: user.id,
        },
      });
      if (node.parentKey) {
        await this.rollupParents(data.branchId, date, node.key, user.id);
      }
    }

    const dayScore = await this.recalculate(data.branchId, lastDate, lastFreq);
    return { ok: true, count: nodes.filter((n) => n.inputType !== KpiInputType.GROUP).length, dayScore };
  }

  private inferDone(type: KpiInputType, value: any): boolean {
    if (value == null) return false;
    if (type === KpiInputType.CHECKBOX) return value === true || value?.checked === true;
    if (type === KpiInputType.NUMBER) return Number(value?.count ?? value) > 0;
    if (type === KpiInputType.RATIO) {
      const calls = Number(value?.calls ?? value?.a ?? 0);
      return calls > 0;
    }
    if (type === KpiInputType.NOTE_CHECK) {
      return !!(value?.checked || value?.note);
    }
    return !!value;
  }

  private scoreLeaf(type: KpiInputType, value: any, done: boolean): number {
    if (!done) return 0;
    if (type === KpiInputType.CHECKBOX) return 100;
    if (type === KpiInputType.NUMBER) {
      const n = Number(value?.count ?? value ?? 0);
      return Math.min(100, n * 20);
    }
    if (type === KpiInputType.RATIO) {
      const calls = Number(value?.calls ?? value?.a ?? 0);
      const booked = Number(value?.booked ?? value?.b ?? 0);
      if (!calls) return 0;
      return Math.round((booked / calls) * 1000) / 10;
    }
    if (type === KpiInputType.NOTE_CHECK) {
      return value?.checked ? 100 : value?.note ? 70 : 0;
    }
    return done ? 100 : 0;
  }

  private async rollupParents(
    branchId: string,
    date: Date,
    fromKey: string,
    userId: string,
  ) {
    const all = await this.prisma.kpiCatalogNode.findMany({ where: { active: true } });
    const byKey = Object.fromEntries(all.map((n) => [n.key, n]));
    let cur = byKey[fromKey];
    const visited = new Set<string>();

    while (cur?.parentKey && !visited.has(cur.parentKey)) {
      visited.add(cur.parentKey);
      const parent = byKey[cur.parentKey];
      if (!parent) break;
      const children = all.filter((n) => n.parentKey === parent.key);
      const childEntries = await this.prisma.kpiDayEntry.findMany({
        where: {
          branchId,
          date,
          nodeKey: { in: children.map((c) => c.key) },
        },
      });
      const scores = children.map((c) => {
        const e = childEntries.find((x) => x.nodeKey === c.key);
        return e?.score ?? 0;
      });
      const avg = scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : 0;
      const done =
        children.length > 0 && childEntries.filter((e) => e.done).length === children.length;

      await this.prisma.kpiDayEntry.upsert({
        where: {
          branchId_date_nodeKey: { branchId, date, nodeKey: parent.key },
        },
        create: {
          branchId,
          date,
          nodeKey: parent.key,
          value: { rollup: true },
          done,
          score: avg,
          userId,
        },
        update: { done, score: avg, userId },
      });
      cur = parent;
    }
  }

  async recalculate(branchId: string, date: Date, frequency?: KpiFrequency) {
    const roots = await this.prisma.kpiCatalogNode.findMany({
      where: {
        active: true,
        parentKey: null,
        ...(frequency ? { frequency } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
    const entries = await this.prisma.kpiDayEntry.findMany({
      where: { branchId, date, nodeKey: { in: roots.map((r) => r.key) } },
      include: { proofs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    const blockScores: Record<string, number> = {};
    let weighted = 0;
    let totalWeight = 0;
    let requiredFilled = 0;
    const incomplete: string[] = [];

    const dashKey = (key: string) =>
      key.replace(/_w$/, '').replace(/_m$/, '');

    for (const root of roots) {
      const w = root.weight || 0;
      if (w <= 0) continue;
      const entry = entries.find((e) => e.nodeKey === root.key);
      let score = entry?.score ?? 0;
      const proof = entry?.proofs?.[0];

      if (proof?.aiPenalty) {
        score = Math.max(0, score - proof.aiPenalty);
      }
      if (root.proofRequired) {
        if (!proof || proof.aiStatus === AiProofStatus.REJECTED) {
          score = Math.min(score, 30);
        } else if (proof.aiStatus === AiProofStatus.PENDING) {
          score = Math.min(score, 60);
        }
      }

      const dk = dashKey(root.key);
      blockScores[root.key] = score;
      blockScores[dk] = score;
      weighted += score * w;
      totalWeight += w;
      if (entry?.done && proof?.aiStatus !== AiProofStatus.REJECTED) requiredFilled++;
      else incomplete.push(dk);
    }

    const totalScore = totalWeight
      ? Math.round((weighted / totalWeight) * 10) / 10
      : 0;
    const status = colorStatus(totalScore);
    const weightedRoots = roots.filter((r) => (r.weight || 0) > 0);
    const completion = {
      requiredFilled,
      requiredTotal: weightedRoots.length,
      requiredPct: weightedRoots.length
        ? Math.round((requiredFilled / weightedRoots.length) * 1000) / 10
        : 0,
      incomplete,
    };

    const existing = await this.prisma.dailyScore.findFirst({
      where: { OR: [{ branchId, date }, { branchId: null, date }] },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) {
      await this.prisma.dailyScore.update({
        where: { id: existing.id },
        data: {
          branchId,
          totalScore,
          blockScores,
          completion,
          colorStatus: status,
        },
      });
    } else {
      try {
        await this.prisma.dailyScore.create({
          data: {
            branchId,
            date,
            totalScore,
            blockScores,
            completion,
            colorStatus: status,
          },
        });
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e;
        await this.prisma.dailyScore.updateMany({
          where: { branchId, date },
          data: { totalScore, blockScores, completion, colorStatus: status },
        });
      }
    }

    return { totalScore, blockScores, colorStatus: status, completion };
  }

  async saveProof(
    user: { id: string; role: Role },
    data: {
      branchId: string;
      date?: string;
      nodeKey: string;
      value?: any;
      file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
    },
  ) {
    await this.branches.assertCanAccessBranch(user.id, user.role, data.branchId);
    const node = await this.prisma.kpiCatalogNode.findUnique({
      where: { key: data.nodeKey },
    });
    if (!node || !node.active) throw new NotFoundException('Vazifa topilmadi');
    if (node.inputType === KpiInputType.GROUP) {
      throw new BadRequestException('Guruh uchun dalil yuborilmaydi');
    }

    const date = periodDate(node.frequency, data.date);
    const assigned = await this.prisma.kpiTaskAssignment.findFirst({
      where: {
        branchId: data.branchId,
        date,
        nodeKey: data.nodeKey,
        active: true,
      },
    });
    if (!assigned) {
      throw new ForbiddenException('Bu ish sizga topshirilmagan');
    }

    let value = data.value ?? null;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        /* keep string */
      }
    }

    const entry = await this.prisma.kpiDayEntry.upsert({
      where: {
        branchId_date_nodeKey: {
          branchId: data.branchId,
          date,
          nodeKey: data.nodeKey,
        },
      },
      create: {
        branchId: data.branchId,
        date,
        nodeKey: data.nodeKey,
        value: value as any,
        done: false,
        userId: user.id,
      },
      update: {
        userId: user.id,
        ...(value != null ? { value: value as any } : {}),
        done: false,
      },
    });

    const safeName = `${Date.now()}-${data.file.originalname.replace(/[^\w.\-]+/g, '_')}`;
    const rel = path.join(data.branchId, date.toISOString().slice(0, 10), safeName);
    const full = path.join(this.uploadRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data.file.buffer);

    let aiStatus: AiProofStatus = AiProofStatus.PENDING;
    let aiNote: string | null = 'AI tekshiruvda...';
    let aiFeedback: string | null = null;
    let aiAction: AiAction = AiAction.NONE;
    let aiPenalty = 0;
    let aiScore = 0;

    const vision = await openaiVisionProof({
      title: `${node.titleUz} / ${node.titleRu}`,
      description: node.descriptionUz || node.descriptionRu,
      mimeType: data.file.mimetype,
      base64: data.file.buffer.toString('base64'),
      frequency: node.frequency,
    });

    if (vision) {
      aiStatus = vision.approved ? AiProofStatus.APPROVED : AiProofStatus.REJECTED;
      aiNote = vision.note;
      aiFeedback = vision.feedback;
      aiAction = vision.action as AiAction;
      aiPenalty = vision.penalty;
      aiScore = vision.score;
    } else {
      // AI yoʻq — avto tasdiqlamaymiz, admin kuzatsin
      aiStatus = AiProofStatus.PENDING;
      aiNote = 'AI vaqtincha javob bermadi — tekshiruv kutilmoqda';
      aiFeedback = 'Admin yoki AI qayta tekshiradi';
      aiAction = AiAction.NONE;
      aiPenalty = 0;
      aiScore = 0;
    }

    const proof = await this.prisma.kpiProof.create({
      data: {
        entryId: entry.id,
        userId: user.id,
        fileName: data.file.originalname,
        mimeType: data.file.mimetype,
        path: rel.replace(/\\/g, '/'),
        size: data.file.size,
        aiStatus,
        aiNote,
        aiFeedback,
        aiAction,
        aiPenalty,
      },
    });

    if (aiStatus === AiProofStatus.APPROVED) {
      await this.prisma.kpiDayEntry.update({
        where: { id: entry.id },
        data: {
          done: true,
          score: aiScore || this.scoreLeaf(node.inputType, value, true) || 100,
        },
      });
      await this.rollupParents(data.branchId, date, data.nodeKey, user.id);
    } else if (aiStatus === AiProofStatus.REJECTED) {
      await this.prisma.kpiDayEntry.update({
        where: { id: entry.id },
        data: {
          done: false,
          score: Math.max(0, (aiScore || 0) - aiPenalty),
        },
      });
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          title: `AI: ${node.titleUz}`,
          message: `${aiNote || 'Rad'}${aiFeedback ? ' — ' + aiFeedback : ''}${
            aiPenalty ? ` · Jarima −${aiPenalty}` : ''
          }${aiAction === AiAction.RESUBMIT ? ' · Qayta yuklang' : ''}`,
          type: NotificationType.ALERT,
        },
      });
    }

    await this.recalculate(data.branchId, date, node.frequency);
    return proof;
  }

  async setAssignments(
    user: { id: string; role: Role },
    data: {
      branchId: string;
      date?: string;
      frequency: KpiFrequency;
      nodeKeys: string[];
    },
  ) {
    if (user.role === Role.MANAGER) {
      throw new ForbiddenException('Faqat admin topshiradi');
    }
    await this.branches.assertCanAccessBranch(user.id, user.role, data.branchId);
    const date = periodDate(data.frequency, data.date);
    const keys = [...new Set(data.nodeKeys.filter(Boolean))];

    const valid = await this.prisma.kpiCatalogNode.findMany({
      where: {
        key: { in: keys },
        active: true,
        frequency: data.frequency,
        inputType: { not: KpiInputType.GROUP },
      },
    });
    const validKeys = valid.map((v) => v.key);

    await this.prisma.kpiTaskAssignment.updateMany({
      where: { branchId: data.branchId, date, frequency: data.frequency },
      data: { active: false },
    });

    for (const nodeKey of validKeys) {
      await this.prisma.kpiTaskAssignment.upsert({
        where: {
          branchId_date_nodeKey: {
            branchId: data.branchId,
            date,
            nodeKey,
          },
        },
        create: {
          branchId: data.branchId,
          date,
          frequency: data.frequency,
          nodeKey,
          assignedById: user.id,
          active: true,
        },
        update: {
          active: true,
          assignedById: user.id,
          frequency: data.frequency,
        },
      });
    }

    return {
      ok: true,
      count: validKeys.length,
      date: date.toISOString().slice(0, 10),
      frequency: data.frequency,
    };
  }

  async reviewProof(
    user: { id: string; role: Role },
    data: { proofId: string; approve: boolean; note?: string },
  ) {
    if (user.role === Role.MANAGER) {
      throw new ForbiddenException('Faqat admin/AI nazorat qiladi');
    }
    const proof = await this.prisma.kpiProof.findUnique({
      where: { id: data.proofId },
      include: { entry: true },
    });
    if (!proof) throw new NotFoundException('Dalil topilmadi');
    await this.branches.assertCanAccessBranch(user.id, user.role, proof.entry.branchId);

    const node = await this.prisma.kpiCatalogNode.findUnique({
      where: { key: proof.entry.nodeKey },
    });
    const aiStatus = data.approve ? AiProofStatus.APPROVED : AiProofStatus.REJECTED;
    const aiNote =
      data.note ||
      (data.approve ? 'Admin tasdiqladi' : 'Admin rad etdi');

    await this.prisma.kpiProof.update({
      where: { id: proof.id },
      data: {
        aiStatus,
        aiNote,
        aiFeedback: data.note || proof.aiFeedback,
        aiAction: data.approve ? AiAction.NONE : AiAction.RESUBMIT,
      },
    });

    await this.prisma.kpiDayEntry.update({
      where: { id: proof.entryId },
      data: {
        done: data.approve,
        score: data.approve ? proof.entry.score || 100 : 0,
        userId: user.id,
      },
    });

    if (node) {
      await this.rollupParents(
        proof.entry.branchId,
        proof.entry.date,
        proof.entry.nodeKey,
        user.id,
      );
      await this.recalculate(proof.entry.branchId, proof.entry.date, node.frequency);
    }

    if (!data.approve) {
      await this.prisma.notification.create({
        data: {
          userId: proof.userId,
          title: `Tekshiruv: ${node?.titleUz || proof.entry.nodeKey}`,
          message: aiNote,
          type: NotificationType.ALERT,
        },
      });
    }

    return { ok: true, aiStatus };
  }

  async getProofFile(proofId: string, user: { id: string; role: Role }) {
    const proof = await this.prisma.kpiProof.findUnique({
      where: { id: proofId },
      include: { entry: true },
    });
    if (!proof) throw new NotFoundException();
    await this.branches.assertCanAccessBranch(user.id, user.role, proof.entry.branchId);
    const full = path.join(this.uploadRoot, proof.path);
    if (!fs.existsSync(full)) throw new NotFoundException('Fayl topilmadi');
    return { proof, full };
  }
}
