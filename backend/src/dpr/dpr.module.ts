import { Module } from "@nestjs/common";
import { DprService } from "./dpr.service";
import { DprController } from "./dpr.controller";
import { DprSchedulerService } from "./dpr-scheduler.service";
import { WorkdayModule } from "../workday/workday.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TaskCompletionAiService } from "../todos/task-completion-ai.service";
import { CalendarModule } from "../calendar/calendar.module";

@Module({
  imports: [WorkdayModule, NotificationsModule, CalendarModule],
  providers: [DprService, DprSchedulerService, TaskCompletionAiService],
  controllers: [DprController],
  exports: [DprService, DprSchedulerService],
})
export class DprModule {}
