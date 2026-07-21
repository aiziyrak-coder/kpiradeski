import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { KpiModule } from './kpi/kpi.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DoctorsModule } from './doctors/doctors.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { TelegramModule } from './telegram/telegram.module';
import { HealthModule } from './health/health.module';
import { CalendarModule } from './common/calendar.module';
import { StaffModule } from './staff/staff.module';
import { PositionsModule } from './positions/positions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CalendarModule,
    HealthModule,
    AuthModule,
    UsersModule,
    KpiModule,
    DashboardModule,
    TelegramModule,
    NotificationsModule,
    DoctorsModule,
    SettingsModule,
    ReportsModule,
    AuditModule,
    StaffModule,
    PositionsModule,
  ],
})
export class AppModule {}
