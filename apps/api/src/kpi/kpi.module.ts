import { Module, forwardRef } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { KpiController } from './kpi.controller';
import { ScoringService } from './scoring.service';
import { ManagerKpiService } from './manager-kpi.service';
import { ManagerKpiController } from './manager-kpi.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffModule } from '../staff/staff.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [
    forwardRef(() => NotificationsModule),
    forwardRef(() => StaffModule),
    BranchesModule,
  ],
  providers: [KpiService, ScoringService, ManagerKpiService],
  controllers: [KpiController, ManagerKpiController],
  exports: [KpiService, ScoringService, ManagerKpiService],
})
export class KpiModule {}
