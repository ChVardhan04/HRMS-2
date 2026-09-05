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

    // IMPORTANT: every pattern below is evaluated by BullMQ in `timezone`
    // (the organization's local time), because `tz` is passed in the repeat
    // options. They must therefore be written as LOCAL times.
    //
    // These previously contained UTC-shifted values *and* the tz option, so
    // every job was double-converted and fired at the wrong local time — e.g.
    // "30 18 * * *" was commented "00:00 IST" but actually ran at 18:30 IST.
    const schedules: Array<{ name: JobName; cron: string }> = [
      { name: JobName.DPR_REMINDER_SWEEP, cron: "*/15 * * * *" }, // service checks organization-local reminder windows
      { name: JobName.DPR_ESCALATION_SWEEP, cron: "*/15 * * * *" }, // service checks organization-local SLA + 30 minutes
      { name: JobName.STALE_CANDIDATE_SWEEP, cron: "0 9 * * *" }, // 09:00 local
      { name: JobName.GROUP_CHECK_REMINDER_SWEEP, cron: "0 10 * * *" }, // 10:00 local
      { name: JobName.KRA_DAILY_CALC, cron: "0 23 * * *" }, // 23:00 local, after the working day has closed
      { name: JobName.KRA_PRECALC, cron: "30 10 25 * *" }, // 25th, 10:30 local
      // Runs AFTER the daily calculation so month-end finalization is never
      // overwritten by a later projection sweep on the same evening.
      { name: JobName.KRA_FINALIZE, cron: "45 23 * * *" }, // 23:45 local; handler finalizes only on each employee's last working day
      { name: JobName.LEAVE_ACCRUAL, cron: "0 1 1 * *" }, // 1st of month, 01:00 local
      { name: JobName.STRIKE_EVALUATION, cron: "30 1 1 * *" }, // 1st of month, 01:30 local
      { name: JobName.AUTO_ABSENT_SWEEP, cron: "*/15 * * * *" }, // service checks the organization-configured local cutoff
      { name: JobName.BIRTHDAY_SWEEP, cron: "30 8 * * *" }, // 08:30 local
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
