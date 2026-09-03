import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { SCHEDULED_JOBS_QUEUE, JobName } from "./queue.constants";
import { NotifyInput } from "../notifications.service";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Owns the BullMQ repeatable-job schedule for the cross-cutting reminder/escalation jobs in the
 * Production Plan. Cron expressions are interpreted in the organization timezone read from the
 * database at startup; DPR and absence sweeps additionally evaluate their configurable minute windows.
 */
@Injectable()
export class QueueSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue(SCHEDULED_JOBS_QUEUE) private queue: Queue,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const organization = await this.prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { timezone: true },
    });
    const timezone = organization?.timezone ?? "Asia/Kolkata";
    const schedules: Array<{ name: JobName; cron: string }> = [
      { name: JobName.DPR_REMINDER_SWEEP, cron: "*/15 * * * *" }, // service checks organization-local reminder windows
      { name: JobName.DPR_ESCALATION_SWEEP, cron: "*/15 * * * *" }, // service checks organization-local SLA + 30 minutes
      { name: JobName.STALE_CANDIDATE_SWEEP, cron: "30 3 * * *" }, // 09:00 organization-local time
      { name: JobName.GROUP_CHECK_REMINDER_SWEEP, cron: "30 4 * * *" }, // 10:00 organization-local time
      { name: JobName.KRA_DAILY_CALC, cron: "30 18 * * *" }, // daily projected KRA calculation at 00:00 IST when timezone is Asia/Kolkata
      { name: JobName.KRA_PRECALC, cron: "0 5 25 * *" }, // 25th, 10:30 organization-local time
      { name: JobName.KRA_FINALIZE, cron: "30 18 * * *" }, // handler finalizes only on each employee's department-specific last working day
      { name: JobName.LEAVE_ACCRUAL, cron: "0 0 1 * *" }, // 1st of month, organization-local time
      { name: JobName.STRIKE_EVALUATION, cron: "30 0 1 * *" }, // 1st of month, organization-local time
      { name: JobName.AUTO_ABSENT_SWEEP, cron: "*/15 * * * *" }, // service checks the organization-configured local cutoff
    ];

    for (const schedule of schedules) {
      await this.queue.add(
        schedule.name,
        {},
        {
          repeat: { pattern: schedule.cron, tz: timezone },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
  }

  async enqueueNotification(input: NotifyInput) {
    return this.queue.add(JobName.SEND_NOTIFICATION, input, {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
    });
  }
}
