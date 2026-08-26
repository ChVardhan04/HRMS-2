import { Injectable, Logger } from "@nestjs/common";
import { StrikeStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { KraService } from "./kra.service";
import { StrikesService } from "../strikes/strikes.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CalendarService } from "../calendar/calendar.service";
import { NotificationCategory } from "../notifications/notification-category.enum";

const AT_RISK_THRESHOLD = 80;

/** Implements plan 8.3/12.2/23: pre-calc on the 25th (mid-month risk alert), finalize on the last working day. */
@Injectable()
export class KraSchedulerService {
  private readonly logger = new Logger(KraSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private kraService: KraService,
    private strikesService: StrikesService,
    private notifications: NotificationsService,
    private calendarService: CalendarService,
  ) {}

  private async isLastWorkingDayOfMonth(date = new Date()) {
    const org = await this.calendarService.getOrganization();
    const timezoneParts = new Intl.DateTimeFormat("en-US", {
      timeZone: org.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = Number(timezoneParts.find((p) => p.type === "year")?.value);
    const month = Number(timezoneParts.find((p) => p.type === "month")?.value);
    const day = Number(timezoneParts.find((p) => p.type === "day")?.value);
    const localDate = new Date(Date.UTC(year, month - 1, day));
    const last = new Date(Date.UTC(year, month, 0));
    while (!(await this.calendarService.isWorkingDay(last)).working)
      last.setUTCDate(last.getUTCDate() - 1);
    return localDate.getTime() === last.getTime();
  }

  async runPreCalculation() {
    const now = new Date();
    const org = await this.calendarService.getOrganization();
    const employees = await this.prisma.employee.findMany({
      where: { employmentStatus: { not: "EXITED" } },
      include: { user: true },
    });

    let atRisk = 0;
    for (const employee of employees) {
      const score = await this.kraService.calculateForEmployee(
        employee.id,
        now.getMonth() + 1,
        now.getFullYear(),
      );
      if (Number(score.finalScore) < org.kraStrikeThresholdScore) {
        atRisk += 1;
        await this.notifications.notify({
          userId: employee.userId,
          title: "Mid-month performance check-in",
          body: `Your projected KRA score this month is ${score.finalScore}%, below the ${org.kraStrikeThresholdScore}% target. There's still time to improve before month-end.`,
          category: NotificationCategory.KRA,
          emailAlso: true,
          recipientEmail: employee.user.email,
        });
      }
    }

    this.logger.log(
      `KRA pre-calculation complete. ${atRisk} employee(s) at risk.`,
    );
    return { atRisk, total: employees.length };
  }

  async runFinalizationIfLastWorkingDay() {
    if (!(await this.isLastWorkingDayOfMonth())) {
      this.logger.log("Not the last working day — skipping KRA finalization.");
      return { skipped: true };
    }

    const now = new Date();
    const employees = await this.prisma.employee.findMany({
      where: { employmentStatus: { not: "EXITED" } },
    });

    for (const employee of employees) {
      const score = await this.kraService.calculateForEmployee(
        employee.id,
        now.getMonth() + 1,
        now.getFullYear(),
      );
      await this.kraService.finalize(score.id);
      await this.strikesService.evaluateForScore(score.id);
    }

    this.logger.log(
      `KRA finalized for ${employees.length} employee(s). Month-end report is available via /reports/month-end.`,
    );
    return { finalized: employees.length };
  }

  async runStrikeEvaluation() {
    const expired = await this.prisma.strike.updateMany({
      where: { status: StrikeStatus.ACTIVE, expiresAt: { lt: new Date() } },
      data: { status: StrikeStatus.EXPIRED },
    });
    this.logger.log(
      `Strike evaluation expired ${expired.count} strike(s) outside the rolling window.`,
    );
    return { expired: expired.count };
  }
}
