import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { SCHEDULED_JOBS_QUEUE } from "./jobs/queue.constants";
import { ScheduledJobsProcessor } from "./jobs/scheduled-jobs.processor";
import { QueueSchedulerService } from "./jobs/queue-scheduler.service";

@Module({
  imports: [BullModule.registerQueue({ name: SCHEDULED_JOBS_QUEUE })],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    ScheduledJobsProcessor,
    QueueSchedulerService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
