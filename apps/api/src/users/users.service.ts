import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Role, StaffPosition } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

const ROLE_RANK: Record<Role, number> = {
  STAFF: 1,
  ADMIN: 2,
  MANAGER: 3,
  DIRECTOR: 4,
  SUPER_ADMIN: 5,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        phone: true,
        telegramId: true,
        active: true,
        branchId: true,
        createdAt: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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

  async create(
    actor: { id: string; role: Role },
    data: {
      name: string;
      email: string;
      password: string;
      role: Role;
      branchId?: string;
      position?: StaffPosition;
      phone?: string;
    },
  ) {
    if (!data.password || data.password.length < 8) {
      throw new BadRequestException('Parol kamida 8 belgidan iborat boʻlishi kerak');
    }
    this.assertCanAssignRole(actor.role, data.role);
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
        position: data.position,
        phone: data.phone,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        active: true,
        branchId: true,
      },
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
    return user;
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
      position?: StaffPosition | null;
      phone?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();

    if (data.role) this.assertCanAssignRole(actor.role, data.role);

    // Oʻzini oʻchirish / rolini tushirishni bloklash (SA oʻzini deaktivatsiya qilmasin)
    if (id === actor.id && data.active === false) {
      throw new BadRequestException('Oʻzingizni oʻchirib boʻlmaydi');
    }
    if (id === actor.id && data.role && data.role !== actor.role) {
      throw new BadRequestException('Oʻz rolingizni oʻzgartirib boʻlmaydi');
    }

    // Non-SA cannot edit SUPER_ADMIN
    if (actor.role !== Role.SUPER_ADMIN && user.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Super Admin hisobini tahrirlash mumkin emas');
    }

    if (data.password != null && data.password.length < 8) {
      throw new BadRequestException('Parol kamida 8 belgidan iborat boʻlishi kerak');
    }

    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        role: data.role,
        active: data.active,
        branchId: data.branchId,
        position: data.position === undefined ? undefined : data.position,
        phone: data.phone,
        ...(passwordHash ? { passwordHash, tokenVersion: { increment: 1 } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        phone: true,
        active: true,
        branchId: true,
        telegramId: true,
      },
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
    return updated;
  }
}
