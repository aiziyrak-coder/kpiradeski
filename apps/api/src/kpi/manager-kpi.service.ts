import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AiProofStatus, KpiInputType, Role } from '@prisma/client';
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
  weight: number;
  sortOrder: number;
  proofRequired: boolean;
  children?: CatalogNode[];
};

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
      const count = await this.prisma.kpiCatalogNode.count();
      if (count === 0) {
        await seedKpiCatalog(this.prisma as any);
        this.logger.log('KPI katalog seedlandi');
      }
      let branch = await this.prisma.branch.findFirst();
      if (!branch) {
        branch = await this.prisma.branch.create({
          data: { name: 'Radeski Dermatologiya', address: 'Toshkent' },
        });
      }
      const manager = await this.prisma.user.findFirst({
        where: { role: Role.MANAGER, active: true },
      });
      if (manager) {
        await this.prisma.branchManager.upsert({
          where: { branchId_userId: { branchId: branch.id, userId: manager.id } },
          create: { branchId: branch.id, userId: manager.id },
          update: {},
        });
      }
    } catch (e) {
      this.logger.warn(`Catalog seed: ${e}`);
    }
  }

  async catalog(lang: 'uz' | 'ru' = 'uz') {
    const rows = await this.prisma.kpiCatalogNode.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
    const map = new Map<string, CatalogNode>();
    for (const r of rows) {
      map.set(r.key, {
        key: r.key,
        parentKey: r.parentKey,
        titleUz: r.titleUz,
        titleRu: r.titleRu,
        descriptionUz: r.descriptionUz,
        descriptionRu: r.descriptionRu,
        inputType: r.inputType,
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
    const sortRec = (nodes: CatalogNode[]) => {
      nodes.sort((a, b) => a.sortOrder - b.sortOrder);
      nodes.forEach((n) => n.children && sortRec(n.children));
    };
    sortRec(roots);

    const localize = (n: CatalogNode): any => ({
      key: n.key,
      parentKey: n.parentKey,
      title: lang === 'ru' ? n.titleRu : n.titleUz,
      titleUz: n.titleUz,
      titleRu: n.titleRu,
      description: lang === 'ru' ? n.descriptionRu : n.descriptionUz,
      inputType: n.inputType,
      weight: n.weight,
      sortOrder: n.sortOrder,
      proofRequired: n.proofRequired,
      children: (n.children || []).map(localize),
    });

    return roots.map(localize);
  }

  async getDay(
    user: { id: string; role: Role },
    branchId: string,
    dateStr?: string,
  ) {
    await this.branches.assertCanAccessBranch(user.id, user.role, branchId);
    const date = toDateOnly(dateStr);
    const catalog = await this.prisma.kpiCatalogNode.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    const entries = await this.prisma.kpiDayEntry.findMany({
      where: { branchId, date },
      include: {
        proofs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            aiStatus: true,
            aiNote: true,
            createdAt: true,
          },
        },
      },
    });
    const byKey = Object.fromEntries(entries.map((e) => [e.nodeKey, e]));
    const score = await this.recalculate(branchId, date);
    const roots = catalog.filter((c) => !c.parentKey);

    return {
      date: date.toISOString().slice(0, 10),
      branchId,
      columns: roots.map((r) => {
        const entry = byKey[r.key];
        return {
          key: r.key,
          titleUz: r.titleUz,
          titleRu: r.titleRu,
          inputType: r.inputType,
          weight: r.weight,
          proofRequired: r.proofRequired,
          entry: entry || null,
          score: entry?.score ?? null,
          done: entry?.done ?? false,
        };
      }),
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
    await this.branches.assertCanAccessBranch(user.id, user.role, data.branchId);
    const node = await this.prisma.kpiCatalogNode.findUnique({
      where: { key: data.nodeKey },
    });
    if (!node || !node.active) throw new NotFoundException('KPI punkt topilmadi');

    const date = toDateOnly(data.date);
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

    // GROUP tugunlar: bolalar holatidan hisob
    if (node.inputType === KpiInputType.GROUP || node.parentKey) {
      await this.rollupParents(data.branchId, date, data.nodeKey, user.id);
    }

    const dayScore = await this.recalculate(data.branchId, date);
    return { entry, dayScore };
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
      const done = children.length > 0 && childEntries.filter((e) => e.done).length === children.length;

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

  async recalculate(branchId: string, date: Date) {
    const roots = await this.prisma.kpiCatalogNode.findMany({
      where: { active: true, parentKey: null },
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

    for (const root of roots) {
      const w = root.weight || 0;
      if (w <= 0) continue;
      const entry = entries.find((e) => e.nodeKey === root.key);
      let score = entry?.score ?? 0;

      if (root.proofRequired) {
        const proof = entry?.proofs?.[0];
        if (!proof || proof.aiStatus === AiProofStatus.REJECTED) {
          score = Math.min(score, 40);
        } else if (proof.aiStatus === AiProofStatus.PENDING) {
          score = Math.min(score, 70);
        }
      }

      blockScores[root.key] = score;
      weighted += score * w;
      totalWeight += w;
      if (entry?.done) requiredFilled++;
      else incomplete.push(root.key);
    }

    const totalScore = totalWeight
      ? Math.round((weighted / totalWeight) * 10) / 10
      : 0;
    const status = colorStatus(totalScore);
    const completion = {
      requiredFilled,
      requiredTotal: roots.filter((r) => (r.weight || 0) > 0).length,
      requiredPct: roots.length
        ? Math.round((requiredFilled / roots.filter((r) => (r.weight || 0) > 0).length) * 1000) / 10
        : 0,
      incomplete,
    };

    await this.prisma.dailyScore.upsert({
      where: { branchId_date: { branchId, date } },
      create: {
        branchId,
        date,
        totalScore,
        blockScores,
        completion,
        colorStatus: status,
      },
      update: {
        totalScore,
        blockScores,
        completion,
        colorStatus: status,
      },
    });

    return { totalScore, blockScores, colorStatus: status, completion };
  }

  async saveProof(
    user: { id: string; role: Role },
    data: {
      branchId: string;
      date?: string;
      nodeKey: string;
      file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
    },
  ) {
    await this.branches.assertCanAccessBranch(user.id, user.role, data.branchId);
    const node = await this.prisma.kpiCatalogNode.findUnique({
      where: { key: data.nodeKey },
    });
    if (!node) throw new NotFoundException('KPI punkt topilmadi');

    const date = toDateOnly(data.date);
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
        done: false,
        userId: user.id,
      },
      update: { userId: user.id },
    });

    const safeName = `${Date.now()}-${data.file.originalname.replace(/[^\w.\-]+/g, '_')}`;
    const rel = path.join(data.branchId, date.toISOString().slice(0, 10), safeName);
    const full = path.join(this.uploadRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data.file.buffer);

    let aiStatus: AiProofStatus = AiProofStatus.PENDING;
    let aiNote: string | null = null;

    const vision = await openaiVisionProof({
      title: node.titleUz,
      description: node.descriptionUz,
      mimeType: data.file.mimetype,
      base64: data.file.buffer.toString('base64'),
    });

    if (vision) {
      aiStatus = vision.approved ? AiProofStatus.APPROVED : AiProofStatus.REJECTED;
      aiNote = vision.note;
    } else {
      // API yoʻq — vaqtincha APPROVED (ishlashda qolishi uchun)
      aiStatus = AiProofStatus.APPROVED;
      aiNote = 'AI mavjud emas — avtomatik qabul';
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
      },
    });

    if (aiStatus === AiProofStatus.APPROVED && !entry.done) {
      await this.prisma.kpiDayEntry.update({
        where: { id: entry.id },
        data: { done: true, score: entry.score ?? 100 },
      });
      await this.rollupParents(data.branchId, date, data.nodeKey, user.id);
    }

    await this.recalculate(data.branchId, date);
    return proof;
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
