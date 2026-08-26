import { Module } from "@nestjs/common";
import { GroupMonitorService } from "./group-monitor.service";
import { GroupMonitorController } from "./group-monitor.controller";
import { GroupMonitorSchedulerService } from "./group-monitor-scheduler.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { WorkdayModule } from "../workday/workday.module";

@Module({
  imports: [NotificationsModule, WorkdayModule],
  providers: [GroupMonitorService, GroupMonitorSchedulerService],
  controllers: [GroupMonitorController],
  exports: [GroupMonitorService, GroupMonitorSchedulerService],
})
export class GroupMonitorModule {}
