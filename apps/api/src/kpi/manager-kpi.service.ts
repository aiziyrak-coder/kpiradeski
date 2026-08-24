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
import { Cron } from '@nestjs/schedule';
import { BUSINESS_TZ, colorStatus, toDateOnly } from '../common/kpi.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { scoreIcon, tgCard, tgEscape } from '../telegram/tg-format';
import { CalendarService } from '../common/calendar.service';
import { seedKpiCatalog } from '../../prisma/seed-catalog';
import { ATTENDANCE_NODE_KEY } from '../attendance/attendance.constants';
import { isCompanyWideTaskKey } from '../common/company-wide-tasks';
import { evalTaskWindow, formatHm, tashkentClock } from '../common/task-window';
import { cheapFingerprint, readJpegExifLocal, sha256Hex } from '../common/proof-integrity';
import { ensureJpegBuffer, isHeicBuffer } from '../common/heic-to-jpeg';

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
    private notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    fs.mkdirSync(this.uploadRoot, { recursive: true });
    try {
      await seedKpiCatalog(this.prisma as any, { syncExisting: false });
      this.logger.log('KPI katalog sync (create-missing only)');
      // Har bir leaf ish uchun rasm+izoh majburiy
      const updated = await this.prisma.kpiCatalogNode.updateMany({
        where: {
          inputType: { not: KpiInputType.GROUP },
          NOT: { key: ATTENDANCE_NODE_KEY },
        },
        data: { proofRequired: true },
      });
      if (updated.count) this.logger.log(`proofRequired=true: ${updated.count} vazifa`);
      const shared = await this.prisma.kpiCatalogNode.updateMany({
        where: {
          inputType: { not: KpiInputType.GROUP },
          OR: [
            { key: { startsWith: 'smm.' } },
            { key: { startsWith: 'smm_w.' } },
            { key: { startsWith: 'smm_m.' } },
            { key: { startsWith: 'marketing.' } },
            { key: { startsWith: 'marketing_w.' } },
            { key: { startsWith: 'marketing_m.' } },
            { key: { startsWith: 'seo.' } },
            { key: { contains: '.seo.' } },
            { key: { endsWith: '.seo' } },
          ],
        },
        data: { sharedAcrossBranches: true },
      });
      if (shared.count) this.logger.log(`sharedAcrossBranches: ${shared.count} SEO/SMM/marketing`);
      await this.migrateCadenceAssignments();
      await this.restoreDailySeoAssignments();
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

  /**
   * Kunlikda qolgan post/SEO/kontent ishlarini haftalik/oylikka koʻchirish.
   * Eski topshiriq o‘chadi, yangi chastotada ochiladi.
   */
  private async migrateCadenceAssignments() {
    const moves: Array<{ from: string; to: string; toFreq: KpiFrequency }> = [
      { from: 'smm.seo.content', to: 'smm_m.strategy.content_plan', toFreq: KpiFrequency.MONTHLY },
      { from: 'smm.seo.article', to: 'smm_w.seo.articles_week', toFreq: KpiFrequency.WEEKLY },
      { from: 'smm.seo.video', to: 'smm_w.seo.videos_week', toFreq: KpiFrequency.WEEKLY },
      { from: 'smm.seo.faq_schema', to: 'smm_m.seo.schema', toFreq: KpiFrequency.MONTHLY },
      { from: 'smm.social.ig_post', to: 'smm_w.content.ig_post', toFreq: KpiFrequency.WEEKLY },
      { from: 'smm.social.tg', to: 'smm_w.content.tg', toFreq: KpiFrequency.WEEKLY },
      { from: 'smm.social.stats', to: 'smm_w.content.analytics', toFreq: KpiFrequency.WEEKLY },
      { from: 'marketing.offline.partners', to: 'marketing_w.growth.partners', toFreq: KpiFrequency.WEEKLY },
      { from: 'marketing.offline.promo', to: 'marketing_w.growth.ads_report', toFreq: KpiFrequency.WEEKLY },
    ];

    const fromKeys = moves.map((m) => m.from);
    const rows = await this.prisma.kpiAssignmentTemplate.findMany({
      where: { nodeKey: { in: fromKeys }, active: true, frequency: KpiFrequency.DAILY },
      select: { id: true, branchId: true, nodeKey: true },
    });
    if (!rows.length) return;

    const toByFrom = new Map(moves.map((m) => [m.from, m]));
    let n = 0;
    for (const row of rows) {
      const spec = toByFrom.get(row.nodeKey);
      if (!spec) continue;
      await this.prisma.kpiAssignmentTemplate.upsert({
        where: {
          branchId_frequency_nodeKey: {
            branchId: row.branchId,
            frequency: spec.toFreq,
            nodeKey: spec.to,
          },
        },
        create: {
          branchId: row.branchId,
          frequency: spec.toFreq,
          nodeKey: spec.to,
          active: true,
        },
        update: { active: true },
      });
      if (row.nodeKey === 'smm.social.ig_post') {
        await this.prisma.kpiAssignmentTemplate.upsert({
          where: {
            branchId_frequency_nodeKey: {
              branchId: row.branchId,
              frequency: KpiFrequency.WEEKLY,
              nodeKey: 'smm_w.content.reels',
            },
          },
          create: {
            branchId: row.branchId,
            frequency: KpiFrequency.WEEKLY,
            nodeKey: 'smm_w.content.reels',
            active: true,
          },
          update: { active: true },
        });
      }
      await this.prisma.kpiAssignmentTemplate.update({
        where: { id: row.id },
        data: { active: false },
      });
      n += 1;
    }
    if (n) this.logger.log(`Cadence migrate: ${n} kunlik topshiriq → hafta/oy`);

    const weeklyPosts = await this.prisma.kpiAssignmentTemplate.findMany({
      where: {
        frequency: KpiFrequency.WEEKLY,
        active: true,
        nodeKey: 'smm_w.content.ig_post',
      },
      select: { branchId: true },
    });
    for (const { branchId } of weeklyPosts) {
      await this.prisma.kpiAssignmentTemplate.upsert({
        where: {
          branchId_frequency_nodeKey: {
            branchId,
            frequency: KpiFrequency.WEEKLY,
            nodeKey: 'smm_w.content.reels',
          },
        },
        create: {
          branchId,
          frequency: KpiFrequency.WEEKLY,
          nodeKey: 'smm_w.content.reels',
          active: true,
        },
        update: { active: true },
      });
    }

    const weeklyPlans = await this.prisma.kpiAssignmentTemplate.findMany({
      where: {
        frequency: KpiFrequency.WEEKLY,
        active: true,
        nodeKey: 'smm_w.content.plan',
      },
      select: { id: true, branchId: true },
    });
    for (const row of weeklyPlans) {
      await this.prisma.kpiAssignmentTemplate.upsert({
        where: {
          branchId_frequency_nodeKey: {
            branchId: row.branchId,
            frequency: KpiFrequency.MONTHLY,
            nodeKey: 'smm_m.strategy.content_plan',
          },
        },
        create: {
          branchId: row.branchId,
          frequency: KpiFrequency.MONTHLY,
          nodeKey: 'smm_m.strategy.content_plan',
          active: true,
        },
        update: { active: true },
      });
      await this.prisma.kpiAssignmentTemplate.update({
        where: { id: row.id },
        data: { active: false },
      });
    }
    if (weeklyPlans.length) {
      this.logger.log(`Kontent-reja: ${weeklyPlans.length} topshiriq → oylik`);
    }

    const smmBranches = await this.prisma.kpiAssignmentTemplate.findMany({
      where: {
        active: true,
        OR: [{ nodeKey: { startsWith: 'smm_w.' } }, { nodeKey: { startsWith: 'smm_m.' } }, { nodeKey: { startsWith: 'smm.' } }],
      },
      select: { branchId: true },
      distinct: ['branchId'],
    });
    for (const { branchId } of smmBranches) {
      await this.prisma.kpiAssignmentTemplate.upsert({
        where: {
          branchId_frequency_nodeKey: {
            branchId,
            frequency: KpiFrequency.MONTHLY,
            nodeKey: 'smm_m.strategy.content_plan',
          },
        },
        create: {
          branchId,
          frequency: KpiFrequency.MONTHLY,
          nodeKey: 'smm_m.strategy.content_plan',
          active: true,
        },
        update: { active: true },
      });
    }

    // Uniforma haftalik → oylik
    const uniformMoves = [
      { from: 'uniform_w.stock.count', to: 'uniform_m.stock.count' },
      { from: 'uniform_w.stock.laundry', to: 'uniform_m.stock.laundry' },
      { from: 'uniform_w.stock.order', to: 'uniform_m.stock.order' },
    ];
    const uniRows = await this.prisma.kpiAssignmentTemplate.findMany({
      where: {
        nodeKey: { in: uniformMoves.map((m) => m.from) },
        active: true,
        frequency: KpiFrequency.WEEKLY,
      },
      select: { id: true, branchId: true, nodeKey: true },
    });
    const uniMap = new Map(uniformMoves.map((m) => [m.from, m.to]));
    for (const row of uniRows) {
      const toKey = uniMap.get(row.nodeKey);
      if (!toKey) continue;
      await this.prisma.kpiAssignmentTemplate.upsert({
        where: {
          branchId_frequency_nodeKey: {
            branchId: row.branchId,
            frequency: KpiFrequency.MONTHLY,
            nodeKey: toKey,
          },
        },
        create: {
          branchId: row.branchId,
          frequency: KpiFrequency.MONTHLY,
          nodeKey: toKey,
          active: true,
        },
        update: { active: true },
      });
      await this.prisma.kpiAssignmentTemplate.update({
        where: { id: row.id },
        data: { active: false },
      });
    }
    if (uniRows.length) {
      this.logger.log(`Uniforma: ${uniRows.length} haftalik → oylik`);
    }

    // Barcha uniforma filiallariga oylik stock assign
    const uniBranches = await this.prisma.kpiAssignmentTemplate.findMany({
      where: {
        active: true,
        nodeKey: { startsWith: 'uniform' },
      },
      select: { branchId: true },
      distinct: ['branchId'],
    });
    for (const { branchId } of uniBranches) {
      for (const key of ['uniform_m.stock.count', 'uniform_m.stock.laundry', 'uniform_m.stock.order']) {
        await this.prisma.kpiAssignmentTemplate.upsert({
          where: {
            branchId_frequency_nodeKey: {
              branchId,
              frequency: KpiFrequency.MONTHLY,
              nodeKey: key,
            },
          },
          create: { branchId, frequency: KpiFrequency.MONTHLY, nodeKey: key, active: true },
          update: { active: true },
        });
      }
    }
  }

  /** Kunlik SEO tekshiruvlarini qayta ochish (maqola/video/reja haftalikda qoladi). */
  private async restoreDailySeoAssignments() {
    const dailyKeys = [
      'smm.seo.speed',
      'smm.seo.links',
      'smm.seo.meta',
      'smm.seo.images_alt',
      'smm.seo.search_console',
      'smm.seo.internal_links',
    ];
    const weeklyDupes = [
      'smm_w.seo.speed',
      'smm_w.seo.links',
      'smm_w.seo.meta',
      'smm_w.seo.images_alt',
      'smm_w.seo.search_console',
      'smm_w.seo.internal_links',
    ];
    const branchRows = await this.prisma.kpiAssignmentTemplate.findMany({
      where: {
        active: true,
        OR: [
          { nodeKey: { startsWith: 'smm.' } },
          { nodeKey: { startsWith: 'smm_w.' } },
          { nodeKey: { startsWith: 'smm_m.' } },
        ],
      },
      select: { branchId: true },
      distinct: ['branchId'],
    });
    let n = 0;
    for (const { branchId } of branchRows) {
      for (const nodeKey of dailyKeys) {
        await this.prisma.kpiAssignmentTemplate.upsert({
          where: {
            branchId_frequency_nodeKey: {
              branchId,
              frequency: KpiFrequency.DAILY,
              nodeKey,
            },
          },
          create: {
            branchId,
            frequency: KpiFrequency.DAILY,
            nodeKey,
            active: true,
          },
          update: { active: true },
        });
        n += 1;
      }
    }
    const off = await this.prisma.kpiAssignmentTemplate.updateMany({
      where: { nodeKey: { in: weeklyDupes }, frequency: KpiFrequency.WEEKLY },
      data: { active: false },
    });
    if (n || off.count) {
      this.logger.log(`Daily SEO restore: ${n} kunlik, ${off.count} dublikat haftalik o‘chirildi`);
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
    const assignments = await this.prisma.kpiAssignmentTemplate.findMany({
      where: { branchId, frequency, active: true },
    });
    const assignedKeys = new Set(assignments.map((a) => a.nodeKey));
    await this.syncSharedInbound(branchId, date, frequency, [...assignedKeys]);

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
            path: true,
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

    const markAssigned = (nodes: any[]): any[] =>
      nodes.map((n) => ({
        ...n,
        assigned: assignedKeys.has(n.key),
        children: markAssigned(n.children || []),
      }));

    const tree = markAssigned(buildTree(null));

    const attTotal = await this.prisma.branchEmployee.count({
      where: { branchId, active: true },
    });
    const attRows = await this.prisma.employeeAttendance.findMany({
      where: { branchId, date },
      select: { status: true },
    });
    const attArrived = attRows.filter(
      (a) => a.status === 'ON_TIME' || a.status === 'LATE',
    ).length;
    const attLate = attRows.filter((a) => a.status === 'LATE').length;

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
        const displayProof = approvedProof || pendingProof || rejectedProof || proofs[0] || null;
        const realFiles = proofs.filter(
          (p) =>
            p.mimeType !== 'text/plain' &&
            p.fileName !== 'izoh.txt' &&
            !String(p.fileName || '').endsWith('.txt') &&
            !String(p.path || '').startsWith('note-only/'),
        );
        const titles = titleOf(n.key);
        const dateISO = date.toISOString().slice(0, 10);
        const window = evalTaskWindow(n.windowStartMin, n.windowEndMin, { dateISO });
        let status: 'TODO' | 'PENDING' | 'REJECTED' | 'DONE' | 'EXPIRED' = 'TODO';
        if (approvedProof || entry?.done) status = 'DONE';
        else if (pendingProof) status = 'PENDING';
        else if (rejectedProof) status = 'REJECTED';
        else if (window.status === 'expired') status = 'EXPIRED';
        else status = 'TODO';

        const isAttendance = n.key === ATTENDANCE_NODE_KEY;
        if (isAttendance && attArrived > 0) status = 'DONE';

        const viewProof =
          realFiles.find((p) => p.aiStatus === AiProofStatus.APPROVED) ||
          realFiles.find((p) => p.aiStatus === AiProofStatus.PENDING) ||
          realFiles[0] ||
          null;

        return {
          key: n.key,
          ...titles,
          descriptionUz: n.descriptionUz || null,
          descriptionRu: n.descriptionRu || null,
          inputType: n.inputType,
          proofRequired: n.proofRequired,
          done: status === 'DONE',
          score: entry?.score ?? null,
          value: entry?.value ?? null,
          status,
          aiStatus: displayProof?.aiStatus ?? null,
          aiNote: displayProof?.aiNote ?? null,
          aiFeedback: displayProof?.aiFeedback ?? null,
          proof: viewProof
            ? {
                id: viewProof.id,
                fileName: viewProof.fileName,
                mimeType: viewProof.mimeType,
                aiStatus: viewProof.aiStatus,
                createdAt: viewProof.createdAt,
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
          window,
          isAttendance,
          sharedAcrossBranches: !!n.sharedAcrossBranches,
          sharedFromOtherBranch: !!(
            entry?.value &&
            typeof entry.value === 'object' &&
            (entry.value as any).shared &&
            (entry.value as any).sourceBranchId &&
            (entry.value as any).sourceBranchId !== branchId
          ),
          attendance: isAttendance
            ? { arrived: attArrived, total: attTotal, late: attLate }
            : undefined,
          canSubmit: isAttendance
            ? true
            : status === 'TODO' || status === 'REJECTED'
              ? window.status === 'none' || window.status === 'open'
              : false,
        };
      });

    const isManager = user.role === Role.MANAGER;
    const pending = rows.filter((r) => r.status === 'TODO' || r.status === 'REJECTED');
    const expired = rows.filter((r) => r.status === 'EXPIRED');
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
      expired,
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
    if (type === KpiInputType.NUMBER) {
      const n = Number(value?.count ?? value);
      return Number.isFinite(n) && n >= 0 && value?.count !== undefined && value?.count !== '';
    }
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
      if (!done) return 0;
      const n = Number(value?.count ?? value ?? 0);
      if (!Number.isFinite(n) || n < 0) return 70;
      return 100;
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

    if (node.key === ATTENDANCE_NODE_KEY) {
      throw new BadRequestException('Davomat skaner orqali yopiladi — rasm/izoh yuborilmaydi');
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

    const dateISO = date.toISOString().slice(0, 10);
    const window = evalTaskWindow(node.windowStartMin, node.windowEndMin, { dateISO });
    if (window.status === 'upcoming') {
      throw new BadRequestException(
        `Bu ishni hozir yopib boʻlmaydi. Vaqt: ${window.startLabel}–${window.endLabel} (Toshkent). Hali ochilmagan.`,
      );
    }
    if (window.status === 'expired') {
      throw new BadRequestException(
        `Vaqtidan oʻtib ketti (${window.startLabel}–${window.endLabel}). Bu ishni endi yopib boʻlmaydi.`,
      );
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
      const raw = value?.count ?? value;
      const count = Number(raw);
      if (raw === '' || raw == null || !Number.isFinite(count) || count < 0) {
        throw new BadRequestException('Sonini kiriting (0 ham boʻlishi mumkin)');
      }
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
      contentHash?: string | null;
      phash?: string | null;
    }> = [];

    for (const file of files) {
      let buf = file.buffer;
      let mime = String(file.mimetype || '').toLowerCase().trim();
      let originalname = file.originalname || 'photo.jpg';

      if (
        isHeicBuffer(buf, `${mime} ${originalname}`) ||
        mime === 'image/heic' ||
        mime === 'image/heif'
      ) {
        try {
          const jpeg = await ensureJpegBuffer(buf, `${mime} ${originalname}`);
          buf = jpeg.buffer;
          mime = 'image/jpeg';
          originalname = originalname.replace(/\.[^.]+$/, '') + '.jpg';
        } catch (e) {
          throw new BadRequestException(
            `iPhone HEIC ochilmadi: ${e instanceof Error ? e.message : 'qayta yuboring'}`,
          );
        }
      }

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

      // iPhone baʼzan boʻsh yoki notoʻgʻri MIME yuboradi — magic bytes bilan aniqlaymiz
      if (!mime || mime === 'application/octet-stream') {
        if (isJpeg) mime = 'image/jpeg';
        else if (isPng) mime = 'image/png';
        else if (isGif) mime = 'image/gif';
        else if (isWebp) mime = 'image/webp';
        else if (isPdf) mime = 'application/pdf';
        else if (/\.jpe?g$/i.test(originalname)) mime = 'image/jpeg';
        else if (/\.png$/i.test(originalname)) mime = 'image/png';
        else if (/\.webp$/i.test(originalname)) mime = 'image/webp';
        else if (/\.gif$/i.test(originalname)) mime = 'image/gif';
        else if (/\.pdf$/i.test(originalname)) mime = 'application/pdf';
      }
      if (mime === 'image/jpg') mime = 'image/jpeg';

      if (!ALLOWED_MIME.has(mime) || mime === 'image/svg+xml') {
        throw new BadRequestException(
          'Ruxsat etilmagan fayl turi — faqat rasm (JPEG/PNG/WebP/GIF/HEIC) yoki PDF/DOC/XLS',
        );
      }
      const claimsImage = mime.startsWith('image/');
      if (claimsImage && !(isJpeg || isPng || isGif || isWebp)) {
        throw new BadRequestException(
          'Rasm ochilmadi. JPEG/PNG/HEIC qilib yuboring.',
        );
      }
      if (mime === 'application/pdf' && !isPdf) {
        throw new BadRequestException('PDF fayl notoʻgʻri');
      }

      if (claimsImage) {
        const contentHash = sha256Hex(buf);
        const fp = cheapFingerprint(buf);
        const shared = node.sharedAcrossBranches || isCompanyWideTaskKey(data.nodeKey);
        const periodTask =
          node.frequency === KpiFrequency.WEEKLY || node.frequency === KpiFrequency.MONTHLY;
        const planKeys = new Set([
          'smm.seo.content',
          'smm_w.content.plan',
          'smm_m.strategy.content_plan',
          'smm_m.strategy.calendar',
          'smm_m.seo.plan_next',
        ]);
        const dup = await this.prisma.kpiProof.findFirst({
          where: {
            OR: periodTask || planKeys.has(data.nodeKey) ? [{ contentHash }] : [{ contentHash }, { phash: fp }],
            NOT: {
              entry: {
                branchId: data.branchId,
                date,
                nodeKey: data.nodeKey,
              },
            },
          },
          include: { entry: true },
          orderBy: { createdAt: 'desc' },
        });
        if (dup) {
          const sameTask = dup.entry.nodeKey === data.nodeKey;
          const samePlanFamily = planKeys.has(dup.entry.nodeKey) && planKeys.has(data.nodeKey);
          const sameDay = dup.entry.date.getTime() === date.getTime();
          if (shared && sameTask && dup.entry.branchId !== data.branchId) {
            const src = await this.prisma.kpiDayEntry.findUnique({
              where: { id: dup.entry.id },
              include: { proofs: true },
            });
            if (src && (src.done || src.proofs.length)) {
              await this.copySharedEntryToBranch(src, data.branchId, user.id);
              await this.recalculate(data.branchId, date, node.frequency);
              const copied = await this.prisma.kpiProof.findFirst({
                where: {
                  entry: { branchId: data.branchId, date, nodeKey: data.nodeKey },
                },
                orderBy: { createdAt: 'desc' },
              });
              return {
                ...(copied || dup),
                proofs: copied ? [copied] : [dup],
                filesCount: 1,
                sharedCopied: true,
              };
            }
          }
          if (!sameTask && !samePlanFamily) {
            // Qaysi vazifada ishlatilganini aytamiz — menejer nima qilishni bilsin
            const other = await this.prisma.kpiCatalogNode.findUnique({
              where: { key: dup.entry.nodeKey },
              select: { titleUz: true },
            });
            throw new BadRequestException(
              other
                ? `Bu aynan shu fayl «${other.titleUz}» vazifasiga yuborilgan. Shu ish uchun yangi surat oling — eski suratni qayta tanlamang.`
                : 'Bu aynan shu fayl boshqa vazifaga yuborilgan. Shu ish uchun yangi surat oling — eski suratni qayta tanlamang.',
            );
          }
          if (!sameDay && !periodTask && !samePlanFamily) {
            throw new BadRequestException(
              'Bu fayl oldingi kunda allaqachon yuborilgan. Bugungi vazifa uchun yangi foto/skrinshot oling.',
            );
          }
          if (!shared && dup.entry.branchId !== data.branchId) {
            throw new BadRequestException(
              'Bu rasm boshqa filialda yuborilgan. Har filial o‘z dalilini oladi.',
            );
          }
        }

        const taken = readJpegExifLocal(buf);
        if (!periodTask && !planKeys.has(data.nodeKey) && taken && taken.dateISO < dateISO) {
          const takenMs = Date.parse(`${taken.dateISO}T00:00:00Z`);
          const taskMs = Date.parse(`${dateISO}T00:00:00Z`);
          // 1 kun farq — telefon TZ/soat xatosi; 2+ kun — aniq eski rasm
          if (Number.isFinite(takenMs) && Number.isFinite(taskMs) && taskMs - takenMs >= 2 * 86400000) {
            throw new BadRequestException(
              `Rasm sanasi ${taken.dateISO}. Kechagi emas — bugungi yangi foto oling.`,
            );
          }
        }
        (file as any)._contentHash = contentHash;
        (file as any)._phash = fp;
        (file as any)._jpegBuf = buf;
      }

      const outBuf: Buffer = (file as any)._jpegBuf || buf;
      const safeName = `${Date.now()}-${validated.length}-${originalname.replace(/[^\w.\-]+/g, '_')}`;
      const rel = path.join(data.branchId, date.toISOString().slice(0, 10), safeName);
      const full = path.join(this.uploadRoot, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, outBuf);
      validated.push({
        originalname,
        mimetype: mime,
        size: outBuf.length,
        buffer: outBuf,
        rel: rel.replace(/\\/g, '/'),
        contentHash: (file as any)._contentHash || null,
        phash: (file as any)._phash || null,
      });
    }

    let aiStatus: AiProofStatus = AiProofStatus.PENDING;
    let aiNote: string | null = 'AI tekshiruvda...';
    let aiFeedback: string | null = null;
    let aiAction: AiAction = AiAction.NONE;
    let aiPenalty = 0;
    let aiScore = 0;

    const imageFiles = validated.filter((f) => f.mimetype.startsWith('image/'));
    const noteStr = value?.note != null ? String(value.note).trim() : '';
    if (!noteStr || noteStr.length < 8) {
      throw new BadRequestException('Izoh kamida 8 belgi — nima qilganingizni yozing');
    }
    if (!imageFiles.length) {
      throw new BadRequestException('Kamida 1 ta rasm yuklash majburiy');
    }

    if (imageFiles.length) {
      // Ota-blok nomi AI ga kontekst beradi (masalan «Klinikani yopish · Musiqani oʻchirish»)
      const parentNode = node.parentKey
        ? await this.prisma.kpiCatalogNode.findUnique({
            where: { key: node.parentKey },
            select: { titleUz: true },
          })
        : null;
      const vision = await openaiVisionProof({
        title: parentNode
          ? `${parentNode.titleUz} · ${node.titleUz} / ${node.titleRu}`
          : `${node.titleUz} / ${node.titleRu}`,
        description: node.descriptionUz || node.descriptionRu,
        images: imageFiles.map((f) => ({
          mimeType: f.mimetype,
          base64: f.buffer.toString('base64'),
        })),
        frequency: node.frequency,
        managerNote: noteStr,
        windowLabel:
          window.startLabel && window.endLabel
            ? `${window.startLabel}–${window.endLabel}`
            : null,
        nowLabel: (() => {
          const c = tashkentClock();
          return `${c.dateISO} ${formatHm(c.minutes)}`;
        })(),
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
          contentHash: f.contentHash || null,
          phash: f.phash || (f.contentHash ? f.contentHash.slice(0, 16) : null),
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
    if (node.sharedAcrossBranches) {
      await this.propagateSharedCompletion(data.branchId, date, data.nodeKey, user.id);
    }

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

    // Har bir ish: rasm + izoh majburiy — faqat izoh bilan yakunlash mumkin emas
    throw new BadRequestException(
      'Har bir ish uchun rasm va izoh majburiy — rasm yuklab yuboring',
    );
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
      companyWide: isCompanyWideTaskKey(root.key),
      subs: underRoot(root.key).map((s) => ({
        key: s.key,
        parentKey: s.parentKey,
        titleUz: s.titleUz,
        titleRu: s.titleRu,
        pathUz: pathOf(s.key, 'uz'),
        pathRu: pathOf(s.key, 'ru'),
        companyWide: isCompanyWideTaskKey(s.key),
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
      sharedAcrossBranches?: boolean;
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
        proofRequired: true,
        weight: 0,
        active: true,
        sharedAcrossBranches:
          typeof data.sharedAcrossBranches === 'boolean'
            ? data.sharedAcrossBranches
            : isCompanyWideTaskKey(key) || isCompanyWideTaskKey(parent.key),
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
      if (node.sharedAcrossBranches) {
        await this.propagateSharedCompletion(
          proof.entry.branchId,
          proof.entry.date,
          proof.entry.nodeKey,
          user.id,
        );
      }
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

  private async syncSharedInbound(
    branchId: string,
    date: Date,
    frequency: KpiFrequency,
    assignedKeys: string[],
  ) {
    if (!assignedKeys.length) return;
    const shared = await this.prisma.kpiCatalogNode.findMany({
      where: {
        sharedAcrossBranches: true,
        frequency,
        active: true,
        key: { in: assignedKeys },
      },
      select: { key: true },
    });
    if (!shared.length) return;
    const keys = shared.map((s) => s.key);
    const localEntries = await this.prisma.kpiDayEntry.findMany({
      where: { branchId, date, nodeKey: { in: keys } },
      include: { proofs: { take: 1, select: { id: true } } },
    });
    const localByKey = new Map(localEntries.map((e) => [e.nodeKey, e]));
    const need = keys.filter((k) => {
      const loc = localByKey.get(k);
      if (!loc) return true;
      if (loc.done) return false;
      return true;
    });
    if (!need.length) return;

    const sources = await this.prisma.kpiDayEntry.findMany({
      where: {
        date,
        nodeKey: { in: need },
        branchId: { not: branchId },
        OR: [{ done: true }, { proofs: { some: {} } }],
      },
      include: { proofs: true },
      orderBy: { updatedAt: 'desc' },
    });
    const byKey = new Map<string, (typeof sources)[0]>();
    for (const s of sources) {
      const prev = byKey.get(s.nodeKey);
      if (!prev || (s.done && !prev.done)) byKey.set(s.nodeKey, s);
    }
    if (!byKey.size) return;
    let copied = 0;
    for (const src of byKey.values()) {
      const loc = localByKey.get(src.nodeKey);
      if (!src.done && loc?.proofs?.length) continue;
      await this.copySharedEntryToBranch(src, branchId, src.userId || undefined);
      copied += 1;
    }
    if (copied) await this.recalculate(branchId, date, frequency);
  }

  private async propagateSharedCompletion(
    sourceBranchId: string,
    date: Date,
    nodeKey: string,
    userId: string,
  ) {
    const node = await this.prisma.kpiCatalogNode.findUnique({
      where: { key: nodeKey },
      select: { sharedAcrossBranches: true, frequency: true },
    });
    if (!node?.sharedAcrossBranches) return;
    const source = await this.prisma.kpiDayEntry.findUnique({
      where: {
        branchId_date_nodeKey: { branchId: sourceBranchId, date, nodeKey },
      },
      include: { proofs: true },
    });
    if (!source || (!source.done && !source.proofs.length)) return;
    const others = await this.prisma.kpiAssignmentTemplate.findMany({
      where: {
        nodeKey,
        frequency: node.frequency,
        active: true,
        branchId: { not: sourceBranchId },
      },
      select: { branchId: true },
    });
    for (const o of others) {
      await this.copySharedEntryToBranch(source, o.branchId, userId);
      await this.recalculate(o.branchId, date, node.frequency);
    }
  }

  private async copySharedEntryToBranch(
    source: {
      branchId: string;
      date: Date;
      nodeKey: string;
      value: any;
      done?: boolean;
      score: number | null;
      userId: string | null;
      proofs: Array<{
        userId: string;
        fileName: string;
        mimeType: string;
        path: string;
        size: number;
        contentHash: string | null;
        phash: string | null;
        aiStatus: AiProofStatus;
        aiNote: string | null;
        aiFeedback: string | null;
        aiAction: AiAction;
        aiPenalty: number;
      }>;
    },
    targetBranchId: string,
    userId?: string,
  ) {
    if (targetBranchId === source.branchId) return;
    const uid = userId || source.userId;
    const done = !!source.done;
    const value =
      source.value && typeof source.value === 'object'
        ? { ...(source.value as object), shared: true, sourceBranchId: source.branchId }
        : { shared: true, sourceBranchId: source.branchId, note: (source.value as any)?.note };
    const entry = await this.prisma.kpiDayEntry.upsert({
      where: {
        branchId_date_nodeKey: {
          branchId: targetBranchId,
          date: source.date,
          nodeKey: source.nodeKey,
        },
      },
      create: {
        branchId: targetBranchId,
        date: source.date,
        nodeKey: source.nodeKey,
        value: value as any,
        done,
        score: done ? source.score ?? 100 : source.score ?? 0,
        userId: uid,
      },
      update: {
        done,
        score: done ? source.score ?? 100 : source.score ?? 0,
        userId: uid,
        value: value as any,
      },
    });
    await this.prisma.kpiProof.deleteMany({ where: { entryId: entry.id } });
    if (source.proofs?.length) {
      for (const p of source.proofs) {
        await this.prisma.kpiProof.create({
          data: {
            entryId: entry.id,
            userId: p.userId,
            fileName: p.fileName,
            mimeType: p.mimeType,
            path: p.path,
            size: p.size,
            contentHash: p.contentHash,
            phash: p.phash,
            aiStatus: p.aiStatus,
            aiNote: p.aiNote,
            aiFeedback: p.aiFeedback,
            aiAction: p.aiAction,
            aiPenalty: p.aiPenalty,
          },
        });
      }
    }
    await this.rollupParents(targetBranchId, source.date, source.nodeKey, uid || targetBranchId);
  }

  async getProofFile(proofId: string, user: { id: string; role: Role }) {
    const proof = await this.prisma.kpiProof.findUnique({
      where: { id: proofId },
      include: { entry: true },
    });
    if (!proof) throw new NotFoundException();
    const sharedNode = await this.prisma.kpiCatalogNode.findUnique({
      where: { key: proof.entry.nodeKey },
      select: { sharedAcrossBranches: true },
    });
    if (sharedNode?.sharedAcrossBranches) {
      if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
        const link = await this.prisma.branchManager.findFirst({
          where: { userId: user.id },
        });
        if (!link) throw new ForbiddenException('Ruxsat yoʻq');
      }
    } else {
      await this.branches.assertCanAccessBranch(user.id, user.role, proof.entry.branchId);
    }

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

  /** Haftalik KPI ijrosi — har shanba 18:00 (Asia/Tashkent) Telegram guruhga */
  @Cron('0 18 * * 6', { timeZone: BUSINESS_TZ })
  async weeklyExecutionReportCron() {
    try {
      await this.sendWeeklyExecutionReport();
    } catch (e) {
      this.logger.warn(`Haftalik hisobot yuborilmadi: ${e}`);
    }
  }

  /** Joriy hafta (dushanba–yakshanba) boʻyicha WEEKLY vazifalar ijrosi */
  async sendWeeklyExecutionReport() {
    const periodStart = periodDate(KpiFrequency.WEEKLY);
    const periodEnd = new Date(
      Date.UTC(
        periodStart.getUTCFullYear(),
        periodStart.getUTCMonth(),
        periodStart.getUTCDate() + 6,
      ),
    );
    const branches = await this.prisma.branch.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (!branches.length) return { sent: false, reason: 'filial yoʻq' };

    const admin = { id: 'system', role: Role.SUPER_ADMIN };
    const lines: string[] = [];
    let totalAssigned = 0;
    let totalDone = 0;

    for (const branch of branches) {
      let day: any;
      try {
        day = await this.getDay(
          admin,
          branch.id,
          periodStart.toISOString().slice(0, 10),
          KpiFrequency.WEEKLY,
        );
      } catch (e) {
        this.logger.warn(`weekly report ${branch.name}: ${e}`);
        continue;
      }
      const rows = day.rows || [];
      if (!rows.length) continue;
      const done = day.completed?.length ?? 0;
      const review = day.inReview?.length ?? 0;
      const pending = day.pending?.length ?? 0;
      totalAssigned += rows.length;
      totalDone += done;

      const pctDone = rows.length ? Math.round((done / rows.length) * 100) : 0;
      lines.push(
        `${scoreIcon(pctDone)} <b>${tgEscape(branch.name)}</b> — <b>${done}/${rows.length}</b> (${pctDone}%)`,
      );
      if (review) lines.push(`   🕵️ tekshiruvda: ${review}`);
      if (pending) {
        const names = (day.pending || [])
          .slice(0, 5)
          .map((r: any) => tgEscape(String(r.titleUz || r.key)))
          .join(', ');
        lines.push(`   ⛔ bajarilmagan ${pending}: ${names}${pending > 5 ? ' …' : ''}`);
      }
    }

    if (!lines.length) return { sent: false, reason: 'haftalik vazifa biriktirilmagan' };

    const avgPct = totalAssigned ? Math.round((totalDone / totalAssigned) * 100) : 0;
    const period = `${periodStart.toISOString().slice(0, 10)} — ${periodEnd.toISOString().slice(0, 10)}`;
    const html = tgCard({
      emoji: '📆',
      category: 'Haftalik hisobot',
      title: `Haftalik vazifalar ijrosi · ${avgPct}%`,
      meta: [period, `${totalDone}/${totalAssigned} bajarildi`],
      htmlLines: lines,
      compact: true,
      actions: '/hafta · /vazifalar',
      footer: 'Yakshanbagacha yopilmagan ishlar keyingi haftaga oʻtmaydi.',
    });

    await this.notifications.sendTelegram(html);
    await this.notifications.createForRoles(
      ['DIRECTOR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'],
      'Haftalik vazifalar ijrosi',
      `${period}: ${totalDone}/${totalAssigned} bajarildi (${avgPct}%)`,
      'SYSTEM',
      { telegram: false },
    );
    return { sent: true, period, totalDone, totalAssigned, avgPct };
  }
}
