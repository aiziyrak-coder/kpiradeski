import { Module, forwardRef } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { BranchesModule } from '../branches/branches.module';
import { CalendarModule } from '../common/calendar.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [BranchesModule, CalendarModule, forwardRef(() => TelegramModule)],
  providers: [AttendanceService],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}
