import { Module } from "@nestjs/common";
import { LeaveService } from "./leave.service";
import { LeaveController } from "./leave.controller";
import { LeaveSchedulerService } from "./leave-scheduler.service";
import { WorkdayModule } from "../workday/workday.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CalendarModule } from "../calendar/calendar.module";

@Module({
  imports: [WorkdayModule, NotificationsModule, CalendarModule],
  providers: [LeaveService, LeaveSchedulerService],
  controllers: [LeaveController],
  exports: [LeaveService, LeaveSchedulerService],
})
export class LeaveModule {}
