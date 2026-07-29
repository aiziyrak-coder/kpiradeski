import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { IsOptional, IsString } from 'class-validator';
import { KpiFrequency, Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';

class RangeQuery {
  @IsString() from: string;
  @IsString() to: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() frequency?: string;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER, Role.SUPER_ADMIN)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get()
  range(@Query() q: RangeQuery) {
    return this.reports.getRange(q.from, q.to, q.branchId);
  }

  @Get('analytics')
  analytics(
    @Query() q: RangeQuery,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    const frequency = ['DAILY', 'WEEKLY', 'MONTHLY'].includes(
      String(q.frequency || '').toUpperCase(),
    )
      ? (String(q.frequency).toUpperCase() as KpiFrequency)
      : KpiFrequency.DAILY;
    return this.reports.analytics({
      from: q.from,
      to: q.to,
      branchId: q.branchId,
      frequency,
      user,
    });
  }

  @Get('excel')
  async excel(@Query() q: RangeQuery, @Res() res: Response) {
    const buf = await this.reports.excel(q.from, q.to, q.branchId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=radeski-kpi-${q.from}-${q.to}.xlsx`,
    );
    res.send(buf);
  }

  @Get('pdf')
  async pdf(@Query() q: RangeQuery, @Res() res: Response) {
    const buf = await this.reports.pdf(q.from, q.to, q.branchId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=radeski-kpi-${q.from}-${q.to}.pdf`,
    );
    res.send(buf);
  }
}
