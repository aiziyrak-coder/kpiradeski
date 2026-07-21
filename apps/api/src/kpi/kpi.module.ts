import { Module, forwardRef } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { KpiController } from './kpi.controller';
import { ScoringService } from './scoring.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [forwardRef(() => NotificationsModule), forwardRef(() => StaffModule)],
  providers: [KpiService, ScoringService],
  controllers: [KpiController],
  exports: [KpiService, ScoringService],
})
export class KpiModule {}
