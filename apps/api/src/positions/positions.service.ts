import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function slugCode(input: string) {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32) || 'POSITION';
}

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  async list(activeOnly = false) {
    return this.prisma.position.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { nameUz: 'asc' }],
    });
  }

  async get(id: string) {
    const row = await this.prisma.position.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Lavozim topilmadi');
    return row;
  }

  async create(data: {
    code?: string;
    nameUz: string;
    nameRu: string;
    active?: boolean;
    sortOrder?: number;
  }) {
    const nameUz = data.nameUz?.trim();
    const nameRu = data.nameRu?.trim();
    if (!nameUz || !nameRu) {
      throw new BadRequestException('Oʻzbek va rus nomlari kerak');
    }
    let code = data.code?.trim().toUpperCase() || slugCode(nameUz);
    const existing = await this.prisma.position.findUnique({ where: { code } });
    if (existing) code = `${code}_${Date.now().toString(36).slice(-4).toUpperCase()}`;

    return this.prisma.position.create({
      data: {
        code,
        nameUz,
        nameRu,
        active: data.active ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async update(
    id: string,
    data: {
      code?: string;
      nameUz?: string;
      nameRu?: string;
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    await this.get(id);
    if (data.code) {
      const dup = await this.prisma.position.findFirst({
        where: { code: data.code.trim().toUpperCase(), NOT: { id } },
      });
      if (dup) throw new BadRequestException('Bu kod band');
    }
    return this.prisma.position.update({
      where: { id },
      data: {
        code: data.code?.trim().toUpperCase(),
        nameUz: data.nameUz?.trim(),
        nameRu: data.nameRu?.trim(),
        active: data.active,
        sortOrder: data.sortOrder,
      },
    });
  }

  async remove(id: string) {
    const pos = await this.get(id);
    const [users, templates] = await Promise.all([
      this.prisma.user.count({ where: { positionId: id } }),
      this.prisma.taskTemplate.count({ where: { positionId: id } }),
    ]);
    if (users > 0 || templates > 0) {
      throw new BadRequestException(
        `Lavozim ishlatilmoqda (${users} xodim, ${templates} vazifa). Avval faolsizlantiring.`,
      );
    }
    await this.prisma.position.delete({ where: { id } });
    return { ok: true, code: pos.code };
  }

  label(pos: { nameUz: string; nameRu: string }, lang: 'uz' | 'ru' = 'uz') {
    return lang === 'ru' ? pos.nameRu : pos.nameUz;
  }
}
