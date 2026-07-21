import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { mapUserWithPosition, POSITION_SELECT } from '../common/position.util';

const ROLE_RANK: Record<Role, number> = {
  STAFF: 1,
  ADMIN: 2,
  MANAGER: 3,
  DIRECTOR: 4,
  SUPER_ADMIN: 5,
};

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  positionId: true,
  positionRef: { select: POSITION_SELECT },
  phone: true,
  telegramId: true,
  active: true,
  branchId: true,
  createdAt: true,
  branch: { select: { id: true, name: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => mapUserWithPosition(r));
  }

  private assertCanAssignRole(actorRole: Role, targetRole: Role) {
    if (actorRole === Role.SUPER_ADMIN) return;
    if (targetRole === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Faqat Super Admin boshqa Super Admin yaratishi mumkin');
    }
    if (ROLE_RANK[targetRole] > ROLE_RANK[actorRole]) {
      throw new ForbiddenException('Oʻzingizdan yuqori rol berib boʻlmaydi');
    }
  }

  private async validatePositionId(positionId?: string | null) {
    if (!positionId) return null;
    const pos = await this.prisma.position.findUnique({ where: { id: positionId } });
    if (!pos || !pos.active) throw new BadRequestException('Lavozim topilmadi yoki faol emas');
    return positionId;
  }

  async create(
    actor: { id: string; role: Role },
    data: {
      name: string;
      email: string;
      password: string;
      role: Role;
      branchId?: string;
      positionId?: string;
      phone?: string;
    },
  ) {
    if (!data.password || data.password.length < 8) {
      throw new BadRequestException('Parol kamida 8 belgidan iborat boʻlishi kerak');
    }
    this.assertCanAssignRole(actor.role, data.role);
    if (!([Role.ADMIN, Role.MANAGER, Role.SUPER_ADMIN] as Role[]).includes(data.role)) {
      throw new BadRequestException('Faqat Admin yoki Manager roli mumkin');
    }
    const positionId = await this.validatePositionId(data.positionId);
    const exists = await this.prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (exists) throw new ConflictException('Bu email band');
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        role: data.role,
        branchId: data.branchId,
        positionId,
        phone: data.phone,
      },
      select: USER_SELECT,
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'user_create',
        entity: 'user',
        entityId: user.id,
        meta: { email: user.email, role: user.role } as any,
      },
    });
    return mapUserWithPosition(user);
  }

  async update(
    actor: { id: string; role: Role },
    id: string,
    data: {
      name?: string;
      role?: Role;
      active?: boolean;
      branchId?: string;
      password?: string;
      positionId?: string | null;
      phone?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();

    if (data.role) this.assertCanAssignRole(actor.role, data.role);

    if (id === actor.id && data.active === false) {
      throw new BadRequestException('Oʻzingizni oʻchirib boʻlmaydi');
    }
    if (id === actor.id && data.role && data.role !== actor.role) {
      throw new BadRequestException('Oʻz rolingizni oʻzgartirib boʻlmaydi');
    }

    if (actor.role !== Role.SUPER_ADMIN && user.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Super Admin hisobini tahrirlash mumkin emas');
    }

    if (data.password != null && data.password.length < 8) {
      throw new BadRequestException('Parol kamida 8 belgidan iborat boʻlishi kerak');
    }

    let positionId: string | null | undefined = undefined;
    if (data.positionId !== undefined) {
      positionId = data.positionId === null ? null : await this.validatePositionId(data.positionId);
    }

    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        role: data.role,
        active: data.active,
        branchId: data.branchId,
        positionId,
        phone: data.phone,
        ...(passwordHash ? { passwordHash, tokenVersion: { increment: 1 } } : {}),
      },
      select: USER_SELECT,
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: data.password ? 'user_password_reset' : 'user_update',
        entity: 'user',
        entityId: id,
        meta: { fields: Object.keys(data).filter((k) => (data as any)[k] !== undefined) } as any,
      },
    });
    return mapUserWithPosition(updated);
  }
}
