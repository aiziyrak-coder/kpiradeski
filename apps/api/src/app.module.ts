import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { KpiModule } from './kpi/kpi.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { TelegramModule } from './telegram/telegram.module';
import { HealthModule } from './health/health.module';
import { CalendarModule } from './common/calendar.module';
import { StaffModule } from './staff/staff.module';
import { BranchesModule } from './branches/branches.module';
import { AssistantModule } from './assistant/assistant.module';
import { AttendanceModule } from './attendance/attendance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CalendarModule,
    HealthModule,
    AuthModule,
    UsersModule,
    BranchesModule,
    KpiModule,
    DashboardModule,
    TelegramModule,
    NotificationsModule,
    SettingsModule,
    ReportsModule,
    AuditModule,
    StaffModule,
    AssistantModule,
    AttendanceModule,
  ],
})
export class AppModule {}
