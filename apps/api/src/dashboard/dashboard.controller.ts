import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get()
  overview(
    @Query('date') date?: string,
    @Query('branchId') branchId?: string,
    @CurrentUser() user?: { id: string; role: Role },
  ) {
    return this.dashboard.overview(date, {
      userId: user?.id,
      role: user?.role,
      branchId,
    });
  }
}
