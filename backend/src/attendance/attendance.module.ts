import { Module } from "@nestjs/common";
import { AttendanceService } from "./attendance.service";
import { AttendanceController } from "./attendance.controller";
import { AttendanceSchedulerService } from "./attendance-scheduler.service";
import { WorkdayModule } from "../workday/workday.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CalendarModule } from "../calendar/calendar.module";

@Module({
  imports: [WorkdayModule, NotificationsModule, CalendarModule],
  providers: [AttendanceService, AttendanceSchedulerService],
  controllers: [AttendanceController],
  exports: [AttendanceService, AttendanceSchedulerService],
})
export class AttendanceModule {}
