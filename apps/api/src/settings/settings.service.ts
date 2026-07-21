import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ScoringService } from '../kpi/scoring.service';
import { CalendarService } from '../common/calendar.service';
import { toDateOnly } from '../common/kpi.constants';

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private scoring: ScoringService,
    private calendar: CalendarService,
  ) {}

  getWeights() {
    return this.prisma.kpiWeight.findMany({ orderBy: { blockKey: 'asc' } });
  }

  getCalendar() {
    return this.calendar.calendarConfig();
  }

  getDayInfo(date?: string) {
    return this.calendar.getDayInfo(date);
  }

  setRestWeekdays(days: number[]) {
    return this.calendar.setRestWeekdays(days);
  }

  addHoliday(date: string, title: string) {
    return this.calendar.addHoliday(date, title);
  }

  removeHoliday(id: string) {
    return this.calendar.removeHoliday(id);
  }

  async updateWeights(items: { blockKey: string; weight: number }[]) {
    const total = items.reduce((s, i) => s + i.weight, 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new BadRequestException(`Og'irliklar yig'indisi 100 bo'lishi kerak (hozir: ${total})`);
    }
    for (const item of items) {
      await this.prisma.kpiWeight.update({
        where: { blockKey: item.blockKey },
        data: { weight: item.weight },
      });
    }
    return this.getWeights();
  }

  listProducts() {
    return this.prisma.warehouseProduct.findMany({ orderBy: { name: 'asc' } });
  }

  createProduct(data: {
    name: string;
    category: string;
    minStock: number;
    currentStock: number;
    expiryDate?: string;
    branchId?: string;
  }) {
    return this.prisma.warehouseProduct.create({
      data: {
        name: data.name,
        category: data.category,
        minStock: data.minStock,
        currentStock: data.currentStock,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        branchId: data.branchId,
      },
    });
  }

  async updateProduct(
    id: string,
    data: {
      name?: string;
      category?: string;
      minStock?: number;
      currentStock?: number;
      expiryDate?: string | null;
      branchId?: string;
    },
  ) {
    const product = await this.prisma.warehouseProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Mahsulot topilmadi');

    const updated = await this.prisma.warehouseProduct.update({
      where: { id },
      data: {
        name: data.name,
        category: data.category,
        minStock: data.minStock,
        currentStock: data.currentStock,
        expiryDate:
          data.expiryDate === null
            ? null
            : data.expiryDate
              ? new Date(data.expiryDate)
              : undefined,
        branchId: data.branchId,
      },
    });

    if (updated.currentStock <= updated.minStock) {
      await this.notifications.createForRoles(
        ['ADMIN', 'MANAGER', 'DIRECTOR', 'SUPER_ADMIN'],
        'Past zaxira',
        `${updated.name}: ${updated.currentStock} dona (min ${updated.minStock})`,
        'STOCK',
      );
    }

    // Bugungi ombor KPI ni qayta hisoblash
    await this.scoring.recalculateDailyScore(toDateOnly(new Date()));
    return updated;
  }

  async deleteProduct(id: string) {
    await this.prisma.warehouseProduct.delete({ where: { id } });
    return { ok: true };
  }

  async lowStock() {
    const products = await this.prisma.warehouseProduct.findMany();
    return products.filter((p) => p.currentStock <= p.minStock);
  }

  async expiringSoon(days = 30) {
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + days);
    return this.prisma.warehouseProduct.findMany({
      where: {
        expiryDate: { not: null, lte: until },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }
}
