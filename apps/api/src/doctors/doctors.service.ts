import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DoctorsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.doctor.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  create(data: { name: string; specialty?: string; branchId?: string }) {
    return this.prisma.doctor.create({ data });
  }

  async update(id: string, data: { name?: string; specialty?: string; active?: boolean }) {
    const d = await this.prisma.doctor.findUnique({ where: { id } });
    if (!d) throw new NotFoundException();
    return this.prisma.doctor.update({ where: { id }, data });
  }

  async ranking() {
    const doctors = await this.prisma.doctor.findMany({
      where: { active: true },
      include: {
        stories: { orderBy: { date: 'desc' }, take: 30 },
        referrals: { orderBy: { weekStart: 'desc' }, take: 8 },
      },
    });
    return doctors
      .map((d) => {
        const posted = d.stories.filter((s) => s.posted).length;
        const total = d.stories.length || 1;
        const referrals = d.referrals.reduce((s, r) => s + r.patientsCount, 0);
        return {
          id: d.id,
          name: d.name,
          specialty: d.specialty,
          storyRate: Math.round((posted / total) * 1000) / 10,
          storiesPosted: posted,
          referrals,
        };
      })
      .sort((a, b) => b.storyRate + b.referrals - (a.storyRate + a.referrals));
  }
}
