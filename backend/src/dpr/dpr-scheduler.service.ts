import { Injectable, Logger } from "@nestjs/common";
import { DprStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationCategory } from "../notifications/notification-category.enum";
import { WorkdayService } from "../workday/workday.service";
import { CalendarService } from "../calendar/calendar.service";

/** Timezone-aware DPR reminder/escalation worker. The queue runs every 15 minutes; the organization
 * calendar decides which local minute is the actual reminder/SLA, so changing company settings does
 * not require redeploying the worker. */
@Injectable()
export class DprSchedulerService {
  private readonly logger = new Logger(DprSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private workdayService: WorkdayService,
    private notifications: NotificationsService,
    private calendarService: CalendarService,
  ) {}

  private localMinutes(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    return (
      Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 +
      Number(parts.find((p) => p.type === "minute")?.value ?? 0)
    );
  }

  private async findPendingToday() {
    const today = this.workdayService.startOfDay();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.workDay.findMany({
      where: {
        date: { gte: today, lt: tomorrow },
        attendanceStatus: { notIn: ["ON_LEAVE", "HOLIDAY", "WEEKEND"] },
        dprStatus: { in: [DprStatus.DRAFT] },
      },
      include: {
        employee: {
          include: { user: true, manager: { include: { user: true } } },
        },
      },
    });
  }

  private async alreadyNotifiedToday(userId: string, title: string) {
    const start = this.workdayService.startOfDay();
    return Boolean(
      await this.prisma.notification.findFirst({
        where: {
          userId,
          category: NotificationCategory.DPR_REMINDER,
          title,
          createdAt: { gte: start },
        },
        select: { id: true },
      }),
    );
  }

  async runReminderSweep() {
    const org = await this.calendarService.getOrganization();
    const now = new Date();
    const local = this.localMinutes(now, org.timezone);
    const reminder = [org.dprReminder1Minutes, org.dprReminder2Minutes].find(
      (minute) => local >= minute && local < minute + 15,
    );
    if (reminder === undefined)
      return { notified: 0, skipped: "NOT_REMINDER_WINDOW" };

    const pending = await this.findPendingToday();
    let notified = 0;
    for (const workDay of pending) {
      const title = `DPR reminder · ${reminder === org.dprReminder1Minutes ? "first" : "second"}`;
      if (await this.alreadyNotifiedToday(workDay.employee.userId, title))
        continue;
      await this.notifications.notify({
        userId: workDay.employee.userId,
        title,
        body: `Your Daily Progress Report is still in draft. Submit it before the ${Math.floor(org.dprSlaMinutes / 60)}:${String(org.dprSlaMinutes % 60).padStart(2, "0")} local-time SLA.`,
        category: NotificationCategory.DPR_REMINDER,
        emailAlso: true,
        recipientEmail: workDay.employee.user.email,
      });
      notified += 1;
    }
    this.logger.log(`DPR reminder sweep notified ${notified} employee(s).`);
    return { notified };
  }

  async runEscalationSweep() {
    const org = await this.calendarService.getOrganization();
    const now = new Date();
    const local = this.localMinutes(now, org.timezone);
    const escalationMinute = org.dprSlaMinutes + 30;
    if (local < escalationMinute || local >= escalationMinute + 15)
      return { escalated: 0, skipped: "NOT_ESCALATION_WINDOW" };

    const pending = await this.findPendingToday();
    const today = this.workdayService.startOfDay();
    let escalated = 0;
    for (const workDay of pending) {
      const already = await this.prisma.notification.findFirst({
        where: {
          userId: workDay.employee.userId,
          category: NotificationCategory.DPR_ESCALATION,
          createdAt: { gte: today },
        },
        select: { id: true },
      });
      if (already) continue;
      await this.notifications.notify({
        userId: workDay.employee.userId,
        title: "DPR overdue · escalated",
        body: `You missed today's DPR submission SLA. Your manager and HR have been notified.`,
        category: NotificationCategory.DPR_ESCALATION,
        emailAlso: true,
        recipientEmail: workDay.employee.user.email,
      });
      if (workDay.employee.manager?.user) {
        await this.notifications.notify({
          userId: workDay.employee.manager.userId!,
          title: "Team member missed DPR SLA",
          body: `${workDay.employee.firstName} ${workDay.employee.lastName} has not submitted today's DPR.`,
          category: NotificationCategory.DPR_ESCALATION,
          emailAlso: true,
          recipientEmail: workDay.employee.manager.user.email,
        });
      }
      escalated += 1;
    }
    this.logger.log(
      `DPR escalation sweep flagged ${escalated} missing DPR(s).`,
    );
    return { escalated };
  }
}
