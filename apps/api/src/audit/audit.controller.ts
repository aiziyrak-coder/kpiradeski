import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role, Prisma } from '@prisma/client';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';

class AuditQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 30;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DIRECTOR, Role.SUPER_ADMIN, Role.MANAGER)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query() q: AuditQuery) {
    const page = q.page || 1;
    const limit = q.limit || 30;
    const where: Prisma.AuditLogWhereInput = {};

    if (q.action?.trim()) {
      where.action = { contains: q.action.trim(), mode: 'insensitive' };
    }
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) where.createdAt.lte = new Date(`${q.to}T23:59:59.999Z`);
    }
    if (q.q?.trim()) {
      const term = q.q.trim();
      where.OR = [
        { action: { contains: term, mode: 'insensitive' } },
        { entity: { contains: term, mode: 'insensitive' } },
        { entityId: { contains: term, mode: 'insensitive' } },
        { user: { name: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) || 1 };
  }
}
