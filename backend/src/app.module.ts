import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { BullModule } from "@nestjs/bullmq";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { EmployeesModule } from "./employees/employees.module";
import { DepartmentsModule } from "./departments/departments.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { WorkdayModule } from "./workday/workday.module";
import { TodosModule } from "./todos/todos.module";
import { DprModule } from "./dpr/dpr.module";
import { LeaveModule } from "./leave/leave.module";
import { AtsModule } from "./ats/ats.module";
import { GroupMonitorModule } from "./group-monitor/group-monitor.module";
import { KraModule } from "./kra/kra.module";
import { StrikesModule } from "./strikes/strikes.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ReportsModule } from "./reports/reports.module";
import { AuditModule } from "./audit/audit.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { CalendarModule } from "./calendar/calendar.module";
import { PoliciesModule } from "./policies/policies.module";
import { DocumentsModule } from "./documents/documents.module";
import { RolesGuard } from "./common/guards/roles.guard";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";

const redisConfigured = Boolean(process.env.REDIS_HOST);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL ?? 60) * 1000,
        limit: Number(process.env.RATE_LIMIT_MAX ?? 100),
      },
    ]),

    ScheduleModule.forRoot(),

    ...(redisConfigured
      ? [
BullModule.forRoot({
  connection: process.env.REDIS_URL
    ? {
        url: process.env.REDIS_URL,
      }
    : {
        host: process.env.REDIS_HOST ?? "localhost",
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined,
      },
}),
        ]
      : []),

    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    EmployeesModule,
    DepartmentsModule,
    AttendanceModule,
    WorkdayModule,
    TodosModule,
    DprModule,
    LeaveModule,
    AtsModule,
    GroupMonitorModule,
    KraModule,
    StrikesModule,
    NotificationsModule,
    ReportsModule,
    IntegrationsModule,
    CalendarModule,
    PoliciesModule,
    DocumentsModule,
  ],

  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
