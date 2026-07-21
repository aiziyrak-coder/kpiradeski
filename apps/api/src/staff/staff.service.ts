import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Role, TaskStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { toDateOnly, BUSINESS_TZ } from '../common/kpi.constants';
import { openaiChat } from '../common/openai';
import { CalendarService } from '../common/calendar.service';
import {
  mapUserWithPosition,
  positionLabel,
  POSITION_SELECT,
} from '../common/position.util';

const TASK_ROLES: Role[] = [Role.STAFF, Role.ADMIN];

/** KPI blok → vazifa sarlavha kalitlari (avto-tasdiq) */
const KPI_TASK_MATCH: Record<string, string[]> = {
  clinic: ['klinika', 'ko\'rigi', 'kor igi'],
  reception: ['retsepshn', 'ochilish'],
  uniform: ['uniforma'],
  warehouse: ['ombor chek', 'ombor'],
  calls: ['qo\'ng\'iroq', 'qongiroq'],
  reviews: ['sharh'],
  seo: ['seo', 'sayt'],
  social: ['kontent', 'stories', 'reels', 'post'],
  ads: ['reklama', 'tv'],
};

@Injectable()
export class StaffService implements OnModuleInit {
  private readonly logger = new Logger(StaffService.name);
  private uploadRoot = path.join(process.cwd(), 'uploads', 'proofs');

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsService))
    private notifications: NotificationsService,
    @Inject(forwardRef(() => TelegramBotService))
    private telegram: TelegramBotService,
    private calendar: CalendarService,
  ) {
    fs.mkdirSync(this.uploadRoot, { recursive: true });
  }

  async onModuleInit() {
    try {
      const info = await this.calendar.getDayInfo();
      if (info.restDay) {
        this.logger.log(`Dam olish (${info.date}) — spawn o‘tkazildi`);
        return;
      }
      await this.spawnAllToday('server-start');
    } catch (e) {
      this.logger.warn(`Startup task spawn: ${e}`);
    }
  }

  async listPositions(activeOnly = true) {
    return this.prisma.position.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { nameUz: 'asc' }],
      select: POSITION_SELECT,
    });
  }

  positionLabels() {
    return this.listPositions();
  }

  private async getPosition(id: string) {
    const p = await this.prisma.position.findUnique({ where: { id } });
    if (!p || !p.active) throw new BadRequestException('Lavozim topilmadi yoki faol emas');
    return p;
  }

  private async activeStaff() {
    return this.prisma.user.findMany({
      where: { active: true, role: { in: TASK_ROLES }, positionId: { not: null } },
    });
  }

  async spawnAllToday(reason = 'manual') {
    const info = await this.calendar.getDayInfo();
    if (info.restDay) {
      this.logger.log(`Task spawn (${reason}): dam olish kuni — o‘tkazib yuborildi`);
      return { staff: 0, created: 0, restDay: true, date: info.date, reason: info.holiday?.title || info.weekdayLabel };
    }
    const staff = await this.activeStaff();
    let totalCreated = 0;
    for (const s of staff) {
      const { created } = await this.ensureDailyTasks(s.id);
      totalCreated += created;
    }
    this.logger.log(`Task spawn (${reason}): ${staff.length} xodim, ${totalCreated} yangi vazifa`);
    return { staff: staff.length, created: totalCreated, restDay: false, date: info.date };
  }

  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        positionId: true,
        positionRef: { select: POSITION_SELECT },
        phone: true,
        avatarUrl: true,
        bio: true,
        branchId: true,
        active: true,
        createdAt: true,
        branch: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException();
    return mapUserWithPosition(user);
  }

  async updateMyProfile(
    userId: string,
    data: { phone?: string; bio?: string; avatarUrl?: string },
  ) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: data.phone,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        positionId: true,
        positionRef: { select: POSITION_SELECT },
        phone: true,
        avatarUrl: true,
        bio: true,
      },
    });
    return mapUserWithPosition(updated);
  }

  /** Bugungi vazifalarni shablondan yaratish (idempotent). Dam olishda — yaratilmaydi. */
  async ensureDailyTasks(userId: string, dateInput?: string | Date) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new NotFoundException();
    if (!TASK_ROLES.includes(user.role)) {
      return { created: 0, tasks: [] as any[], restDay: false };
    }
    if (!user.positionId) {
      return { created: 0, tasks: [] as any[], needPosition: true, restDay: false };
    }

    const date = toDateOnly(dateInput);
    if (await this.calendar.isRestDay(date)) {
      return {
        created: 0,
        tasks: [] as any[],
        restDay: true,
        date: date.toISOString().slice(0, 10),
      };
    }

    const templates = await this.prisma.taskTemplate.findMany({
      where: { userId, active: true, frequency: 'DAILY' },
      orderBy: { sortOrder: 'asc' },
    });

    let created = 0;
    for (const t of templates) {
      try {
        await this.prisma.dailyTask.create({
          data: {
            userId,
            templateId: t.id,
            date,
            title: t.title,
            description: t.description,
            proofRequired: t.proofRequired,
            weight: t.weight,
          },
        });
        created++;
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e;
      }
    }

    const tasks = await this.prisma.dailyTask.findMany({
      where: { userId, date },
      include: { proofs: true, template: { select: { id: true, title: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    return { created, tasks, restDay: false };
  }

  async listMyTasks(userId: string, dateStr?: string) {
    const day = await this.calendar.getDayInfo(dateStr);
    if (day.restDay) {
      return {
        restDay: true,
        date: day.date,
        reason: day.holiday?.title || `${day.weekdayLabel} — dam olish`,
        tasks: [],
      };
    }
    await this.ensureDailyTasks(userId, dateStr);
    const date = toDateOnly(dateStr);
    const tasks = await this.prisma.dailyTask.findMany({
      where: { userId, date },
      include: { proofs: true, template: { select: { id: true, title: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    return { restDay: false, date: day.date, tasks };
  }

  /**
   * Xodimga bitta kunlik vazifa biriktirish (nom + izoh).
   * recurring=true (default) — har ish kuni 06:00 da avtomatik ochiladi.
   */
  async assignDailyTask(
    managerId: string,
    data: {
      userId: string;
      positionId: string;
      title: string;
      description: string;
      proofRequired?: boolean;
      weight?: number;
      recurring?: boolean;
    },
  ) {
    const title = data.title?.trim();
    const description = data.description?.trim();
    if (!title) throw new BadRequestException('Vazifa nomi kerak');
    if (!description) throw new BadRequestException('Izoh kerak');

    let assignee = await this.prisma.user.findUnique({ where: { id: data.userId } });
    if (!assignee) throw new NotFoundException('Xodim topilmadi');
    if (!assignee.active) throw new BadRequestException('Xodim faol emas');

    const pos = await this.getPosition(data.positionId);

    assignee = await this.prisma.user.update({
      where: { id: data.userId },
      data: { positionId: data.positionId },
    });

    const recurring = data.recurring !== false;
    const proofRequired = data.proofRequired ?? true;
    const weight = data.weight ?? 10;

    let template: { id: string; title: string; weight: number; proofRequired: boolean } | null =
      null;
    if (recurring) {
      const tpl = await this.prisma.taskTemplate.create({
        data: {
          userId: data.userId,
          positionId: data.positionId,
          title,
          description,
          proofRequired,
          weight,
          frequency: 'DAILY',
          active: true,
          sortOrder: 99,
        },
      });
      template = {
        id: tpl.id,
        title: tpl.title,
        weight: tpl.weight,
        proofRequired: tpl.proofRequired,
      };
    }

    const day = await this.calendar.getDayInfo();
    let todayCreated = 0;
    if (!day.restDay) {
      if (recurring) {
        const { created } = await this.ensureDailyTasks(data.userId, day.date);
        todayCreated = created;
      } else {
        await this.prisma.dailyTask.create({
          data: {
            userId: data.userId,
            templateId: null,
            date: toDateOnly(day.date),
            title,
            description,
            proofRequired,
            weight,
          },
        });
        todayCreated = 1;
      }
    }

    await this.prisma.notification.create({
      data: {
        userId: data.userId,
        title: 'Yangi kunlik vazifa',
        message: recurring
          ? `«${title}» — har ish kunida 06:00 da ochiladi.`
          : `«${title}» — faqat bugun (${day.date}).`,
        type: 'REMINDER',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: managerId,
        action: 'assign_daily_task',
        entity: 'user',
        entityId: data.userId,
        meta: {
          positionId: data.positionId,
          title,
          recurring,
        } as any,
      },
    });

    await this.telegram.notify(
      'Kunlik vazifa biriktirildi',
      `${assignee.name} → ${pos.nameUz}\n«${title}»${recurring ? ' (har ish kuni)' : ' (bugun)'}`,
      '📋',
    );

    return {
      user: {
        id: assignee.id,
        name: assignee.name,
        positionId: data.positionId,
        position: pos,
        positionLabel: pos.nameUz,
        positionLabelRu: pos.nameRu,
      },
      task: { title, description, proofRequired, weight, recurring },
      template,
      today: day,
      todayCreated,
    };
  }

  async submitTask(
    userId: string,
    taskId: string,
    employeeNote?: string,
  ) {
    const task = await this.prisma.dailyTask.findUnique({
      where: { id: taskId },
      include: { proofs: true },
    });
    if (!task || task.userId !== userId) throw new NotFoundException('Vazifa topilmadi');
    if (task.status === TaskStatus.APPROVED) {
      throw new BadRequestException('Vazifa allaqachon tasdiqlangan');
    }
    if (task.proofRequired && task.proofs.length === 0) {
      throw new BadRequestException('Isbot (foto/fayl) yuklash majburiy');
    }

    const updated = await this.prisma.dailyTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.SUBMITTED,
        employeeNote: employeeNote ?? task.employeeNote,
        submittedAt: new Date(),
      },
      include: { proofs: true, user: { select: { name: true } } },
    });

    await this.notifyManagersOfSubmission(updated.user?.name || 'Xodim', updated.title);
    if (process.env.AUTO_APPROVE_STAFF_TASKS === 'true') {
      return this.reviewTask('system', taskId, 'APPROVED', 'Avto-tasdiq (AUTO_APPROVE_STAFF_TASKS)');
    }
    return updated;
  }

  async saveProof(
    userId: string,
    taskId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    const task = await this.prisma.dailyTask.findUnique({ where: { id: taskId } });
    if (!task || task.userId !== userId) throw new NotFoundException();
    if (task.status === TaskStatus.APPROVED) {
      throw new BadRequestException('Tasdiqlangan vazifaga fayl qo\'shib bo\'lmaydi');
    }

    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'image/heic',
      'image/heif',
    ];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Faqat rasm (JPG/PNG/WEBP) yoki PDF');
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new BadRequestException('Fayl 8 MB dan oshmasin');
    }

    const ext = path.extname(file.originalname) || '.bin';
    const safe = `${taskId}_${Date.now()}${ext}`.replace(/[^\w.-]/g, '_');
    const full = path.join(this.uploadRoot, safe);
    fs.writeFileSync(full, file.buffer);

    const proof = await this.prisma.taskProof.create({
      data: {
        taskId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: `proofs/${safe}`,
      },
    });

    if (task.status === TaskStatus.PENDING || task.status === TaskStatus.REJECTED) {
      const updated = await this.prisma.dailyTask.update({
        where: { id: taskId },
        data: { status: TaskStatus.SUBMITTED, submittedAt: new Date() },
        include: { user: { select: { name: true } } },
      });
      await this.notifyManagersOfSubmission(updated.user?.name || 'Xodim', task.title);
      if (process.env.AUTO_APPROVE_STAFF_TASKS === 'true') {
        await this.reviewTask('system', taskId, 'APPROVED', 'Avto-tasdiq (isbot yuklandi)');
      }
    }

    return proof;
  }

  private async notifyManagersOfSubmission(employeeName: string, taskTitle: string) {
    await this.notifications.createForRoles(
      ['MANAGER', 'DIRECTOR', 'SUPER_ADMIN'],
      'Yangi isbot tekshiruvda',
      `${employeeName}: «${taskTitle}» — Jamoa KPI dan tasdiqlang.`,
      'REMINDER',
      { emoji: '📎', telegram: true },
    );
  }

  getProofAbsolutePath(relPath: string) {
    const full = path.join(process.cwd(), 'uploads', relPath);
    const root = path.join(process.cwd(), 'uploads');
    if (!full.startsWith(root)) {
      throw new ForbiddenException();
    }
    return full;
  }

  async getProofForUser(proofId: string, requesterId: string) {
    const proof = await this.prisma.taskProof.findUnique({
      where: { id: proofId },
      include: { task: true },
    });
    if (!proof) throw new NotFoundException();
    const me = await this.prisma.user.findUnique({ where: { id: requesterId } });
    const can =
      proof.task.userId === requesterId ||
      (me && ['MANAGER', 'DIRECTOR', 'SUPER_ADMIN'].includes(me.role));
    if (!can) throw new ForbiddenException();
    const full = this.getProofAbsolutePath(proof.path);
    if (!fs.existsSync(full)) throw new NotFoundException('Fayl topilmadi');
    return { proof, full };
  }


  async reviewTask(
    reviewerId: string,
    taskId: string,
    status: 'APPROVED' | 'REJECTED',
    reviewerNote?: string,
  ) {
    const task = await this.prisma.dailyTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException();

    const updated = await this.prisma.dailyTask.update({
      where: { id: taskId },
      data: {
        status: status === 'APPROVED' ? TaskStatus.APPROVED : TaskStatus.REJECTED,
        reviewerNote,
        reviewedById: reviewerId === 'system' ? null : reviewerId,
      },
      include: { proofs: true, user: { select: { id: true, name: true } } },
    });

    await this.prisma.notification.create({
      data: {
        userId: task.userId,
        title: status === 'APPROVED' ? 'Vazifa tasdiqlandi' : 'Vazifa qaytarildi — qayta yuklang',
        message: `"${task.title}"${reviewerNote ? `: ${reviewerNote}` : ''}`,
        type: 'SYSTEM',
      },
    });

    return updated;
  }

  /**
   * Klinika KPI bloki saqlanganda mos shaxsiy vazifani avtomatik yakunlash
   */
  async autoCompleteFromKpi(
    userId: string,
    blockKey: string,
    dateStr?: string,
  ) {
    const keys = KPI_TASK_MATCH[blockKey];
    if (!keys?.length) return null;
    const date = toDateOnly(dateStr);
    await this.ensureDailyTasks(userId, date);
    const tasks = await this.prisma.dailyTask.findMany({
      where: {
        userId,
        date,
        status: { in: [TaskStatus.PENDING, TaskStatus.SUBMITTED, TaskStatus.REJECTED] },
      },
    });
    const match = tasks.find((t) => {
      const title = t.title.toLowerCase();
      return keys.some((k) => title.includes(k.toLowerCase()));
    });
    if (!match) return null;

    return this.prisma.dailyTask.update({
      where: { id: match.id },
      data: {
        status: TaskStatus.APPROVED,
        employeeNote: match.employeeNote || `Avto: KPI «${blockKey}» saqlandi`,
        reviewerNote: 'Avtomatik tasdiq — bogʻlangan KPI bloki toʻldirildi',
        submittedAt: match.submittedAt || new Date(),
        reviewedById: null,
      },
    });
  }

  /**
   * Xodimga vazifa biriktirish:
   * - lavozimni yangilash (ixtiyoriy)
   * - shablon(lar) yoki qoʻlda vazifa
   * - recurring=true → lavozim shabloniga qoʻshiladi (har kuni 06:00)
   */
  async assignTasks(
    managerId: string,
    data: {
      userId: string;
      date: string;
      positionId?: string;
      templateIds?: string[];
      title?: string;
      description?: string;
      proofRequired?: boolean;
      weight?: number;
      recurring?: boolean;
    },
  ) {
    let assignee = await this.prisma.user.findUnique({ where: { id: data.userId } });
    if (!assignee) throw new NotFoundException('Xodim topilmadi');
    if (!assignee.active) throw new BadRequestException('Xodim faol emas');

    if (data.positionId && data.positionId !== assignee.positionId) {
      await this.getPosition(data.positionId);
      assignee = await this.prisma.user.update({
        where: { id: data.userId },
        data: { positionId: data.positionId },
      });
    }

    if (!assignee.positionId && !data.positionId) {
      throw new BadRequestException('Avval lavozim tanlang');
    }

    const positionId = data.positionId || assignee.positionId!;
    const posRow = await this.getPosition(positionId);
    const date = toDateOnly(data.date);
    const created: any[] = [];

    if (data.templateIds?.length) {
      const templates = await this.prisma.taskTemplate.findMany({
        where: { id: { in: data.templateIds }, active: true },
      });
      for (const t of templates) {
        if (t.positionId !== positionId) {
          throw new BadRequestException(
            `Shablon «${t.title}» boshqa lavozim uchun, tanlangan: ${posRow.nameUz}`,
          );
        }
        try {
          const task = await this.prisma.dailyTask.create({
            data: {
              userId: data.userId,
              templateId: t.id,
              date,
              title: t.title,
              description: t.description,
              proofRequired: t.proofRequired,
              weight: t.weight,
            },
          });
          created.push(task);
        } catch (e: any) {
          if (e?.code === 'P2002') continue;
          throw e;
        }
      }
    }

    if (data.title?.trim()) {
      let templateId: string | null = null;
      if (data.recurring) {
        const tpl = await this.prisma.taskTemplate.create({
          data: {
            userId: data.userId,
            positionId,
            title: data.title.trim(),
            description: (data.description || data.title).trim(),
            proofRequired: data.proofRequired ?? true,
            weight: data.weight ?? 10,
            frequency: 'DAILY',
            active: true,
            sortOrder: 99,
          },
        });
        templateId = tpl.id;
      }

      const task = await this.prisma.dailyTask.create({
        data: {
          userId: data.userId,
          templateId,
          date,
          title: data.title.trim(),
          description: (data.description || data.title).trim(),
          proofRequired: data.proofRequired ?? true,
          weight: data.weight ?? 10,
        },
      });
      created.push(task);
    }

    if (!created.length && !data.templateIds?.length && !data.title?.trim()) {
      throw new BadRequestException('Vazifa tanlang yoki yangi vazifa yozing');
    }

    await this.ensureDailyTasks(data.userId, date);

    if (created.length) {
      await this.prisma.notification.create({
        data: {
          userId: data.userId,
          title: 'Yangi vazifa biriktirildi',
          message: `${created.length} ta vazifa (${date.toISOString().slice(0, 10)})`,
          type: 'REMINDER',
        },
      });

      await this.prisma.auditLog.create({
        data: {
          userId: managerId,
          action: 'assign_tasks',
          entity: 'daily_task',
          entityId: created[0]?.id,
          meta: {
            assignee: data.userId,
            positionId,
            count: created.length,
            titles: created.map((t) => t.title),
          } as any,
        },
      });

      await this.telegram.notify(
        'Vazifa biriktirildi',
        `${assignee.name} (${posRow.nameUz}): ${created.map((t) => t.title).join(', ')}`,
        '📋',
      );
    }

    return {
      user: {
        id: assignee.id,
        name: assignee.name,
        positionId,
        position: posRow,
        positionLabel: posRow.nameUz,
        positionLabelRu: posRow.nameRu,
      },
      created,
      date: date.toISOString().slice(0, 10),
    };
  }

  async assignExtraTask(
    managerId: string,
    data: {
      userId: string;
      date: string;
      title: string;
      description: string;
      proofRequired?: boolean;
      weight?: number;
      positionId?: string;
      templateIds?: string[];
      recurring?: boolean;
    },
  ) {
    return this.assignTasks(managerId, data);
  }

  async setStaffPosition(managerId: string, userId: string, positionId: string) {
    await this.getPosition(positionId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { positionId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        positionId: true,
        positionRef: { select: POSITION_SELECT },
      },
    });
    await this.ensureDailyTasks(userId);
    await this.prisma.auditLog.create({
      data: {
        userId: managerId,
        action: 'set_position',
        entity: 'user',
        entityId: userId,
        meta: { positionId } as any,
      },
    });
    return mapUserWithPosition(user);
  }

  async updateTask(
    managerId: string,
    taskId: string,
    data: {
      title?: string;
      description?: string;
      proofRequired?: boolean;
      weight?: number;
      status?: TaskStatus;
    },
  ) {
    const existing = await this.prisma.dailyTask.findUnique({ where: { id: taskId } });
    if (!existing) throw new NotFoundException('Vazifa topilmadi');

    const task = await this.prisma.dailyTask.update({
      where: { id: taskId },
      data: {
        title: data.title?.trim() || undefined,
        description: data.description?.trim() || undefined,
        proofRequired: data.proofRequired,
        weight: data.weight,
        status: data.status,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: managerId,
        action: 'update_task',
        entity: 'daily_task',
        entityId: taskId,
        meta: data as any,
      },
    });

    return task;
  }

  async deleteTask(managerId: string, taskId: string) {
    const existing = await this.prisma.dailyTask.findUnique({ where: { id: taskId } });
    if (!existing) throw new NotFoundException('Vazifa topilmadi');

    await this.prisma.taskProof.deleteMany({ where: { taskId } });
    await this.prisma.dailyTask.delete({ where: { id: taskId } });

    await this.prisma.auditLog.create({
      data: {
        userId: managerId,
        action: 'delete_task',
        entity: 'daily_task',
        entityId: taskId,
        meta: { title: existing.title, userId: existing.userId } as any,
      },
    });

    return { ok: true };
  }

  async deleteTemplate(managerId: string, templateId: string) {
    const existing = await this.prisma.taskTemplate.findUnique({ where: { id: templateId } });
    if (!existing) throw new NotFoundException('Shablon topilmadi');

    // Shablondan yaratilgan vazifalarni templateId=null qilish (tarix saqlansin)
    await this.prisma.dailyTask.updateMany({
      where: { templateId },
      data: { templateId: null },
    });
    await this.prisma.taskTemplate.delete({ where: { id: templateId } });

    await this.prisma.auditLog.create({
      data: {
        userId: managerId,
        action: 'delete_template',
        entity: 'task_template',
        entityId: templateId,
        meta: { title: existing.title, positionId: existing.positionId } as any,
      },
    });

    return { ok: true };
  }


  async teamBoard(dateStr?: string) {
    const day = await this.calendar.getDayInfo(dateStr);
    const date = toDateOnly(dateStr);

    if (day.restDay) {
      return {
        date: day.date,
        restDay: true,
        reason: day.holiday?.title || `${day.weekdayLabel} — dam olish (hisoblanmaydi)`,
        members: [],
      };
    }

    const staff = await this.prisma.user.findMany({
      where: {
        active: true,
        role: { in: TASK_ROLES },
        positionId: { not: null },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        positionId: true,
        positionRef: { select: POSITION_SELECT },
        avatarUrl: true,
      },
      orderBy: { name: 'asc' },
    });

    for (const s of staff) {
      await this.ensureDailyTasks(s.id, date);
    }

    const tasks = await this.prisma.dailyTask.findMany({
      where: { date, userId: { in: staff.map((s) => s.id) } },
      include: {
        proofs: { select: { id: true, fileName: true, mimeType: true, path: true } },
        user: {
          select: {
            id: true,
            name: true,
            positionId: true,
            positionRef: { select: POSITION_SELECT },
          },
        },
      },
      orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
    });

    const byUser = staff.map((s) => {
      const mine = tasks.filter((t) => t.userId === s.id);
      const total = mine.length;
      const done = mine.filter((t) => t.status === TaskStatus.APPROVED || t.status === TaskStatus.SUBMITTED).length;
      const approved = mine.filter((t) => t.status === TaskStatus.APPROVED).length;
      return {
        user: mapUserWithPosition(s),
        tasks: mine,
        stats: {
          total,
          done,
          approved,
          pending: mine.filter((t) => t.status === TaskStatus.PENDING).length,
          submitted: mine.filter((t) => t.status === TaskStatus.SUBMITTED).length,
          rejected: mine.filter((t) => t.status === TaskStatus.REJECTED).length,
          completionPct: total ? Math.round((done / total) * 1000) / 10 : 0,
        },
      };
    });

    return { date: day.date, restDay: false, members: byUser };
  }

  async listTemplates(filter?: { positionId?: string; userId?: string }) {
    return this.prisma.taskTemplate.findMany({
      where: {
        ...(filter?.positionId ? { positionId: filter.positionId } : {}),
        ...(filter?.userId ? { userId: filter.userId } : {}),
      },
      include: { position: { select: POSITION_SELECT } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async upsertTemplate(
    data: {
      id?: string;
      positionId: string;
      title: string;
      description: string;
      proofRequired?: boolean;
      weight?: number;
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    await this.getPosition(data.positionId);
    if (data.id) {
      return this.prisma.taskTemplate.update({
        where: { id: data.id },
        data: {
          positionId: data.positionId,
          title: data.title,
          description: data.description,
          proofRequired: data.proofRequired ?? true,
          weight: data.weight ?? 10,
          active: data.active ?? true,
          sortOrder: data.sortOrder ?? 0,
        },
      });
    }
    return this.prisma.taskTemplate.create({
      data: {
        positionId: data.positionId,
        title: data.title,
        description: data.description,
        proofRequired: data.proofRequired ?? true,
        weight: data.weight ?? 10,
        active: data.active ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  private monthRange(year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return { start, end };
  }

  /** Xodimning oylik 100 ballik bahosi */
  async scoreEmployeeMonth(userId: string, year: number, month: number) {
    const { start, end } = this.monthRange(year, month);
    const tasks = await this.prisma.dailyTask.findMany({
      where: { userId, date: { gte: start, lte: end } },
      include: { proofs: true },
    });

    const total = tasks.length;
    if (!total) {
      const empty = {
        totalScore: 0,
        breakdown: {
          completion: 0,
          approval: 0,
          proof: 0,
          onTime: 0,
          taskCount: 0,
          approved: 0,
          submitted: 0,
          withProof: 0,
        },
      };
      await this.prisma.monthlyEmployeeScore.upsert({
        where: { userId_year_month: { userId, year, month } },
        create: { userId, year, month, totalScore: 0, breakdown: empty.breakdown },
        update: { totalScore: 0, breakdown: empty.breakdown },
      });
      return empty;
    }

    const approved = tasks.filter((t) => t.status === TaskStatus.APPROVED).length;
    const submitted = tasks.filter(
      (t) => t.status === TaskStatus.SUBMITTED || t.status === TaskStatus.APPROVED,
    ).length;
    const withProof = tasks.filter((t) => t.proofs.length > 0).length;
    const proofNeeded = tasks.filter((t) => t.proofRequired).length;

    // Weighted completion by status
    let weightedDone = 0;
    let weightedTotal = 0;
    for (const t of tasks) {
      weightedTotal += t.weight;
      if (t.status === TaskStatus.APPROVED) weightedDone += t.weight;
      else if (t.status === TaskStatus.SUBMITTED) weightedDone += t.weight * 0.7;
      else if (t.status === TaskStatus.REJECTED) weightedDone += t.weight * 0.2;
    }

    const completion = weightedTotal ? (weightedDone / weightedTotal) * 100 : 0;
    const approval = (approved / total) * 100;
    const proof = proofNeeded ? (withProof / proofNeeded) * 100 : 100;

    // On-time: submitted same calendar day (Tashkent) as task date
    let onTimeCount = 0;
    let timed = 0;
    for (const t of tasks) {
      if (!t.submittedAt) continue;
      timed++;
      const subDay = toDateOnly(t.submittedAt).getTime();
      if (subDay === t.date.getTime()) onTimeCount++;
    }
    const onTime = timed ? (onTimeCount / timed) * 100 : completion;

    // Final 100-scale
    const totalScore =
      Math.round(
        (completion * 0.45 + approval * 0.25 + proof * 0.2 + onTime * 0.1) * 10,
      ) / 10;

    const breakdown = {
      completion: Math.round(completion * 10) / 10,
      approval: Math.round(approval * 10) / 10,
      proof: Math.round(proof * 10) / 10,
      onTime: Math.round(onTime * 10) / 10,
      taskCount: total,
      approved,
      submitted,
      withProof,
    };

    await this.prisma.monthlyEmployeeScore.upsert({
      where: { userId_year_month: { userId, year, month } },
      create: { userId, year, month, totalScore, breakdown },
      update: { totalScore, breakdown },
    });

    return { totalScore, breakdown };
  }

  async evaluateMonth(year: number, month: number) {
    const staff = await this.prisma.user.findMany({
      where: { active: true, role: { in: TASK_ROLES }, positionId: { not: null } },
      select: {
        id: true,
        name: true,
        positionId: true,
        positionRef: { select: POSITION_SELECT },
        role: true,
      },
    });

    const results: any[] = [];
    for (const s of staff) {
      const score = await this.scoreEmployeeMonth(s.id, year, month);
      const posLabel = positionLabel(s.positionRef, 'uz') || '—';
      let aiSummary = await this.buildEmployeeAiSummary(s.name, posLabel, year, month, score);
      await this.prisma.monthlyEmployeeScore.update({
        where: { userId_year_month: { userId: s.id, year, month } },
        data: { aiSummary },
      });
      results.push({
        user: mapUserWithPosition(s),
        ...score,
        aiSummary,
      });
    }

    results.sort((a, b) => b.totalScore - a.totalScore);
    const leadershipReport = await this.buildLeadershipReport(year, month, results);

    await this.prisma.staffMonthlyReport.upsert({
      where: { year_month: { year, month } },
      create: { year, month, content: leadershipReport },
      update: { content: leadershipReport },
    });

    await this.notifications.createForRoles(
      ['MANAGER', 'DIRECTOR', 'SUPER_ADMIN'],
      `Oylik xodim KPI — ${month}/${year}`,
      `Jamoa baholandi. Eng yuqori: ${results[0]?.user.name || '—'} (${results[0]?.totalScore ?? 0}%).`,
      'SCORE',
      { emoji: '📊' },
    );

    return { year, month, results, leadershipReport };
  }

  private async buildEmployeeAiSummary(
    name: string,
    positionLabelText: string,
    year: number,
    month: number,
    score: { totalScore: number; breakdown: any },
  ) {
    const base = [
      `${name} (${positionLabelText}) — ${month}/${year}`,
      `Umumiy KPI: ${score.totalScore}/100`,
      `Bajarilish: ${score.breakdown.completion}% · Tasdiq: ${score.breakdown.approval}% · Isbot: ${score.breakdown.proof}% · Vaqtida: ${score.breakdown.onTime}%`,
      `Vazifalar: ${score.breakdown.taskCount}, tasdiqlangan: ${score.breakdown.approved}`,
      score.totalScore >= 80
        ? 'Xulosa: Yuqori natija — barqaror ishlashni davom ettirish.'
        : score.totalScore >= 50
          ? 'Xulosa: O\'rtacha — isbot sifatini va tasdiqlash foizini oshirish kerak.'
          : 'Xulosa: Past — kunlik vazifalar va isbot yuklash intizomini kuchaytirish zarur.',
    ].join('\n');

    return (await openaiChat(
      `Dermatologiya klinikasi HR-KPI tahlilchisi sifatida 3-4 jumlalik o'zbekcha xulosa yozing (faqat matn):\n${base}`,
    )) || base;
  }

  private async buildLeadershipReport(year: number, month: number, results: any[]) {
    const lines = results
      .map(
        (r, i) =>
          `${i + 1}. ${r.user.name} (${r.user.positionLabel}): ${r.totalScore}% — vazifa ${r.breakdown.taskCount}, tasdiq ${r.breakdown.approved}`,
      )
      .join('\n');

    const avg =
      results.length
        ? Math.round((results.reduce((s, r) => s + r.totalScore, 0) / results.length) * 10) / 10
        : 0;

    const base = [
      `# Jamoa oylik KPI hisobot — ${month}/${year}`,
      `Vaqt zonasi: ${BUSINESS_TZ}`,
      `O'rtacha jamoa bali: ${avg}/100`,
      ``,
      `## Reyting`,
      lines || 'Ma\'lumot yo\'q',
      ``,
      `## Rahbar uchun xulosa`,
      `- Eng kuchli: ${results[0]?.user.name || '—'}`,
      `- Eng zaif: ${results[results.length - 1]?.user.name || '—'}`,
      `- Past balli xodimlar bilan 1:1 suhbat va vazifa intizomini qat'iylashtirish`,
      `- Isbot (foto/PDF) majburiy bo'lgan vazifalarni nazorat qilish`,
    ].join('\n');

    return (
      (await openaiChat(
        `Siz klinika direktori uchun KPI maslahatchisiz. Quyidagi reyting asosida o'zbek tilida amaliy oylik hisobot yozing:\n\n${base}`,
      )) || base
    );
  }

  async getMonthReport(year: number, month: number) {
    const scores = await this.prisma.monthlyEmployeeScore.findMany({
      where: { year, month },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            positionId: true,
            positionRef: { select: POSITION_SELECT },
            role: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { totalScore: 'desc' },
    });
    const report = await this.prisma.staffMonthlyReport.findUnique({
      where: { year_month: { year, month } },
    });
    return {
      year,
      month,
      scores: scores.map((s) => ({
        ...s,
        user: mapUserWithPosition(s.user),
      })),
      leadershipReport: report?.content || null,
    };
  }

  async listStaffUsers() {
    const rows = await this.prisma.user.findMany({
      where: { active: true, role: { in: [...TASK_ROLES, Role.DIRECTOR] } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        positionId: true,
        positionRef: { select: POSITION_SELECT },
        phone: true,
        avatarUrl: true,
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => mapUserWithPosition(r));
  }

  /** Har kuni 06:00 — ish kuni boʻlsa kunlik vazifalar ochiladi */
  @Cron('0 6 * * *', { timeZone: BUSINESS_TZ })
  async morningTaskSpawn() {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      await this.telegram.notify(
        'Dam olish kuni',
        `${day.date}: vazifalar ochilmaydi (${day.holiday?.title || day.weekdayLabel}). Hisoblanmaydi.`,
        '🌴',
      );
      return;
    }
    const { staff, created } = await this.spawnAllToday('06:00-day-rollover');
    const people = await this.activeStaff();
    for (const s of people) {
      const tasks = await this.prisma.dailyTask.findMany({
        where: { userId: s.id, date: toDateOnly() },
      });
      if (!tasks.length) continue;
      const pending = tasks.filter((t) => t.status === TaskStatus.PENDING).length;
      await this.prisma.notification.create({
        data: {
          userId: s.id,
          title: 'Kunlik vazifalar ochildi',
          message: `${tasks.length} ta vazifa (${pending} kutilmoqda). /my`,
          type: 'REMINDER',
        },
      });
    }
    await this.telegram.notify(
      'Ish kuni boshlandi (06:00)',
      `${staff} xodim · kunlik vazifalar ochildi · yangi: ${created}`,
      '☀️',
    );
  }

  /** 19:00 — AI kunlik nazorat (faqat ish kunlari) */
  @Cron('0 19 * * *', { timeZone: BUSINESS_TZ })
  async aiDailyMonitorCron() {
    await this.runAiDailyMonitor('19:00-cron');
  }

  async runAiDailyMonitor(reason = 'manual') {
    const day = await this.calendar.getDayInfo();
    if (day.restDay) {
      return {
        restDay: true,
        date: day.date,
        message: 'Dam olish kuni — AI nazorat yoʻq',
      };
    }

    const board = await this.teamBoard(day.date);
    const lines = (board.members || []).map((m: any) => {
      const pending = m.tasks
        .filter((t: any) => t.status === 'PENDING' || t.status === 'REJECTED')
        .map((t: any) => t.title);
      const submitted = m.tasks.filter((t: any) => t.status === 'SUBMITTED').length;
      const approved = m.tasks.filter((t: any) => t.status === 'APPROVED').length;
      return {
        name: m.user.name,
        position: m.user.positionLabel,
        pct: m.stats.completionPct,
        approved,
        submitted,
        pending: pending.length,
        pendingTitles: pending.slice(0, 5),
      };
    });

    const raw = lines
      .map(
        (l) =>
          `• ${l.name} (${l.position}): ${l.pct}% | ✅${l.approved} 📎${l.submitted} ⏳${l.pending}` +
          (l.pendingTitles.length ? ` — qolgan: ${l.pendingTitles.join('; ')}` : ''),
      )
      .join('\n');

    const fallback = [
      `Kundalik nazorat — ${day.date}`,
      raw || 'Xodim yoʻq',
      '',
      'Qolgan vazifalarni ertaga ertalab tekshiring.',
    ].join('\n');

    const ai =
      (await openaiChat(
        `Siz klinika KPI nazoratchisisiz. Quyidagi bugungi xodimlar bajarilishini o'zbekcha qisqa (5-8 jumla) tahlil qiling: kim yaxshi, kim kechikmoqda, nima qilish kerak.\n\n${raw || "Ma'lumot yo'q"}`,
      )) || fallback;

    await this.notifications.createForRoles(
      ['MANAGER', 'DIRECTOR', 'SUPER_ADMIN'],
      `AI kunlik nazorat — ${day.date}`,
      ai.slice(0, 900),
      'AI_REPORT',
      { emoji: '🤖' },
    );

    await this.telegram.notify(`AI kunlik nazorat (${day.date})`, ai.slice(0, 3500), '🤖');
    this.logger.log(`AI daily monitor (${reason}) done`);
    return { restDay: false, date: day.date, report: ai, members: lines.length };
  }

  /** 12:00 — tushlik eslatmasi */
  @Cron('0 12 * * *', { timeZone: BUSINESS_TZ })
  async middayNudge() {
    if (await this.calendar.isRestDay()) return;
    const date = toDateOnly();
    const pending = await this.prisma.dailyTask.findMany({
      where: { date, status: TaskStatus.PENDING },
      include: { user: { select: { id: true, name: true } } },
    });
    const byUser = new Map<string, { name: string; n: number }>();
    for (const t of pending) {
      const cur = byUser.get(t.userId) || { name: t.user.name, n: 0 };
      cur.n += 1;
      byUser.set(t.userId, cur);
    }
    for (const [userId, v] of byUser) {
      await this.prisma.notification.create({
        data: {
          userId,
          title: 'Tushlik eslatmasi',
          message: `Hali ${v.n} ta vazifa bajarilmagan. Isbot yuklang.`,
          type: 'REMINDER',
        },
      });
    }
    if (byUser.size) {
      await this.telegram.notify(
        'Tushlik (12:00)',
        `${byUser.size} xodimda bajarilmagan vazifa bor.`,
        '🕐',
      );
    }
  }

  /** 17:00 — kechki shaxsiy vazifa ogohlantirishi */
  @Cron('0 17 * * *', { timeZone: BUSINESS_TZ })
  async eveningStaffIncomplete() {
    if (await this.calendar.isRestDay()) return;
    const text = await this.incompleteDigestText();
    if (!text.includes('toʻliq') && !text.includes("to'liq")) {
      await this.telegram.notify('Kechki xodim vazifalari (17:00)', text.replace(/<\/?b>/g, ''), '⏰');
    }
    const date = toDateOnly();
    const pending = await this.prisma.dailyTask.findMany({
      where: { date, status: { in: [TaskStatus.PENDING, TaskStatus.REJECTED] } },
      select: { userId: true, title: true },
    });
    const map = new Map<string, string[]>();
    for (const t of pending) {
      const arr = map.get(t.userId) || [];
      arr.push(t.title);
      map.set(t.userId, arr);
    }
    for (const [userId, titles] of map) {
      await this.prisma.notification.create({
        data: {
          userId,
          title: 'Kun yakunlanmoqda',
          message: `Qolgan: ${titles.slice(0, 5).join('; ')}${titles.length > 5 ? '…' : ''}`,
          type: 'ALERT',
        },
      });
    }
  }

  /** 18:00 — menejerga tekshiruv navbati */
  @Cron('0 18 * * *', { timeZone: BUSINESS_TZ })
  async eveningReviewQueue() {
    if (await this.calendar.isRestDay()) return;
    const date = toDateOnly();
    const waiting = await this.prisma.dailyTask.count({
      where: { date, status: TaskStatus.SUBMITTED },
    });
    if (!waiting) return;
    await this.notifications.createForRoles(
      ['MANAGER', 'DIRECTOR', 'SUPER_ADMIN'],
      'Tekshiruv navbati',
      `Bugun ${waiting} ta isbot tasdiq kutmoqda. Jamoa KPI → Tasdiqlash.`,
      'REMINDER',
      { emoji: '✅' },
    );
  }

  /** 24 soatdan oshgan SUBMITTED → avto-tasdiq (menejer kechiksa) */
  @Cron('0 */2 * * *', { timeZone: BUSINESS_TZ })
  async autoApproveStaleSubmissions() {
    if (process.env.AUTO_APPROVE_STALE === 'false') return;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await this.prisma.dailyTask.findMany({
      where: {
        status: TaskStatus.SUBMITTED,
        submittedAt: { lte: cutoff },
      },
      take: 50,
    });
    for (const t of stale) {
      await this.reviewTask('system', t.id, 'APPROVED', 'Avto-tasdiq: 24 soat ichida koʻrib chiqilmadi');
    }
    if (stale.length) {
      this.logger.log(`Auto-approved ${stale.length} stale submissions`);
    }
  }

  /** Oyining 1-ida o'tgan oy bahosi + Telegram */
  @Cron('0 10 1 * *', { timeZone: BUSINESS_TZ })
  async autoMonthEvaluate() {
    const now = toDateOnly(new Date());
    let year = now.getUTCFullYear();
    let month = now.getUTCMonth();
    if (month === 0) {
      year -= 1;
      month = 12;
    } else {
      // getUTCMonth 0-based; previous month number = current getUTCMonth() when day is 1
      // On July 1, getUTCMonth()=6, previous month = 6 → June. Good if we use month as-is when not Jan?
      // Wait: on July 1, we want June → month should be 6.
      // now.getUTCMonth() on July 1 is 6. Previous calendar month number is 6. OK.
      // On March 1, getUTCMonth()=2, previous=February=2. OK.
    }
    const res = await this.evaluateMonth(year, month);
    const top = res.results[0];
    await this.telegram.notify(
      `Oylik KPI avtomatik — ${month}/${year}`,
      `Jamoa baholandi (${res.results.length} xodim).\nEng yuqori: ${top?.user?.name || '—'} (${top?.totalScore ?? 0}/100)`,
      '📊',
    );
  }

  /** Oy oxiri 28–31 kunlari 20:00 — eslatma (baholash yaqin) */
  @Cron('0 20 28-31 * *', { timeZone: BUSINESS_TZ })
  async monthEndReminder() {
    const now = toDateOnly(new Date());
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    if (now.getUTCDate() !== lastDay) return;
    await this.notifications.createForRoles(
      ['MANAGER', 'DIRECTOR', 'SUPER_ADMIN'],
      'Oy yakunlandi',
      'Ertaga oylik xodim KPI avtomatik hisoblanadi. Bugungi isbotlarni tasdiqlang.',
      'SCORE',
      { emoji: '📅' },
    );
  }

  async incompleteDigestText() {
    const date = toDateOnly();
    const tasks = await this.prisma.dailyTask.findMany({
      where: { date, status: { in: [TaskStatus.PENDING, TaskStatus.REJECTED, TaskStatus.SUBMITTED] } },
      include: { user: { select: { name: true } } },
    });
    if (!tasks.length) return "✅ Bugun xodim vazifalari to'liq (yoki vazifa yo'q).";
    const lines = tasks.slice(0, 25).map(
      (t) => `• ${t.user.name}: ${t.title} [${t.status}]`,
    );
    return `<b>Xodim vazifalari (${date.toISOString().slice(0, 10)})</b>\n${lines.join('\n')}`;
  }

  async teamDigestText() {
    const board = await this.teamBoard();
    const lines = board.members.map(
      (m) =>
        `• ${m.user.name}: ${m.stats.completionPct}% (${m.stats.approved}✅ ${m.stats.submitted}📎 ${m.stats.pending}⏳)`,
    );
    return (
      `<b>Jamoa kunlik holat — ${board.date}</b>\n` +
      (lines.join('\n') || 'Xodim yoʻq')
    );
  }

  automationStatus() {
    return {
      timezone: BUSINESS_TZ,
      dayRollover: '06:00',
      aiMonitor: '19:00',
      schedule: [
        '06:00 — ish kuni: kunlik vazifalar ochiladi',
        'Dam olish kunlari — vazifa yoʻq, hisoblanmaydi',
        '12:00 / 17:00 / 18:00 — eslatmalar (faqat ish kuni)',
        '19:00 — AI kunlik nazorat (xodimlar boʻyicha)',
        'Har 2 soat — 24 soatlik isbotlarni avto-tasdiq',
        'Oy 1-kun 10:00 — oylik 100 ballik KPI + AI',
      ],
      autoApproveImmediate: process.env.AUTO_APPROVE_STAFF_TASKS === 'true',
      autoApproveStale24h: process.env.AUTO_APPROVE_STALE !== 'false',
    };
  }
}
