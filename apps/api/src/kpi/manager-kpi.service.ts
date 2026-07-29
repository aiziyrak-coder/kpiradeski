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
import { openaiCoachManagerSubmit, openaiVisionProof, type AiCoachResult } from '../common/openai';
import { colorStatus, toDateOnly } from '../common/kpi.constants';
import { CalendarService } from '../common/calendar.service';
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

function slugifyKey(raw: string): string {
  const map: Record<string, string> = {
    oʻ: 'o',
    gʻ: 'g',
   ʼ: '',
    "'": '',
    '‘': '',
    '’': '',
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'yo',
    ж: 'j',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'x',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sh',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };
  let s = raw.trim().toLowerCase();
  for (const [from, to] of Object.entries(map)) {
    s = s.split(from).join(to);
  }
  s = s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return s || `task_${Date.now().toString(36)}`;
}

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
    private calendar: CalendarService,
  ) {}

  async onModuleInit() {
    fs.mkdirSync(this.uploadRoot, { recursive: true });
    try {
      await seedKpiCatalog(this.prisma as any, { syncExisting: false });
      this.logger.log('KPI katalog sync (create-missing only)');
      await this.extendSeoAssignments();
      await this.recalcOpenPeriods();
    } catch (e) {
      this.logger.warn(`Catalog seed: ${e}`);
    }
  }

  /** Boot: barcha filiallar uchun ochiq davr ballarini yangilash */
  private async recalcOpenPeriods() {
    const branches = await this.prisma.branch.findMany({
      where: { active: true },
      select: { id: true },
    });
    for (const b of branches) {
      for (const freq of [KpiFrequency.DAILY, KpiFrequency.WEEKLY, KpiFrequency.MONTHLY]) {
        try {
          await this.recalculate(b.id, periodDate(freq), freq);
        } catch (e) {
          this.logger.warn(`recalc ${b.id} ${freq}: ${e}`);
        }
      }
    }
  }

  /** Yangi SEO leaflar: agar filialda SMM/SEO assign boʻlsa — yangi SEO vazifalarini ham qoʻshadi */
  private async extendSeoAssignments() {
    const groups: Array<{
      leafPrefix: string;
      detectPrefix: string;
      frequency: KpiFrequency;
    }> = [
      { leafPrefix: 'smm.seo.', detectPrefix: 'smm.seo.', frequency: KpiFrequency.DAILY },
      { leafPrefix: 'smm_w.seo.', detectPrefix: 'smm_w.', frequency: KpiFrequency.WEEKLY },
      { leafPrefix: 'smm_m.seo.', detectPrefix: 'smm_m.', frequency: KpiFrequency.MONTHLY },
    ];
    for (const { leafPrefix, detectPrefix, frequency } of groups) {
      const leaves = await this.prisma.kpiCatalogNode.findMany({
        where: {
          active: true,
          frequency,
          inputType: { not: KpiInputType.GROUP },
          key: { startsWith: leafPrefix },
        },
        select: { key: true },
      });
      if (!leaves.length) continue;
      const branchIds = await this.prisma.kpiAssignmentTemplate.findMany({
        where: {
          frequency,
          active: true,
          nodeKey: { startsWith: detectPrefix },
        },
        select: { branchId: true },
        distinct: ['branchId'],
      });
      for (const { branchId } of branchIds) {
        for (const { key } of leaves) {
          await this.prisma.kpiAssignmentTemplate.upsert({
            where: {
              branchId_frequency_nodeKey: { branchId, frequency, nodeKey: key },
            },
            create: {
              branchId,
              frequency,
              nodeKey: key,
              active: true,
            },
            update: { active: true },
          });
        }
      }
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
        user: { select: { id: true, name: true } },
        proofs: {
          orderBy: { createdAt: 'desc' },
          take: 8,
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
            size: true,
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
        ? allNodes.filter((n) => n.parentKey === parentKey && n.frequency === frequency)
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
          proofRequired: n.proofRequired,
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

    const assignments = await this.prisma.kpiAssignmentTemplate.findMany({
      where: { branchId, frequency, active: true },
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
        const proofs = entry?.proofs || [];
        const approvedProof = proofs.find((p) => p.aiStatus === AiProofStatus.APPROVED);
        const pendingProof = proofs.find((p) => p.aiStatus === AiProofStatus.PENDING);
        const rejectedProof = proofs.find((p) => p.aiStatus === AiProofStatus.REJECTED);
        // Eng yaxshi holat: APPROVED > PENDING > entry.done > REJECTED > TODO
        // (oxirgi rad etilgan izoh eski tasdiqlangan rasmni yashirmasin)
        let status: 'TODO' | 'PENDING' | 'REJECTED' | 'DONE' = 'TODO';
        if (approvedProof || entry?.done) status = 'DONE';
        else if (pendingProof) status = 'PENDING';
        else if (rejectedProof) status = 'REJECTED';
        else status = 'TODO';

        const displayProof = approvedProof || pendingProof || rejectedProof || proofs[0] || null;
        const realFiles = proofs.filter(
          (p) =>
            p.mimeType !== 'text/plain' &&
            p.fileName !== 'izoh.txt' &&
            !String(p.fileName || '').endsWith('.txt'),
        );
        const titles = titleOf(n.key);
        // Ochish tugmasi uchun haqiqiy fayl (izoh.txt emas)
        const viewProof =
          realFiles.find((p) => p.aiStatus === AiProofStatus.APPROVED) ||
          realFiles.find((p) => p.aiStatus === AiProofStatus.PENDING) ||
          realFiles[0] ||
          null;

        return {
          key: n.key,
          ...titles,
          inputType: n.inputType,
          proofRequired: n.proofRequired,
          done: status === 'DONE',
          score: entry?.score ?? null,
          value: entry?.value ?? null,
          status,
          aiStatus: displayProof?.aiStatus ?? null,
          aiNote: displayProof?.aiNote ?? null,
          aiFeedback: displayProof?.aiFeedback ?? null,
          proof: (viewProof || displayProof)
            ? {
                id: (viewProof || displayProof)!.id,
                fileName: (viewProof || displayProof)!.fileName,
                mimeType: (viewProof || displayProof)!.mimeType,
                aiStatus: (viewProof || displayProof)!.aiStatus,
                createdAt: (viewProof || displayProof)!.createdAt,
              }
            : null,
          proofs: realFiles.map((p) => ({
            id: p.id,
            fileName: p.fileName,
            mimeType: p.mimeType,
            aiStatus: p.aiStatus,
            size: p.size,
            createdAt: p.createdAt,
          })),
          managerNote:
            entry?.value && typeof entry.value === 'object' && (entry.value as any).note
              ? String((entry.value as any).note).trim() || null
              : null,
          submittedBy: (entry as any)?.user?.name || null,
          submittedById: (entry as any)?.user?.id || null,
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

    if (done && node.proofRequired && node.inputType !== KpiInputType.GROUP) {
      const existingEntry = await this.prisma.kpiDayEntry.findUnique({
        where: {
          branchId_date_nodeKey: {
            branchId: data.branchId,
            date,
            nodeKey: data.nodeKey,
          },
        },
        include: { proofs: { orderBy: { createdAt: 'desc' }, take: 8 } },
      });
      const latest = existingEntry?.proofs?.[0];
      if (!latest || latest.aiStatus !== AiProofStatus.APPROVED) {
        throw new BadRequestException(
          'Bu vazifa uchun tasdiqlangan dalil kerak — oddiy belgilash mumkin emas',
        );
      }
    }

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
    const touched = new Map<string, { date: Date; freq: KpiFrequency }>();

    for (const node of nodes) {
      if (node.inputType === KpiInputType.GROUP) continue;
      if (data.done && node.proofRequired) {
        throw new BadRequestException(
          `«${node.titleUz}» uchun dalil majburiy — ommaviy belgilash mumkin emas`,
        );
      }
      const date = periodDate(node.frequency, data.date);
      lastFreq = node.frequency;
      lastDate = date;
      touched.set(`${node.frequency}|${date.toISOString()}`, {
        date,
        freq: node.frequency,
      });
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

    let dayScore: Awaited<ReturnType<ManagerKpiService['recalculate']>> | null = null;
    for (const { date, freq } of touched.values()) {
      dayScore = await this.recalculate(data.branchId, date, freq);
    }
    if (!dayScore) {
      dayScore = await this.recalculate(data.branchId, lastDate, lastFreq);
    }
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
      if (!n) return 0;
      if (n >= 4) return 100;
      if (n === 3) return 80;
      if (n === 2) return 60;
      return 40;
    }
    if (type === KpiInputType.RATIO) {
      const calls = Number(value?.calls ?? value?.a ?? 0);
      const booked = Number(value?.booked ?? value?.b ?? 0);
      if (!calls) return 0;
      return Math.max(0, Math.min(100, Math.round((booked / calls) * 1000) / 10));
    }
    if (type === KpiInputType.NOTE_CHECK) {
      if (value?.checked) return 100;
      if (value?.note && String(value.note).trim().length >= 8) return 75;
      if (value?.note) return 50;
      return 0;
    }
    const note = value?.note != null ? String(value.note).trim() : '';
    if (note.length >= 20) return 100;
    if (note.length >= 8) return 85;
    return done ? 70 : 0;
  }

  private effectiveLeafScore(
    node: { proofRequired: boolean; inputType: KpiInputType },
    entry?: {
      score: number | null;
      done: boolean;
      value?: any;
      proofs?: Array<{ aiStatus: AiProofStatus; aiPenalty: number | null }>;
    } | null,
  ): { score: number; countedDone: boolean } {
    if (!entry) return { score: 0, countedDone: false };
    const proofs = entry.proofs || [];
    const proof =
      proofs.find((p) => p.aiStatus === AiProofStatus.APPROVED) ||
      proofs.find((p) => p.aiStatus === AiProofStatus.PENDING) ||
      proofs[0];
    if (node.proofRequired) {
      if (!proof || proof.aiStatus === AiProofStatus.REJECTED) {
        return { score: 0, countedDone: false };
      }
      if (proof.aiStatus === AiProofStatus.PENDING) {
        const base =
          typeof entry.score === 'number' && entry.score > 0
            ? entry.score
            : this.scoreLeaf(node.inputType, entry.value, true);
        return { score: Math.min(40, Math.max(0, base)), countedDone: false };
      }
      let score =
        typeof entry.score === 'number' && Number.isFinite(entry.score)
          ? entry.score
          : this.scoreLeaf(node.inputType, entry.value, true);
      if (proof.aiPenalty) score = Math.max(0, score - proof.aiPenalty);
      return { score: Math.max(0, Math.min(100, score)), countedDone: true };
    }
    if (!entry.done) return { score: 0, countedDone: false };
    let score =
      typeof entry.score === 'number' && Number.isFinite(entry.score)
        ? entry.score
        : this.scoreLeaf(node.inputType, entry.value, true);
    return { score: Math.max(0, Math.min(100, score)), countedDone: true };
  }

  private async assignedKeySet(branchId: string, frequency: KpiFrequency) {
    const assigned = await this.prisma.kpiAssignmentTemplate.findMany({
      where: { branchId, frequency, active: true },
      select: { nodeKey: true },
    });
    return new Set(assigned.map((a) => a.nodeKey));
  }

  private leafKeysUnder(
    allNodes: Array<{
      key: string;
      parentKey: string | null;
      inputType: KpiInputType;
      proofRequired?: boolean;
    }>,
    rootKey: string,
  ) {
    const out: Array<{
      key: string;
      parentKey: string | null;
      inputType: KpiInputType;
      proofRequired: boolean;
    }> = [];
    const walk = (parent: string) => {
      for (const n of allNodes.filter((x) => x.parentKey === parent)) {
        if (n.inputType === KpiInputType.GROUP) walk(n.key);
        else
          out.push({
            key: n.key,
            parentKey: n.parentKey,
            inputType: n.inputType,
            proofRequired: !!n.proofRequired,
          });
      }
    };
    walk(rootKey);
    return out;
  }

  private async rollupParents(
    branchId: string,
    date: Date,
    fromKey: string,
    userId: string,
  ) {
    const all = await this.prisma.kpiCatalogNode.findMany({ where: { active: true } });
    const byKey = Object.fromEntries(all.map((n) => [n.key, n]));
    const startNode = byKey[fromKey];
    if (!startNode) return;
    const assignedSet = await this.assignedKeySet(branchId, startNode.frequency);
    let cur = startNode;
    const visited = new Set<string>();
    while (cur?.parentKey && !visited.has(cur.parentKey)) {
      visited.add(cur.parentKey);
      const parent = byKey[cur.parentKey];
      if (!parent) break;
      const children = all.filter((n) => n.parentKey === parent.key);
      const relevant = children.filter((c) => {
        if (c.inputType !== KpiInputType.GROUP) return assignedSet.has(c.key);
        return this.leafKeysUnder(all, c.key).some((l) => assignedSet.has(l.key));
      });
      const childEntries = relevant.length
        ? await this.prisma.kpiDayEntry.findMany({
            where: { branchId, date, nodeKey: { in: relevant.map((c) => c.key) } },
            include: { proofs: { orderBy: { createdAt: 'desc' }, take: 8 } },
          })
        : [];
      const scores = relevant.map((c) => {
        const e = childEntries.find((x) => x.nodeKey === c.key);
        if (c.inputType === KpiInputType.GROUP) return e?.score ?? 0;
        return this.effectiveLeafScore(c, e).score;
      });
      const avg = scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : 0;
      const doneFlags = relevant.map((c) => {
        const e = childEntries.find((x) => x.nodeKey === c.key);
        if (c.inputType === KpiInputType.GROUP) return !!e?.done;
        return this.effectiveLeafScore(c, e).countedDone;
      });
      const done = relevant.length > 0 && doneFlags.every(Boolean);
      await this.prisma.kpiDayEntry.upsert({
        where: { branchId_date_nodeKey: { branchId, date, nodeKey: parent.key } },
        create: {
          branchId, date, nodeKey: parent.key,
          value: { rollup: true }, done, score: avg, userId,
        },
        update: { done, score: avg, userId },
      });
      cur = parent;
    }
  }

  async recalculate(branchId: string, date: Date, frequency?: KpiFrequency) {
    const freq = frequency || KpiFrequency.DAILY;
    // Rest day: faqat oldindan mavjud score boʻlsa yangilanadi — yangi mock yozuv yaratilmaydi
    if (freq === KpiFrequency.DAILY) {
      const rest = await this.calendar.isRestDay(date);
      if (rest) {
        const blockScores = {};
        const completion = {
          requiredFilled: 0, requiredTotal: 0, requiredPct: 0,
          incomplete: [] as string[], assignedDone: 0, assignedTotal: 0,
          assignedPct: 0, restDay: true,
        };
        const existing = await this.prisma.dailyScore.findFirst({
          where: { branchId, date, frequency: freq },
        });
        if (existing) {
          await this.prisma.dailyScore.update({
            where: { id: existing.id },
            data: { totalScore: 0, blockScores, completion, colorStatus: 'rest' },
          });
        }
        return { totalScore: 0, blockScores, colorStatus: 'rest' as const, completion, frequency: freq };
      }
    }

    const allNodes = await this.prisma.kpiCatalogNode.findMany({
      where: { active: true, frequency: freq },
    });
    const roots = allNodes
      .filter((r) => r.parentKey == null && (r.weight || 0) > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const assignedSet = await this.assignedKeySet(branchId, freq);
    const dashKey = (key: string) => key.replace(/_w$/, '').replace(/_m$/, '');
    const allLeafKeys = roots.flatMap((r) => this.leafKeysUnder(allNodes, r.key).map((l) => l.key));
    const entries = allLeafKeys.length
      ? await this.prisma.kpiDayEntry.findMany({
          where: { branchId, date, nodeKey: { in: [...new Set(allLeafKeys)] } },
          include: { proofs: { orderBy: { createdAt: 'desc' }, take: 8 } },
        })
      : [];

    const blockScores: Record<string, number> = {};
    let weighted = 0;
    let totalWeight = 0;
    let assignedDone = 0;
    let assignedTotal = 0;
    const incomplete: string[] = [];
    /** Faqat real yuborilgan leaf bor boʻlsa DB ga yozamiz (boʻsh kun = mock emas) */
    const hasRealLeafActivity = entries.length > 0;

    for (const root of roots) {
      const leaves = this.leafKeysUnder(allNodes, root.key).filter((l) => assignedSet.has(l.key));
      if (!leaves.length) continue;
      const leafResults = leaves.map((leaf) => {
        const e = entries.find((x) => x.nodeKey === leaf.key);
        return { leaf, ...this.effectiveLeafScore(leaf, e) };
      });
      const blockScore =
        Math.round((leafResults.reduce((s, r) => s + r.score, 0) / leafResults.length) * 10) / 10;
      const dk = dashKey(root.key);
      blockScores[dk] = blockScore;
      if (hasRealLeafActivity) {
        await this.prisma.kpiDayEntry.upsert({
          where: { branchId_date_nodeKey: { branchId, date, nodeKey: root.key } },
          create: {
            branchId, date, nodeKey: root.key,
            value: { rollup: true, assignedLeaves: leaves.length },
            done: leafResults.every((r) => r.countedDone),
            score: blockScore,
          },
          update: {
            value: { rollup: true, assignedLeaves: leaves.length },
            done: leafResults.every((r) => r.countedDone),
            score: blockScore,
          },
        });
      }
      const w = root.weight || 0;
      weighted += blockScore * w;
      totalWeight += w;
      for (const r of leafResults) {
        assignedTotal++;
        if (r.countedDone) assignedDone++;
        else incomplete.push(r.leaf.key);
      }
    }

    const totalScore = totalWeight ? Math.round((weighted / totalWeight) * 10) / 10 : 0;
    const status = colorStatus(totalScore);
    const completion = {
      requiredFilled: assignedDone,
      requiredTotal: assignedTotal,
      requiredPct: assignedTotal ? Math.round((assignedDone / assignedTotal) * 1000) / 10 : 0,
      assignedDone,
      assignedTotal,
      assignedPct: assignedTotal ? Math.round((assignedDone / assignedTotal) * 1000) / 10 : 0,
      incomplete: incomplete.slice(0, 40),
      restDay: false,
      weightsSum: totalWeight,
    };

    // Boʻsh kun: ballni hisoblab qaytaramiz, lekin DailyScore yozmaymiz (statistika toza qoladi)
    if (!hasRealLeafActivity) {
      const existingEmpty = await this.prisma.dailyScore.findFirst({
        where: { branchId, date, frequency: freq },
      });
      if (existingEmpty && existingEmpty.totalScore === 0) {
        const c = existingEmpty.completion as any;
        if (!c?.assignedDone) {
          await this.prisma.dailyScore.delete({ where: { id: existingEmpty.id } }).catch(() => undefined);
        }
      }
      return { totalScore, blockScores, colorStatus: status, completion, frequency: freq };
    }

    const existing = await this.prisma.dailyScore.findFirst({
      where: { branchId, date, frequency: freq },
    });
    if (existing) {
      await this.prisma.dailyScore.update({
        where: { id: existing.id },
        data: { totalScore, blockScores, completion, colorStatus: status },
      });
    } else {
      try {
        await this.prisma.dailyScore.create({
          data: {
            branchId, date, frequency: freq, totalScore, blockScores, completion, colorStatus: status,
          },
        });
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e;
        await this.prisma.dailyScore.updateMany({
          where: { branchId, date, frequency: freq },
          data: { totalScore, blockScores, completion, colorStatus: status },
        });
      }
    }
    return { totalScore, blockScores, colorStatus: status, completion, frequency: freq };
  }

  /** Manager ish yuborganida AI darhol coach + bildirishnoma */
  private async coachAfterSubmit(opts: {
    userId: string;
    branchId: string;
    date: Date;
    frequency: KpiFrequency;
    nodeKey: string;
    nodeTitle: string;
    nodeDescription?: string | null;
    note?: string | null;
    proofStatus?: string | null;
    proofNote?: string | null;
    proofFeedback?: string | null;
  }): Promise<AiCoachResult | null> {
    try {
      const [branch, manager, assigned, doneEntries] = await Promise.all([
        this.prisma.branch.findUnique({
          where: { id: opts.branchId },
          select: { name: true },
        }),
        this.prisma.user.findUnique({
          where: { id: opts.userId },
          select: { name: true },
        }),
        this.prisma.kpiAssignmentTemplate.findMany({
          where: {
            branchId: opts.branchId,
            frequency: opts.frequency,
            active: true,
          },
          select: { nodeKey: true },
        }),
        this.prisma.kpiDayEntry.findMany({
          where: {
            branchId: opts.branchId,
            date: opts.date,
            done: true,
          },
          select: { nodeKey: true },
        }),
      ]);

      const assignedKeys = assigned.map((a) => a.nodeKey);
      const doneSet = new Set(doneEntries.map((e) => e.nodeKey));
      const incompleteKeys = assignedKeys.filter((k) => !doneSet.has(k) && k !== opts.nodeKey);

      const incompleteNodes = incompleteKeys.length
        ? await this.prisma.kpiCatalogNode.findMany({
            where: { key: { in: incompleteKeys.slice(0, 30) }, active: true },
            select: { titleUz: true, titleRu: true, key: true },
          })
        : [];

      const incompleteTasks = incompleteNodes.map(
        (n) => `${n.titleUz || n.titleRu} (${n.key})`,
      );

      const coach = await openaiCoachManagerSubmit({
        taskTitle: opts.nodeTitle,
        taskDescription: opts.nodeDescription,
        note: opts.note,
        proofStatus: opts.proofStatus,
        proofNote: opts.proofNote,
        proofFeedback: opts.proofFeedback,
        incompleteTasks,
        doneToday: doneSet.size,
        assignedToday: assignedKeys.length,
        branchName: branch?.name,
        managerName: manager?.name,
        language: 'uz',
      });

      if (!coach?.summary) return coach;

      const qualityEmoji =
        coach.quality === 'excellent'
          ? '🌟'
          : coach.quality === 'good'
            ? '✅'
            : coach.quality === 'weak'
              ? '⚠️'
              : '❌';

      const lines = [
        coach.summary,
        coach.praise ? `👍 ${coach.praise}` : '',
        coach.issues.length ? `Kamchiliklar:\n• ${coach.issues.join('\n• ')}` : '',
        coach.nextActions.length ? `Keyingi qadamlar:\n• ${coach.nextActions.join('\n• ')}` : '',
        coach.incompleteHint ||
          (incompleteTasks.length
            ? `Hali bajarilmagan: ${incompleteTasks.slice(0, 5).join('; ')}${
                incompleteTasks.length > 5 ? '…' : ''
              }`
            : 'Bugungi topshiriqlar yaxshi yopilmoqda.'),
      ].filter(Boolean);

      await this.prisma.notification.create({
        data: {
          userId: opts.userId,
          title: `${qualityEmoji} AI murabbiy: ${opts.nodeTitle}`,
          message: lines.join('\n\n').slice(0, 1800),
          type: NotificationType.AI_REPORT,
        },
      });

      return coach;
    } catch (e) {
      this.logger.warn(`AI coach failed: ${e}`);
      return null;
    }
  }

  async saveProof(
    user: { id: string; role: Role },
    data: {
      branchId: string;
      date?: string;
      nodeKey: string;
      value?: any;
      file?: { originalname: string; mimetype: string; size: number; buffer: Buffer };
      files?: Array<{ originalname: string; mimetype: string; size: number; buffer: Buffer }>;
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

    const files = (data.files?.length ? data.files : data.file ? [data.file] : []).slice(0, 8);
    if (!files.length) throw new BadRequestException('Fayl yuklanmadi');

    const date = periodDate(node.frequency, data.date);
    const assigned = await this.prisma.kpiAssignmentTemplate.findFirst({
      where: {
        branchId: data.branchId,
        frequency: node.frequency,
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
    if (typeof value !== 'object' || value == null) {
      value = value != null ? { note: String(value) } : {};
    }

    if (node.inputType === KpiInputType.RATIO) {
      const calls = Number(value?.calls ?? 0);
      if (!calls) throw new BadRequestException('Qoʻngʻiroq sonini kiriting');
      value = { ...value, calls, booked: Number(value?.booked ?? 0) };
    }
    if (node.inputType === KpiInputType.NUMBER) {
      const count = Number(value?.count ?? value ?? 0);
      if (!count) throw new BadRequestException('Sonini kiriting');
      value = { ...value, count };
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
        score: 0,
        userId: user.id,
      },
      update: {
        userId: user.id,
        ...(value != null ? { value: value as any } : {}),
        done: false,
        score: 0,
      },
    });

    const ALLOWED_MIME = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ]);

    const validated: Array<{
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
      rel: string;
    }> = [];

    for (const file of files) {
      const mime = String(file.mimetype || '').toLowerCase();
      if (!ALLOWED_MIME.has(mime) || mime === 'image/svg+xml') {
        throw new BadRequestException(
          'Ruxsat etilmagan fayl turi — faqat rasm (JPEG/PNG/WebP/GIF) yoki PDF/DOC/XLS',
        );
      }
      const buf = file.buffer;
      const isJpeg = buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
      const isPng =
        buf.length > 4 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47;
      const isGif =
        buf.length > 4 &&
        buf[0] === 0x47 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46;
      const isWebp =
        buf.length > 12 &&
        buf[0] === 0x52 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50;
      const isPdf =
        buf.length > 4 &&
        buf[0] === 0x25 &&
        buf[1] === 0x50 &&
        buf[2] === 0x44 &&
        buf[3] === 0x46;
      const claimsImage = mime.startsWith('image/');
      if (claimsImage && !(isJpeg || isPng || isGif || isWebp)) {
        throw new BadRequestException('Fayl rasm emas yoki buzilgan');
      }
      if (mime === 'application/pdf' && !isPdf) {
        throw new BadRequestException('PDF fayl notoʻgʻri');
      }
      const safeName = `${Date.now()}-${validated.length}-${file.originalname.replace(/[^\w.\-]+/g, '_')}`;
      const rel = path.join(data.branchId, date.toISOString().slice(0, 10), safeName);
      const full = path.join(this.uploadRoot, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, file.buffer);
      validated.push({
        originalname: file.originalname,
        mimetype: mime,
        size: file.size,
        buffer: file.buffer,
        rel: rel.replace(/\\/g, '/'),
      });
    }

    let aiStatus: AiProofStatus = AiProofStatus.PENDING;
    let aiNote: string | null = 'AI tekshiruvda...';
    let aiFeedback: string | null = null;
    let aiAction: AiAction = AiAction.NONE;
    let aiPenalty = 0;
    let aiScore = 0;

    const imageFiles = validated.filter((f) => f.mimetype.startsWith('image/'));
    const noteStr = value?.note ? String(value.note) : null;

    if (imageFiles.length) {
      const vision = await openaiVisionProof({
        title: `${node.titleUz} / ${node.titleRu}`,
        description: node.descriptionUz || node.descriptionRu,
        images: imageFiles.map((f) => ({
          mimeType: f.mimetype,
          base64: f.buffer.toString('base64'),
        })),
        frequency: node.frequency,
        managerNote: noteStr,
      });

      if (vision) {
        aiStatus = vision.approved ? AiProofStatus.APPROVED : AiProofStatus.REJECTED;
        aiNote = vision.note;
        aiFeedback = vision.feedback;
        aiAction = vision.action as AiAction;
        aiPenalty = vision.penalty;
        aiScore = vision.score;
      } else {
        // AI ishlamasa — rad emas, qabul (pending emas — menejer kutmasin)
        aiStatus = AiProofStatus.APPROVED;
        aiNote = 'Dalil qabul qilindi';
        aiFeedback = 'AI vaqtincha javob bermadi — rasm qabul qilindi';
        aiScore = 85;
      }
    } else {
      // Faqat hujjat — qabul, admin koʻrishi mumkin
      aiStatus = AiProofStatus.APPROVED;
      aiNote = 'Hujjat qabul qilindi';
      aiFeedback = noteStr;
      aiScore = 85;
    }

    const proofs: Array<{
      id: string;
      aiStatus: AiProofStatus;
      aiNote: string | null;
      aiFeedback: string | null;
      fileName: string;
    }> = [];
    for (const f of validated) {
      const created = await this.prisma.kpiProof.create({
        data: {
          entryId: entry.id,
          userId: user.id,
          fileName: f.originalname,
          mimeType: f.mimetype,
          path: f.rel,
          size: f.size,
          aiStatus,
          aiNote,
          aiFeedback,
          aiAction,
          aiPenalty,
        },
      });
      proofs.push(created);
    }
    const proof = proofs[0];
    if (!proof) throw new BadRequestException('Fayl saqlanmadi');

    if (aiStatus === AiProofStatus.APPROVED) {
      const leafFallback = this.scoreLeaf(node.inputType, value, true);
      const finalScore =
        typeof aiScore === 'number' && Number.isFinite(aiScore) && aiScore > 0
          ? aiScore
          : aiScore === 0
            ? 0
            : leafFallback || 100;
      await this.prisma.kpiDayEntry.update({
        where: { id: entry.id },
        data: {
          done: true,
          score: finalScore,
        },
      });
      await this.rollupParents(data.branchId, date, data.nodeKey, user.id);
    } else if (aiStatus === AiProofStatus.REJECTED) {
      const base =
        typeof aiScore === 'number' && Number.isFinite(aiScore) ? aiScore : 0;
      await this.prisma.kpiDayEntry.update({
        where: { id: entry.id },
        data: {
          done: false,
          score: Math.max(0, base - aiPenalty),
        },
      });
      await this.rollupParents(data.branchId, date, data.nodeKey, user.id);
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
    } else {
      await this.prisma.kpiDayEntry.update({
        where: { id: entry.id },
        data: { done: false, score: 0 },
      });
      await this.rollupParents(data.branchId, date, data.nodeKey, user.id);
    }

    await this.recalculate(data.branchId, date, node.frequency);

    const coach = await this.coachAfterSubmit({
      userId: user.id,
      branchId: data.branchId,
      date,
      frequency: node.frequency,
      nodeKey: data.nodeKey,
      nodeTitle: node.titleUz || node.titleRu,
      nodeDescription: node.descriptionUz || node.descriptionRu,
      note: noteStr,
      proofStatus: aiStatus,
      proofNote: aiNote,
      proofFeedback: aiFeedback,
    });

    return { ...proof, proofs, filesCount: proofs.length, aiCoach: coach };
  }

  async completeTask(
    user: { id: string; role: Role },
    data: { branchId: string; date?: string; nodeKey: string; value?: any },
  ) {
    if (user.role !== Role.MANAGER) {
      throw new ForbiddenException('Faqat manager bajaraman deb yuboradi');
    }
    await this.branches.assertCanAccessBranch(user.id, user.role, data.branchId);
    const node = await this.prisma.kpiCatalogNode.findUnique({
      where: { key: data.nodeKey },
    });
    if (!node || !node.active) throw new NotFoundException('Vazifa topilmadi');
    if (node.inputType === KpiInputType.GROUP) {
      throw new BadRequestException('Guruh uchun yuborilmaydi');
    }

    const date = periodDate(node.frequency, data.date);
    const assigned = await this.prisma.kpiAssignmentTemplate.findFirst({
      where: {
        branchId: data.branchId,
        frequency: node.frequency,
        nodeKey: data.nodeKey,
        active: true,
      },
    });
    if (!assigned) {
      throw new ForbiddenException('Bu ish sizga topshirilmagan');
    }
    if (node.proofRequired) {
      throw new BadRequestException(
        'Bu ish uchun dalil (rasm/hujjat) majburiy — fayl yuklab yuboring',
      );
    }

    let value = data.value ?? {};
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        value = { note: value };
      }
    }
    if (typeof value !== 'object' || value == null) value = {};

    const note = String(value.note || '').trim();
    if (!note) {
      throw new BadRequestException('Izoh yozish majburiy (yoki dalil yuklang)');
    }

    if (node.inputType === KpiInputType.CHECKBOX || node.inputType === KpiInputType.NOTE_CHECK) {
      value = { ...value, checked: true, note };
    } else if (node.inputType === KpiInputType.RATIO) {
      const calls = Number(value?.calls ?? 0);
      if (!calls) throw new BadRequestException('Qoʻngʻiroq sonini kiriting');
      value = { ...value, note, calls, booked: Number(value?.booked ?? 0) };
    } else if (node.inputType === KpiInputType.NUMBER) {
      const count = Number(value?.count ?? 0);
      if (!count) throw new BadRequestException('Sonini kiriting');
      value = { ...value, note, count };
    } else {
      value = { ...value, note };
    }

    const leafScore = this.scoreLeaf(node.inputType, value, true);
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
        done: true,
        score: leafScore || 100,
        userId: user.id,
      },
      update: {
        value: value as any,
        done: true,
        score: leafScore || 100,
        userId: user.id,
      },
    });

    // Coach — faqat maslahat; boshqa ochiq ishlar uchun RAD QILINMAYDI
    const coach = await this.coachAfterSubmit({
      userId: user.id,
      branchId: data.branchId,
      date,
      frequency: node.frequency,
      nodeKey: data.nodeKey,
      nodeTitle: node.titleUz || node.titleRu,
      nodeDescription: node.descriptionUz || node.descriptionRu,
      note,
      proofStatus: 'NOTE_ONLY',
    });

    const feedbackParts = [
      coach?.summary,
      coach?.incompleteHint,
      coach?.issues?.length ? `Eslatma: ${coach.issues.join('; ')}` : '',
      coach?.nextActions?.length ? `Qadamlar: ${coach.nextActions.join('; ')}` : '',
    ].filter(Boolean);
    const aiFeedback = feedbackParts.join(' — ').slice(0, 1500) || null;
    const aiStatus = AiProofStatus.APPROVED;
    const aiNote = coach?.praise || coach?.summary || 'Tasdiqlandi';

    const proof = await this.prisma.kpiProof.create({
      data: {
        entryId: entry.id,
        userId: user.id,
        fileName: 'izoh.txt',
        mimeType: 'text/plain',
        path: `note-only/${entry.id}/${Date.now()}`,
        size: Buffer.byteLength(note, 'utf8'),
        aiStatus,
        aiNote,
        aiFeedback,
        aiAction: AiAction.NONE,
        aiPenalty: 0,
      },
    });

    if (node.parentKey) {
      await this.rollupParents(data.branchId, date, data.nodeKey, user.id);
    }

    const dayScore = await this.recalculate(data.branchId, date, node.frequency);

    return {
      entry: { ...entry, done: true, score: leafScore || 100 },
      proof,
      dayScore,
      status: 'DONE',
      aiStatus,
      aiNote,
      aiFeedback,
      aiCoach: coach,
    };
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

    // Doimiy shablon: sana emas — filial + chastota. Transaction: partial empty assign yoʻq
    await this.prisma.$transaction(async (tx) => {
      await tx.kpiAssignmentTemplate.updateMany({
        where: { branchId: data.branchId, frequency: data.frequency },
        data: { active: false },
      });

      for (const nodeKey of validKeys) {
        await tx.kpiAssignmentTemplate.upsert({
          where: {
            branchId_frequency_nodeKey: {
              branchId: data.branchId,
              frequency: data.frequency,
              nodeKey,
            },
          },
          create: {
            branchId: data.branchId,
            frequency: data.frequency,
            nodeKey,
            assignedById: user.id,
            active: true,
          },
          update: {
            active: true,
            assignedById: user.id,
          },
        });
      }
    });

    return {
      ok: true,
      count: validKeys.length,
      frequency: data.frequency,
      persistent: true,
    };
  }

  /** Kategoriya (root) va sub-kategoriyalar — yangi vazifa qoʻshish uchun */
  async listCatalogParents(frequency: KpiFrequency) {
    const groups = await this.prisma.kpiCatalogNode.findMany({
      where: { active: true, frequency, inputType: KpiInputType.GROUP },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      select: {
        key: true,
        parentKey: true,
        titleUz: true,
        titleRu: true,
        sortOrder: true,
      },
    });
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
    const pathOf = (key: string, lang: 'uz' | 'ru') => {
      const parts: string[] = [];
      let cur: (typeof groups)[number] | undefined = byKey[key];
      const seen = new Set<string>();
      while (cur && !seen.has(cur.key)) {
        seen.add(cur.key);
        parts.unshift(lang === 'ru' ? cur.titleRu : cur.titleUz);
        cur = cur.parentKey ? byKey[cur.parentKey] : undefined;
      }
      return parts.join(' › ');
    };
    const roots = groups.filter((g) => !g.parentKey);
    const underRoot = (rootKey: string) => {
      const out: typeof groups = [];
      const walk = (pk: string) => {
        for (const g of groups.filter((x) => x.parentKey === pk)) {
          out.push(g);
          walk(g.key);
        }
      };
      walk(rootKey);
      return out;
    };
    return roots.map((root) => ({
      key: root.key,
      titleUz: root.titleUz,
      titleRu: root.titleRu,
      pathUz: pathOf(root.key, 'uz'),
      pathRu: pathOf(root.key, 'ru'),
      subs: underRoot(root.key).map((s) => ({
        key: s.key,
        parentKey: s.parentKey,
        titleUz: s.titleUz,
        titleRu: s.titleRu,
        pathUz: pathOf(s.key, 'uz'),
        pathRu: pathOf(s.key, 'ru'),
      })),
    }));
  }

  async createCatalogTask(
    user: { id: string; role: Role },
    data: {
      titleUz: string;
      titleRu?: string;
      descriptionUz?: string;
      descriptionRu?: string;
      frequency: KpiFrequency;
      parentKey: string;
      proofRequired?: boolean;
      inputType?: string;
    },
  ) {
    if (user.role === Role.MANAGER) {
      throw new ForbiddenException('Faqat admin vazifa qoʻsha oladi');
    }
    const titleUz = (data.titleUz || '').trim();
    if (titleUz.length < 2) {
      throw new BadRequestException('Vazifa nomi kerak');
    }
    const parent = await this.prisma.kpiCatalogNode.findUnique({
      where: { key: data.parentKey },
    });
    if (!parent || !parent.active) {
      throw new NotFoundException('Kategoriya topilmadi');
    }
    if (parent.inputType !== KpiInputType.GROUP) {
      throw new BadRequestException('Faqat kategoriya / sub-kategoriyaga qoʻshiladi');
    }
    if (parent.frequency !== data.frequency) {
      throw new BadRequestException('Kategoriya chastotasi mos kelmaydi');
    }

    const titleRu = (data.titleRu || '').trim() || titleUz;
    const descriptionUz = (data.descriptionUz || '').trim() || null;
    const descriptionRu = (data.descriptionRu || '').trim() || descriptionUz;
    const inputType =
      data.inputType === 'NUMBER'
        ? KpiInputType.NUMBER
        : data.inputType === 'RATIO'
          ? KpiInputType.RATIO
          : data.inputType === 'NOTE_CHECK'
            ? KpiInputType.NOTE_CHECK
            : KpiInputType.CHECKBOX;

    const slug = slugifyKey(titleUz);
    let key = `${parent.key}.${slug}`;
    let n = 0;
    while (await this.prisma.kpiCatalogNode.findUnique({ where: { key } })) {
      n += 1;
      key = `${parent.key}.${slug}_${n}`;
      if (n > 50) throw new BadRequestException('Kalit yaratib boʻlmadi');
    }

    const siblings = await this.prisma.kpiCatalogNode.count({
      where: { parentKey: parent.key },
    });

    const node = await this.prisma.kpiCatalogNode.create({
      data: {
        key,
        parentKey: parent.key,
        titleUz,
        titleRu,
        descriptionUz,
        descriptionRu,
        inputType,
        frequency: data.frequency,
        sortOrder: siblings + 1,
        proofRequired: !!data.proofRequired,
        weight: 0,
        active: true,
      },
    });

    return {
      ok: true,
      node: {
        key: node.key,
        parentKey: node.parentKey,
        titleUz: node.titleUz,
        titleRu: node.titleRu,
        descriptionUz: node.descriptionUz,
        descriptionRu: node.descriptionRu,
        frequency: node.frequency,
        inputType: node.inputType,
        proofRequired: node.proofRequired,
      },
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

    const approveScore = data.approve
      ? this.scoreLeaf(
          node?.inputType || KpiInputType.CHECKBOX,
          proof.entry.value,
          true,
        ) || (typeof proof.entry.score === 'number' && proof.entry.score > 0
          ? proof.entry.score
          : 100)
      : 0;

    await this.prisma.kpiDayEntry.update({
      where: { id: proof.entryId },
      data: {
        done: data.approve,
        score: approveScore,
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

    // Virtual izoh.txt — diskda fayl yoʻq; shu entrydagi haqiqiy rasmni qaytaramiz
    const isVirtualNote =
      proof.mimeType === 'text/plain' ||
      proof.fileName === 'izoh.txt' ||
      String(proof.path || '').startsWith('note-only/');

    if (isVirtualNote) {
      const real = await this.prisma.kpiProof.findFirst({
        where: {
          entryId: proof.entryId,
          NOT: {
            OR: [
              { mimeType: 'text/plain' },
              { fileName: 'izoh.txt' },
              { path: { startsWith: 'note-only/' } },
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (real) {
        const fullReal = path.resolve(this.uploadRoot, real.path);
        const root = path.resolve(this.uploadRoot);
        if (
          (fullReal.startsWith(root + path.sep) || fullReal === root) &&
          fs.existsSync(fullReal)
        ) {
          return { proof: real, full: fullReal };
        }
      }
      // Haqiqiy fayl yoʻq — izoh matnini qaytaramiz
      const note =
        (proof.entry.value as any)?.note ||
        proof.aiFeedback ||
        proof.aiNote ||
        'Izoh';
      const tmpDir = path.join(this.uploadRoot, '_notes');
      fs.mkdirSync(tmpDir, { recursive: true });
      const tmp = path.join(tmpDir, `${proof.id}.txt`);
      fs.writeFileSync(tmp, String(note), 'utf8');
      return {
        proof: { ...proof, mimeType: 'text/plain', fileName: 'izoh.txt' },
        full: tmp,
      };
    }

    const full = path.resolve(this.uploadRoot, proof.path);
    const root = path.resolve(this.uploadRoot);
    if (!full.startsWith(root + path.sep) && full !== root) {
      throw new ForbiddenException();
    }
    if (!fs.existsSync(full)) throw new NotFoundException('Fayl topilmadi');
    return { proof, full };
  }
}
