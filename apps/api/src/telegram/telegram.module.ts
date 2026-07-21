import { Module, forwardRef } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [forwardRef(() => StaffModule)],
  providers: [TelegramBotService],
  exports: [TelegramBotService],
})
export class TelegramModule {}
