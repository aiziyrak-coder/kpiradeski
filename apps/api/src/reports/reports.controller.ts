import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { IsString } from 'class-validator';
import { ReportsService } from './reports.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';
import { Role } from '@prisma/client';

class RangeQuery {
  @IsString() from: string;
  @IsString() to: string;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DIRECTOR, Role.MANAGER, Role.SUPER_ADMIN)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get()
  range(@Query() q: RangeQuery) {
    return this.reports.getRange(q.from, q.to);
  }

  @Get('excel')
  async excel(@Query() q: RangeQuery, @Res() res: Response) {
    const buf = await this.reports.excel(q.from, q.to);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=klinikpi-${q.from}-${q.to}.xlsx`);
    res.send(buf);
  }

  @Get('pdf')
  async pdf(@Query() q: RangeQuery, @Res() res: Response) {
    const buf = await this.reports.pdf(q.from, q.to);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=klinikpi-${q.from}-${q.to}.pdf`);
    res.send(buf);
  }
}
