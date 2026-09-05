import { Module } from "@nestjs/common";
import { JobsService } from "./jobs/jobs.service";
import { JobsController } from "./jobs/jobs.controller";
import { CandidatesService } from "./candidates/candidates.service";
import { CandidatesController } from "./candidates/candidates.controller";
import { CandidatesSchedulerService } from "./candidates/candidates-scheduler.service";
import { InterviewsService } from "./interviews/interviews.service";
import {
  InterviewsController,
  OffersController,
} from "./interviews/interviews.controller";
import { WebhooksController } from "./webhooks.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuthModule } from "../auth/auth.module";
import { AtsScreeningService } from "./screening.service";
import { AtsScreeningController } from "./screening.controller";

@Module({
  imports: [NotificationsModule, AuthModule],
  providers: [
    JobsService,
    CandidatesService,
    CandidatesSchedulerService,
    InterviewsService,
    AtsScreeningService,
  ],
  controllers: [
    JobsController,
    CandidatesController,
    InterviewsController,
    OffersController,
    WebhooksController,
    AtsScreeningController,
  ],
  exports: [
    JobsService,
    CandidatesService,
    CandidatesSchedulerService,
    InterviewsService,
    AtsScreeningService,
  ],
})
export class AtsModule {}
