import { Injectable, Logger } from "@nestjs/common";
import { AttendanceStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationCategory } from "../notifications/notification-category.enum";
import { WorkdayService } from "../workday/workday.service";
import { CalendarService } from "../calendar/calendar.service";

/**
 * Implements the "no check-in by cutoff → flagged absent" rule from the plan (5.1.2). Runs daily
 * via the scheduled-jobs queue (see notifications/jobs) at the configured cutoff.
 */
@Injectable()
export class AttendanceSchedulerService {
  private readonly logger = new Logger(AttendanceSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private workdayService: WorkdayService,
    private notifications: NotificationsService,
    private calendarService: CalendarService,
  ) {}

  async runAutoAbsentSweep() {
    const org = await this.calendarService.getOrganization();
    const today = this.workdayService.startOfDay(new Date(), org.timezone);
    const calendar = await this.calendarService.isWorkingDay(today);
    if (!calendar.working) return { flagged: 0, skipped: calendar.type };
    const localParts = new Intl.DateTimeFormat("en-US", {
      timeZone: org.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const localMinutes =
      Number(localParts.find((p) => p.type === "hour")?.value ?? 0) * 60 +
      Number(localParts.find((p) => p.type === "minute")?.value ?? 0);
    if (localMinutes < org.attendanceAbsenceCutoffMinutes)
      return { flagged: 0, skipped: "BEFORE_CUTOFF" };
    const activeEmployees = await this.prisma.employee.findMany({
      where: { deletedAt: null, employmentStatus: { not: "EXITED" } },
      include: { user: true, manager: { include: { user: true } } },
    });

    let flagged = 0;
    for (const employee of activeEmployees) {
      const workDay = await this.workdayService.getOrCreate(employee.id, today);
      if (
        workDay.checkInAt ||
        workDay.attendanceStatus !== AttendanceStatus.ABSENT
      )
        continue;

      // Skip if on approved leave or holiday — those states are set explicitly elsewhere and
      // would already differ from the default ABSENT if applied before this sweep runs.
      await this.prisma.workDay.update({
        where: { id: workDay.id },
        data: { attendanceStatus: AttendanceStatus.ABSENT },
      });

      await this.notifications.notify({
        userId: employee.userId,
        title: "No check-in recorded today",
        body: `You have not checked in today. You have been marked absent unless leave is applied.`,
        category: NotificationCategory.GENERAL,
        emailAlso: true,
        recipientEmail: employee.user.email,
      });
      if (employee.manager?.user) {
        await this.notifications.notify({
          userId: employee.manager.userId!,
          title: "Team member marked absent",
          body: `${employee.firstName} ${employee.lastName} has no check-in recorded and was marked absent after the configured cutoff.`,
          category: NotificationCategory.GENERAL,
          emailAlso: false,
        });
      }
      flagged += 1;
    }

    this.logger.log(
      `Auto-absent sweep flagged ${flagged} employee(s) with no check-in.`,
    );
    return { flagged };
  }
}
