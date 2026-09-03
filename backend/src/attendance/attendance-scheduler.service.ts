import { Injectable, Logger } from "@nestjs/common";
import { AttendanceStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationCategory } from "../notifications/notification-category.enum";
import { WorkdayService } from "../workday/workday.service";
import { CalendarService } from "../calendar/calendar.service";

@Injectable()
export class AttendanceSchedulerService {
  private readonly logger = new Logger(AttendanceSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private workdayService: WorkdayService,
    private notifications: NotificationsService,
    private calendarService: CalendarService,
  ) {}

  private localMinutes(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
    return Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  }

  async runAutoAbsentSweep() {
    const now = new Date();
    const org = await this.calendarService.getOrganization();
    const today = this.workdayService.startOfDay(now, org.timezone);
    const activeEmployees = await this.prisma.employee.findMany({
      where: { deletedAt: null, employmentStatus: { not: "EXITED" } },
      include: { user: true, manager: { include: { user: true } } },
    });

    let flagged = 0;
    for (const employee of activeEmployees) {
      const policy = await this.calendarService.getEmployeePolicy(employee.id);
      const dayPolicy = await this.calendarService.isWorkingDayForEmployee(employee.id, today);
      if (!dayPolicy.working) continue;
      if (this.localMinutes(now, policy.timezone) < policy.autoAbsentMinutes) continue;

      const workDay = await this.workdayService.getOrCreate(employee.id, today);
      if (workDay.checkInAt) continue;
      if (workDay.attendanceStatus !== AttendanceStatus.ABSENT) continue;
      // Idempotency: once the daily absence notification was sent, later scheduler runs do nothing.
      if (workDay.absenceNotifiedAt) continue;

      const claimed = await this.prisma.workDay.updateMany({
        where: { id: workDay.id, checkInAt: null, absenceNotifiedAt: null },
        data: { attendanceStatus: AttendanceStatus.ABSENT, absenceNotifiedAt: now },
      });
      if (claimed.count !== 1) continue;

      await this.notifications.notify({
        userId: employee.userId,
        title: "No check-in recorded today",
        body: "You have not checked in today. You have been marked absent unless approved leave is applied.",
        category: NotificationCategory.GENERAL,
        emailAlso: true,
        recipientEmail: employee.user.email,
      });
      if (employee.manager?.user) {
        await this.notifications.notify({
          userId: employee.manager.userId!,
          title: "Team member marked absent",
          body: `${employee.firstName} ${employee.lastName} has no check-in recorded and was marked absent after the department cutoff.`,
          category: NotificationCategory.GENERAL,
          emailAlso: false,
        });
      }
      flagged += 1;
    }

    this.logger.log(`Auto-absent sweep flagged ${flagged} employee(s) with no check-in.`);
    return { flagged };
  }
}
