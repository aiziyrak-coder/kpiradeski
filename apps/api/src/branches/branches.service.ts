import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  list(activeOnly = false) {
    return this.prisma.branch.findMany({
      where: activeOnly ? { active: true } : undefined,
      include: {
        managers: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true, active: true } },
          },
        },
        _count: { select: { kpiEntries: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async mine(userId: string, role: Role) {
    if (role === Role.SUPER_ADMIN || role === Role.ADMIN) {
      return this.list(true);
    }
    const links = await this.prisma.branchManager.findMany({
      where: { userId },
      include: { branch: true },
      orderBy: { createdAt: 'asc' },
    });
    return links.map((l) => l.branch).filter((b) => b.active);
  }

  async get(id: string) {
    const b = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        managers: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true, active: true } },
          },
        },
      },
    });
    if (!b) throw new NotFoundException('Filial topilmadi');
    return b;
  }

  create(data: { name: string; address?: string; active?: boolean }) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Filial nomi kerak');
    return this.prisma.branch.create({
      data: {
        name,
        address: data.address?.trim() || null,
        active: data.active ?? true,
      },
    });
  }

  async update(
    id: string,
    data: { name?: string; address?: string; active?: boolean },
  ) {
    await this.get(id);
    return this.prisma.branch.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        address: data.address === undefined ? undefined : data.address?.trim() || null,
        active: data.active,
      },
    });
  }

  async assignManager(branchId: string, userId: string) {
    await this.get(branchId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (user.role !== Role.MANAGER && user.role !== Role.ADMIN) {
      throw new BadRequestException('Faqat Manager (yoki Admin) biriktiriladi');
    }
    return this.prisma.branchManager.upsert({
      where: { branchId_userId: { branchId, userId } },
      create: { branchId, userId },
      update: {},
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async unassignManager(branchId: string, userId: string) {
    await this.prisma.branchManager.deleteMany({ where: { branchId, userId } });
    return { ok: true };
  }

  async assertCanAccessBranch(userId: string, role: Role, branchId: string) {
    if (role === Role.SUPER_ADMIN || role === Role.ADMIN) return;
    const link = await this.prisma.branchManager.findUnique({
      where: { branchId_userId: { branchId, userId } },
    });
    if (!link) throw new ForbiddenException('Bu filial sizga biriktirilmagan');
  }
}
