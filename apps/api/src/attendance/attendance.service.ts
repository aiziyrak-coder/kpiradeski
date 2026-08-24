import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AttendanceStatus, KpiFrequency, Role } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';
import { CalendarService } from '../common/calendar.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { openaiFaceMatch } from '../common/openai';
import { toDateOnly } from '../common/kpi.constants';
import { sha256Hex } from '../common/proof-integrity';
import { ensureJpegBuffer } from '../common/heic-to-jpeg';
import { tgCard, tgEscape } from '../telegram/tg-format';
import { ATTENDANCE_GRACE_MIN, ATTENDANCE_NODE_KEY } from './attendance.constants';
import {
  EMPLOYEE_ROSTER,
  matchBranchHint,
  scheduleForDay,
} from './employee-roster';
import { formatHm, tashkentClock } from '../common/task-window';

const TZ = 'Asia/Tashkent';

@Injectable()
export class AttendanceService implements OnModuleInit {
  private readonly logger = new Logger(AttendanceService.name);
  private uploadRoot = path.join(process.cwd(), 'uploads', 'employees');

  constructor(
    private prisma: PrismaService,
    private branches: BranchesService,
    private calendar: CalendarService,
    private telegram: TelegramBotService,
  ) {}

  async onModuleInit() {
    fs.mkdirSync(this.uploadRoot, { recursive: true });
    try {
      await this.ensureCatalogAndAssignments();
      await this.syncRosterFromDocument();
    } catch (e) {
      this.logger.warn(`Attendance boot: ${e}`);
    }
  }

