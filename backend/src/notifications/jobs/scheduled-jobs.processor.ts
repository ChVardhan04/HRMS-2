import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { ModuleRef } from "@nestjs/core";
import { SCHEDULED_JOBS_QUEUE, JobName } from "./queue.constants";
import { NotificationsService } from "../notifications.service";
import { DprSchedulerService } from "../../dpr/dpr-scheduler.service";
import { CandidatesSchedulerService } from "../../ats/candidates/candidates-scheduler.service";
import { GroupMonitorSchedulerService } from "../../group-monitor/group-monitor-scheduler.service";
import { KraSchedulerService } from "../../kra/kra-scheduler.service";
import { LeaveSchedulerService } from "../../leave/leave-scheduler.service";
import { AttendanceSchedulerService } from "../../attendance/attendance-scheduler.service";

/**
 * Single worker for the scheduled-jobs queue. Each sweep's business logic lives in its owning
 * module's *SchedulerService (DPR, ATS/candidates, Group Monitor, KRA, Leave, Attendance).
 * We resolve those lazily via ModuleRef with strict:false so NotificationsModule does not need a
 * hard/circular import of every business module — this is the standard NestJS pattern for a
 * shared worker that fans out into feature-owned handlers.
 */
@Processor(SCHEDULED_JOBS_QUEUE)
export class ScheduledJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledJobsProcessor.name);

  constructor(
    private notifications: NotificationsService,
    private moduleRef: ModuleRef,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    try {
      switch (job.name) {
        case JobName.SEND_NOTIFICATION:
          return await this.notifications.notify(job.data);
        case JobName.DPR_REMINDER_SWEEP:
          return await this.resolve(DprSchedulerService).runReminderSweep();
        case JobName.DPR_ESCALATION_SWEEP:
          return await this.resolve(DprSchedulerService).runEscalationSweep();
        case JobName.STALE_CANDIDATE_SWEEP:
          return await this.resolve(
            CandidatesSchedulerService,
          ).runStaleCandidateSweep();
        case JobName.GROUP_CHECK_REMINDER_SWEEP:
          return await this.resolve(
            GroupMonitorSchedulerService,
          ).runCheckReminderSweep();
        case JobName.KRA_PRECALC:
          return await this.resolve(KraSchedulerService).runPreCalculation();
        case JobName.KRA_FINALIZE:
          return await this.resolve(
            KraSchedulerService,
          ).runFinalizationIfLastWorkingDay();
        case JobName.LEAVE_ACCRUAL:
          return await this.resolve(LeaveSchedulerService).runMonthlyAccrual();
        case JobName.STRIKE_EVALUATION:
          return await this.resolve(KraSchedulerService).runStrikeEvaluation();
        case JobName.AUTO_ABSENT_SWEEP:
          return await this.resolve(
            AttendanceSchedulerService,
          ).runAutoAbsentSweep();
        default:
          this.logger.warn(`Unhandled job: ${job.name}`);
      }
    } catch (err) {
      this.logger.error(`Job ${job.name} failed: ${(err as Error).message}`);
      throw err; // let BullMQ retry with backoff
    }
  }

  private resolve<T>(token: new (...args: any[]) => T): T {
    return this.moduleRef.get(token, { strict: false });
  }
}