  /** Hujjatdagi hodimlarni filiallarga qoʻshish / jadvalni yangilash (rasm keyin) */
  private async syncRosterFromDocument() {
    const branches = await this.prisma.branch.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });
    if (!branches.length) return;
    let created = 0;
    let updated = 0;
    for (const row of EMPLOYEE_ROSTER) {
      const branch = branches.find((b) => matchBranchHint(b.name, row.branchHint));
      if (!branch) {
        this.logger.warn(`Roster: filial topilmadi (${row.branchHint}) — ${row.lastName}`);
        continue;
      }
      const existing = await this.prisma.branchEmployee.findFirst({
        where: {
          branchId: branch.id,
          lastName: { equals: row.lastName, mode: 'insensitive' },
          firstName: { equals: row.firstName, mode: 'insensitive' },
        },
      });
      const data = {
        position: row.position,
        expectedArriveMin: row.arriveMin,
        expectedLeaveMin: row.leaveMin,
        workDays: row.workDays,
        satArriveMin: row.satArriveMin ?? null,
        satLeaveMin: row.satLeaveMin ?? null,
        active: true,
      };
      if (existing) {
        await this.prisma.branchEmployee.update({
          where: { id: existing.id },
          data,
        });
        updated += 1;
      } else {
        await this.prisma.branchEmployee.create({
          data: {
            branchId: branch.id,
            firstName: row.firstName,
            lastName: row.lastName,
            photoPath: 'pending',
            ...data,
          },
        });
        created += 1;
      }
    }
    if (created || updated) {
      this.logger.log(`Roster sync: +${created} yangi, ${updated} jadval yangilandi`);
    }
  }

  private async ensureCatalogAndAssignments() {
    const node = await this.prisma.kpiCatalogNode.findUnique({
      where: { key: ATTENDANCE_NODE_KEY },
    });
    if (node) {
      await this.prisma.kpiCatalogNode.update({
        where: { key: ATTENDANCE_NODE_KEY },
        data: { proofRequired: false, active: true },
      });
    }
    const branches = await this.prisma.branch.findMany({
      where: { active: true },
      select: { id: true },
    });
    for (const b of branches) {
      await this.prisma.kpiAssignmentTemplate.upsert({
        where: {
          branchId_frequency_nodeKey: {
            branchId: b.id,
            frequency: KpiFrequency.DAILY,
            nodeKey: ATTENDANCE_NODE_KEY,
          },
        },
        create: {
          branchId: b.id,
          frequency: KpiFrequency.DAILY,
          nodeKey: ATTENDANCE_NODE_KEY,
          active: true,
        },
        update: { active: true },
      });
    }
  }

  private fullName(e: { firstName: string; lastName: string }) {
    return `${e.lastName} ${e.firstName}`.trim();
  }

  private hmToMin(hm: string) {
    const m = String(hm || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) throw new BadRequestException('Kelish vaqti HH:MM formatida');
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) {
      throw new BadRequestException('Kelish vaqti notoʻgʻri');
    }
    return h * 60 + min;
  }

  statusOf(arrivedAt: Date | null, expectedMin: number, now = new Date()): AttendanceStatus {
    if (arrivedAt) {
      const clk = tashkentClock(arrivedAt);
      if (clk.minutes <= expectedMin + ATTENDANCE_GRACE_MIN) return AttendanceStatus.ON_TIME;
      return AttendanceStatus.LATE;
    }
    const nowClk = tashkentClock(now);
    if (nowClk.minutes > expectedMin + ATTENDANCE_GRACE_MIN) return AttendanceStatus.ABSENT;
    return AttendanceStatus.PENDING;
  }

  async listEmployees(user: { id: string; role: Role }, branchId?: string) {
    if (branchId) {
      await this.branches.assertCanAccessBranch(user.id, user.role, branchId);
    } else if (user.role === Role.MANAGER) {
      const mine = await this.branches.mine(user.id, user.role);
      branchId = mine[0]?.id;
      if (!branchId) return [];
    }
    const where: any = { active: true };
    if (branchId) where.branchId = branchId;
    else if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
      return [];
    }
    const rows = await this.prisma.branchEmployee.findMany({
      where,
      include: { branch: { select: { id: true, name: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map((e) => this.serializeEmployee(e));
  }

  private serializeEmployee(e: any) {
    const leave = e.expectedLeaveMin != null ? formatHm(e.expectedLeaveMin) : null;
    const satA = e.satArriveMin != null ? formatHm(e.satArriveMin) : null;
    const satL = e.satLeaveMin != null ? formatHm(e.satLeaveMin) : null;
    return {
      id: e.id,
      branchId: e.branchId,
      branchName: e.branch?.name,
      firstName: e.firstName,
      lastName: e.lastName,
      name: this.fullName(e),
      position: e.position || null,
      expectedArriveMin: e.expectedArriveMin,
      expectedArrive: formatHm(e.expectedArriveMin),
      expectedLeaveMin: e.expectedLeaveMin ?? null,
      expectedLeave: leave,
      workDays: e.workDays || '1,2,3,4,5,6',
      satArriveMin: e.satArriveMin ?? null,
      satArrive: satA,
      satLeaveMin: e.satLeaveMin ?? null,
      satLeave: satL,
      scheduleLabel: this.scheduleLabel(e),
      active: e.active,
      hasPhoto: !!(e.photoPath && e.photoPath !== 'pending'),
      createdAt: e.createdAt,
    };
  }

  private scheduleLabel(e: {
    expectedArriveMin: number;
    expectedLeaveMin?: number | null;
    workDays?: string | null;
    satArriveMin?: number | null;
    satLeaveMin?: number | null;
  }) {
    const a = formatHm(e.expectedArriveMin);
    const l = e.expectedLeaveMin != null ? formatHm(e.expectedLeaveMin) : '?';
    const days = String(e.workDays || '1,2,3,4,5,6');
    const monFri = days === '1,2,3,4,5';
    let base = `${a}–${l} · ${monFri ? 'Du–Ju' : 'Du–Sha'}`;
    if (e.satArriveMin != null) {
      const sa = formatHm(e.satArriveMin);
      const sl = e.satLeaveMin != null ? formatHm(e.satLeaveMin) : '?';
      base += ` · Sha ${sa}–${sl}`;
    }
    return base;
  }

  async createEmployee(
    user: { id: string; role: Role },
    data: {
      branchId: string;
      firstName: string;
      lastName: string;
      expectedArrive: string;
      expectedLeave?: string;
      position?: string;
      workDays?: string;
      satArrive?: string;
      satLeave?: string;
      file?: { originalname: string; mimetype: string; buffer: Buffer };
    },
  ) {
    if (user.role === Role.MANAGER) {
      throw new ForbiddenException('Hodimlarni faqat admin kiritadi');
    }
    await this.branches.assertCanAccessBranch(user.id, user.role, data.branchId);
    const firstName = (data.firstName || '').trim();
    const lastName = (data.lastName || '').trim();
    if (firstName.length < 2 || lastName.length < 2) {
      throw new BadRequestException('Ism va familiya kerak');
    }
    const expectedArriveMin = this.hmToMin(data.expectedArrive);
    const expectedLeaveMin = data.expectedLeave?.trim()
      ? this.hmToMin(data.expectedLeave)
      : null;
    const satArriveMin = data.satArrive?.trim() ? this.hmToMin(data.satArrive) : null;
    const satLeaveMin = data.satLeave?.trim() ? this.hmToMin(data.satLeave) : null;
    const workDays = (data.workDays || '1,2,3,4,5,6').replace(/\s+/g, '');
    const emp = await this.prisma.branchEmployee.create({
      data: {
        branchId: data.branchId,
        firstName,
        lastName,
        position: data.position?.trim() || null,
        photoPath: 'pending',
        expectedArriveMin,
        expectedLeaveMin,
        workDays,
        satArriveMin,
        satLeaveMin,
      },
    });
    if (data.file?.buffer?.length) {
      let jpeg: { buffer: Buffer };
      try {
        jpeg = await ensureJpegBuffer(
          data.file.buffer,
          `${data.file.mimetype || ''} ${data.file.originalname || ''}`,
        );
      } catch (e) {
        throw new BadRequestException(
          e instanceof Error ? e.message : 'HEIC rasm ochilmadi',
        );
      }
      const rel = path.join(data.branchId, `${emp.id}.jpg`).replace(/\\/g, '/');
      const full = path.join(this.uploadRoot, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, jpeg.buffer);
      return this.prisma.branchEmployee
        .update({
          where: { id: emp.id },
          data: { photoPath: rel },
          include: { branch: { select: { id: true, name: true } } },
        })
        .then((e) => this.serializeEmployee(e));
    }
    const withBranch = await this.prisma.branchEmployee.findUnique({
      where: { id: emp.id },
      include: { branch: { select: { id: true, name: true } } },
    });
    return this.serializeEmployee(withBranch);
  }

  async updateEmployee(
    user: { id: string; role: Role },
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      expectedArrive?: string;
      expectedLeave?: string;
      position?: string;
      workDays?: string;
      satArrive?: string;
      satLeave?: string;
      active?: boolean;
      file?: { originalname: string; mimetype: string; buffer: Buffer };
    },
  ) {
    if (user.role === Role.MANAGER) {
      throw new ForbiddenException('Hodimlarni faqat admin tahrirlaydi');
    }
    const emp = await this.prisma.branchEmployee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException('Hodim topilmadi');
    await this.branches.assertCanAccessBranch(user.id, user.role, emp.branchId);
    const patch: any = {};
    if (data.firstName) patch.firstName = data.firstName.trim();
    if (data.lastName) patch.lastName = data.lastName.trim();
    if (data.position !== undefined) patch.position = data.position.trim() || null;
    if (data.expectedArrive) patch.expectedArriveMin = this.hmToMin(data.expectedArrive);
    if (data.expectedLeave !== undefined) {
      patch.expectedLeaveMin = data.expectedLeave.trim()
        ? this.hmToMin(data.expectedLeave)
        : null;
    }
    if (data.workDays) patch.workDays = data.workDays.replace(/\s+/g, '');
    if (data.satArrive !== undefined) {
      patch.satArriveMin = data.satArrive.trim() ? this.hmToMin(data.satArrive) : null;
    }
    if (data.satLeave !== undefined) {
      patch.satLeaveMin = data.satLeave.trim() ? this.hmToMin(data.satLeave) : null;
    }
    if (typeof data.active === 'boolean') patch.active = data.active;
    if (data.file?.buffer?.length) {
      let jpeg: { buffer: Buffer };
      try {
        jpeg = await ensureJpegBuffer(
          data.file.buffer,
          `${data.file.mimetype || ''} ${data.file.originalname || ''}`,
        );
      } catch (e) {
        throw new BadRequestException(
          e instanceof Error ? e.message : 'HEIC rasm ochilmadi',
        );
      }
      const rel =
        emp.photoPath && emp.photoPath !== 'pending'
          ? emp.photoPath.replace(/\.[^.]+$/, '.jpg')
          : path.join(emp.branchId, `${emp.id}.jpg`).replace(/\\/g, '/');
      const full = path.join(this.uploadRoot, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, jpeg.buffer);
      patch.photoPath = rel;
    }
    const updated = await this.prisma.branchEmployee.update({
      where: { id },
      data: patch,
      include: { branch: { select: { id: true, name: true } } },
    });
    return this.serializeEmployee(updated);
  }

  async photoPath(user: { id: string; role: Role }, id: string) {
    const emp = await this.prisma.branchEmployee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException('Hodim topilmadi');
    await this.branches.assertCanAccessBranch(user.id, user.role, emp.branchId);
    if (!emp.photoPath || emp.photoPath === 'pending') {
      throw new NotFoundException('Rasm hali yuklanmagan');
    }
    const full = path.resolve(this.uploadRoot, emp.photoPath);
    const root = path.resolve(this.uploadRoot);
    if (!full.startsWith(root) || !fs.existsSync(full)) {
      throw new NotFoundException('Rasm topilmadi');
    }
    return full;
  }

  async dayBoard(
    user: { id: string; role: Role },
    branchId: string,
    dateISO?: string,
  ) {
    await this.branches.assertCanAccessBranch(user.id, user.role, branchId);
    const dateStr = dateISO || tashkentClock().dateISO;
    const date = toDateOnly(dateStr);
    const employees = await this.prisma.branchEmployee.findMany({
      where: { branchId, active: true },
      orderBy: [{ expectedArriveMin: 'asc' }, { lastName: 'asc' }],
    });
    const att = await this.prisma.employeeAttendance.findMany({
      where: { branchId, date },
    });
    const byEmp = new Map(att.map((a) => [a.employeeId, a]));
    const now = new Date();
    const rows = employees
      .map((e) => {
        const sch = scheduleForDay(e, dateStr);
        if (!sch.works) return null;
        const rec = byEmp.get(e.id);
        const status = rec
          ? rec.status
          : this.statusOf(null, sch.arriveMin, now);
        return {
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          name: this.fullName(e),
          position: e.position || null,
          expectedArriveMin: sch.arriveMin,
          expectedArrive: formatHm(sch.arriveMin),
          expectedLeaveMin: sch.leaveMin,
          expectedLeave: sch.leaveMin != null ? formatHm(sch.leaveMin) : null,
          scheduleLabel: this.scheduleLabel(e),
          hasPhoto: !!(e.photoPath && e.photoPath !== 'pending'),
          status,
          arrivedAt: rec?.arrivedAt?.toISOString() || null,
          arrivedLabel: rec?.arrivedAt ? this.clockLabel(rec.arrivedAt) : null,
          matchScore: rec?.matchScore ?? null,
          livenessOk: rec?.livenessOk ?? false,
        };
      })
      .filter(Boolean) as any[];
    return {
      date: date.toISOString().slice(0, 10),
      branchId,
      total: rows.length,
      arrived: rows.filter((r) => r.status === 'ON_TIME' || r.status === 'LATE').length,
      onTime: rows.filter((r) => r.status === 'ON_TIME').length,
      late: rows.filter((r) => r.status === 'LATE').length,
      absent: rows.filter((r) => r.status === 'ABSENT').length,
      pending: rows.filter((r) => r.status === 'PENDING').length,
      employees: rows,
    };
  }

  private clockLabel(d: Date) {
    const c = tashkentClock(d);
    return formatHm(c.minutes);
  }

  async scan(
    user: { id: string; role: Role },
    data: {
      employeeId: string;
      branchId: string;
      date?: string;
      live?: { mimetype: string; buffer: Buffer };
      live2?: { mimetype: string; buffer: Buffer };
    },
  ) {
    await this.branches.assertCanAccessBranch(user.id, user.role, data.branchId);
    const emp = await this.prisma.branchEmployee.findUnique({
      where: { id: data.employeeId },
    });
    if (!emp || !emp.active) throw new NotFoundException('Hodim topilmadi');
    if (emp.branchId !== data.branchId) {
      throw new BadRequestException('Hodim boshqa filialga tegishli');
    }
    if (!data.live?.buffer?.length) {
      throw new BadRequestException('Skaner rasmi yoʻq');
    }

    if (!data.live2?.buffer?.length) {
      throw new BadRequestException('Ikkinchi kadr yoʻq — jonlilik uchun boshni biroz qimirlatib qayta skaner qiling');
    }
    if (sha256Hex(data.live.buffer) === sha256Hex(data.live2.buffer)) {
      throw new BadRequestException('Jonlilik yoʻq — ikkala kadr bir xil. Yuzingizni kameraga tuting, qimirlang.');
    }

    const refFull = path.resolve(this.uploadRoot, emp.photoPath);
    if (!emp.photoPath || emp.photoPath === 'pending' || !fs.existsSync(refFull)) {
      throw new BadRequestException(
        'Hodimning bazadagi rasmi yoʻq — admin «Ishchi hodimlar»dan yuklasin',
      );
    }
    const refBuf = fs.readFileSync(refFull);
    const verdict = await openaiFaceMatch({
      name: this.fullName(emp),
      reference: { mimeType: 'image/jpeg', base64: refBuf.toString('base64') },
      live: {
        mimeType: data.live.mimetype || 'image/jpeg',
        base64: data.live.buffer.toString('base64'),
      },
      live2: data.live2?.buffer
        ? {
            mimeType: data.live2.mimetype || 'image/jpeg',
            base64: data.live2.buffer.toString('base64'),
          }
        : null,
    });

    if (verdict && (!verdict.match || !verdict.live || verdict.score < 55)) {
      throw new BadRequestException(
        verdict.live === false
          ? 'Jonlilik yoʻq — rasm/ekran koʻrsatilgan. Yuzingizni kameraga tuting.'
          : `Yuz mos kelmadi (${this.fullName(emp)}). Qayta skaner qiling.`,
      );
    }
    if (!verdict) {
      this.logger.warn('Face match AI unavailable — two distinct live frames required');
    }

    const dateStr = data.date || tashkentClock().dateISO;
    const date = toDateOnly(dateStr);
    const sch = scheduleForDay(emp, dateStr);
    if (!sch.works) {
      throw new BadRequestException('Bugun bu hodimning ish kuni emas');
    }
    const arrivedAt = new Date();
    const status = this.statusOf(arrivedAt, sch.arriveMin, arrivedAt);
    const rel = path
      .join('scans', data.branchId, date.toISOString().slice(0, 10), `${emp.id}-${Date.now()}.jpg`)
      .replace(/\\/g, '/');
    const full = path.join(this.uploadRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data.live.buffer);

    const rec = await this.prisma.employeeAttendance.upsert({
      where: { employeeId_date: { employeeId: emp.id, date } },
      create: {
        employeeId: emp.id,
        branchId: emp.branchId,
        date,
        arrivedAt,
        expectedMin: sch.arriveMin,
        status,
        scanPath: rel,
        livenessOk: true,
        matchScore: verdict?.score ?? 70,
        scannedById: user.id,
        note: verdict?.note || null,
      },
      update: {
        arrivedAt,
        expectedMin: sch.arriveMin,
        status,
        scanPath: rel,
        livenessOk: true,
        matchScore: verdict?.score ?? 70,
        scannedById: user.id,
        note: verdict?.note || null,
      },
    });

    await this.markKpiDone(emp.branchId, date, user.id);
    return {
      ok: true,
      status: rec.status,
      arrivedAt: rec.arrivedAt?.toISOString(),
      arrivedLabel: rec.arrivedAt ? this.clockLabel(rec.arrivedAt) : null,
      expectedArrive: formatHm(sch.arriveMin),
      expectedLeave: sch.leaveMin != null ? formatHm(sch.leaveMin) : null,
      name: this.fullName(emp),
      late: rec.status === AttendanceStatus.LATE,
    };
  }

  private async markKpiDone(branchId: string, date: Date, userId: string) {
    const node = await this.prisma.kpiCatalogNode.findUnique({
      where: { key: ATTENDANCE_NODE_KEY },
    });
    if (!node) return;
    await this.prisma.kpiDayEntry.upsert({
      where: { branchId_date_nodeKey: { branchId, date, nodeKey: ATTENDANCE_NODE_KEY } },
      create: {
        branchId,
        date,
        nodeKey: ATTENDANCE_NODE_KEY,
        done: true,
        score: 100,
        userId,
        value: { attendance: true } as any,
      },
      update: { done: true, score: 100, userId },
    });
  }

  async refreshAbsents(date = toDateOnly(tashkentClock().dateISO)) {
    const dateStr = date.toISOString().slice(0, 10);
    const employees = await this.prisma.branchEmployee.findMany({
      where: { active: true },
    });
    const existing = await this.prisma.employeeAttendance.findMany({
      where: { date },
    });
    const have = new Set(existing.map((a) => a.employeeId));
    const now = new Date();
    for (const e of employees) {
      const sch = scheduleForDay(e, dateStr);
      if (!sch.works) continue;
      const rec = existing.find((a) => a.employeeId === e.id);
      if (rec?.arrivedAt) continue;
      const st = this.statusOf(null, sch.arriveMin, now);
      if (st !== AttendanceStatus.ABSENT) continue;
      if (have.has(e.id)) {
        if (rec && rec.status !== AttendanceStatus.ABSENT) {
          await this.prisma.employeeAttendance.update({
            where: { id: rec.id },
            data: { status: AttendanceStatus.ABSENT, expectedMin: sch.arriveMin },
          });
        }
        continue;
      }
      await this.prisma.employeeAttendance.create({
        data: {
          employeeId: e.id,
          branchId: e.branchId,
          date,
          expectedMin: sch.arriveMin,
          status: AttendanceStatus.ABSENT,
        },
      });
    }
  }

  async buildReportHtml(hour: number) {
    const dateISO = tashkentClock().dateISO;
    const date = toDateOnly(dateISO);
    await this.refreshAbsents(date);
    const branches = await this.prisma.branch.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    const employees = await this.prisma.branchEmployee.findMany({
      where: { active: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const att = await this.prisma.employeeAttendance.findMany({ where: { date } });
    const byEmp = new Map(att.map((a) => [a.employeeId, a]));
    const now = new Date();
    const lines: string[] = [];
    let arrived = 0;
    let late = 0;
    let absent = 0;
    let pending = 0;

    for (const b of branches) {
      const list = employees.filter((e) => e.branchId === b.id);
      if (!list.length) continue;
      lines.push(`<b>${tgEscape(b.name)}</b>`);
      for (const e of list) {
        const sch = scheduleForDay(e, dateISO);
        if (!sch.works) continue;
        const rec = byEmp.get(e.id);
        const status = rec
          ? rec.status
          : this.statusOf(null, sch.arriveMin, now);
        const name = tgEscape(this.fullName(e));
        const exp = formatHm(sch.arriveMin);
        const leave = sch.leaveMin != null ? `–${formatHm(sch.leaveMin)}` : '';
        if (status === AttendanceStatus.ON_TIME && rec?.arrivedAt) {
          arrived += 1;
          lines.push(`✅ ${name} — ${this.clockLabel(rec.arrivedAt)} (kutilgan ${exp}${leave})`);
        } else if (status === AttendanceStatus.LATE && rec?.arrivedAt) {
          late += 1;
          lines.push(`⚠️ ${name} — ${this.clockLabel(rec.arrivedAt)} kech (kutilgan ${exp}${leave})`);
        } else if (status === AttendanceStatus.ABSENT) {
          absent += 1;
          lines.push(`❌ ${name} — kelmadi (kutilgan ${exp}${leave})`);
        } else {
          pending += 1;
          lines.push(`○ ${name} — hali yoʻq (kutilgan ${exp}${leave})`);
        }
      }
      lines.push('');
    }

    if (!employees.length) {
      return { empty: true, html: '' };
    }

    const html = tgCard({
      emoji: '🧑‍⚕️',
      category: `${String(hour).padStart(2, '0')}:00`,
      title: `Davomat · ${dateISO}`,
      meta: [
        `✅ ${arrived}`,
        `⚠️ kech ${late}`,
        `❌ ${absent}`,
        `○ ${pending}`,
      ],
      compact: true,
      htmlLines: [
        'Har bir hodimning o‘z kelish–ketish jadvali.',
        'Kechikish: kutilgan kelishdan +30 daqiqa.',
        '',
        ...lines,
      ],
    });
    return { empty: false, html, arrived, late, absent, pending };
  }

  @Cron('0 10,14,18,20 * * *', { timeZone: TZ })
  async attendancePulseCron() {
    try {
      const day = await this.calendar.getDayInfo();
      if (day.restDay) return;
      const hour = tashkentClock().hour;
      const report = await this.buildReportHtml(hour);
      if (report.empty) return;
      await this.telegram.sendCard(report.html, { buttons: false });
    } catch (e) {
      this.logger.warn(`Attendance pulse failed: ${e}`);
    }
  }
}
