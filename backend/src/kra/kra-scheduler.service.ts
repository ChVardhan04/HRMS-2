import { Injectable, Logger } from "@nestjs/common";
import { StrikeStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { KraService } from "./kra.service";
import { StrikesService } from "../strikes/strikes.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CalendarService } from "../calendar/calendar.service";
import { NotificationCategory } from "../notifications/notification-category.enum";

/** Daily projected KRA + month-end finalization, using each employee's department calendar. */
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

  private localDateParts(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(date);
    return { year:Number(parts.find(p=>p.type==="year")?.value), month:Number(parts.find(p=>p.type==="month")?.value), day:Number(parts.find(p=>p.type==="day")?.value) };
  }

  private async lastWorkingDayForEmployee(employeeId: string, date = new Date()) {
    const org = await this.calendarService.getOrganization();
    const { year, month } = this.localDateParts(date, org.timezone);
    const last = new Date(Date.UTC(year, month, 0));
    while (!(await this.calendarService.isWorkingDayForEmployee(employeeId, last)).working) last.setUTCDate(last.getUTCDate()-1);
    return last;
  }

  private async isEmployeeLastWorkingDay(employeeId: string, date = new Date()) {
    const org = await this.calendarService.getOrganization();
    const local = this.localDateParts(date, org.timezone);
    const current = new Date(Date.UTC(local.year, local.month-1, local.day));
    const last = await this.lastWorkingDayForEmployee(employeeId, date);
    return current.getTime() === last.getTime();
  }

  async runDailyCalculation() {
    const now = new Date();
    const org = await this.calendarService.getOrganization();
    const parts = this.localDateParts(now, org.timezone);
    const employees = await this.prisma.employee.findMany({ where:{ employmentStatus:{not:"EXITED"}, deletedAt:null }, select:{id:true} });
    let calculated = 0;
    let skipped = 0;
    const failures: Array<{ employeeId: string; reason: string }> = [];

    for (const employee of employees) {
      // Each employee is isolated. Previously a single employee without a KRA
      // template threw NotFoundException out of the loop and aborted the entire
      // batch, so every employee after them silently received no KRA that day.
      try {
        const working = await this.calendarService.isWorkingDayForEmployee(employee.id, now);
        if (!working.working) { skipped++; continue; }
        await this.kraService.calculateDailyForEmployee(employee.id, now);
        await this.kraService.syncMonthlyProjection(employee.id, parts.month, parts.year);
        calculated++;
      } catch (error) {
        failures.push({ employeeId: employee.id, reason: (error as Error).message });
      }
    }

    if (failures.length) {
      this.logger.warn(
        `Daily KRA calculation could not score ${failures.length} employee(s): ` +
          failures.map((f) => `${f.employeeId} (${f.reason})`).join("; "),
      );
    }
    this.logger.log(`Daily KRA calculation complete: ${calculated} employee(s), ${skipped} non-working-day skips, ${failures.length} failure(s).`);
    return { calculated, skipped, failed: failures.length, failures };
  }

  async runPreCalculation() {
    const now = new Date();
    const org = await this.calendarService.getOrganization();
    const employees = await this.prisma.employee.findMany({ where:{ employmentStatus:{not:"EXITED"}, deletedAt:null }, include:{user:true} });
    let atRisk = 0;
    const failures: Array<{ employeeId: string; reason: string }> = [];

    for (const employee of employees) {
      try {
        const score = await this.kraService.calculateForEmployee(employee.id, now.getMonth()+1, now.getFullYear());
        if (Number(score.finalScore) < org.kraStrikeThresholdScore) {
          atRisk++;
          await this.notifications.notify({ userId:employee.userId, title:"Mid-month performance check-in", body:`Your projected KRA score this month is ${score.finalScore}%, below the ${org.kraStrikeThresholdScore}% target. There's still time to improve before month-end.`, category:NotificationCategory.KRA, emailAlso:true, recipientEmail:employee.user.email });
        }
      } catch (error) {
        failures.push({ employeeId: employee.id, reason: (error as Error).message });
      }
    }

    if (failures.length) {
      this.logger.warn(`KRA pre-calculation skipped ${failures.length} employee(s): ` + failures.map((f) => `${f.employeeId} (${f.reason})`).join("; "));
    }
    this.logger.log(`KRA pre-calculation complete. ${atRisk} employee(s) at risk, ${failures.length} failure(s).`);
    return { atRisk, total:employees.length, failed: failures.length, failures };
  }

  async runFinalizationIfLastWorkingDay() {
    const now = new Date();
    const org = await this.calendarService.getOrganization();
    const parts = this.localDateParts(now, org.timezone);
    const employees = await this.prisma.employee.findMany({ where:{ employmentStatus:{not:"EXITED"}, deletedAt:null } });
    let finalized = 0;
    const failures: Array<{ employeeId: string; reason: string }> = [];

    for (const employee of employees) {
      try {
        if (!(await this.isEmployeeLastWorkingDay(employee.id, now))) continue;
        // Recalculate from the full month's evidence, finalize, THEN evaluate
        // strikes. finalize() must happen before evaluateForScore() because the
        // strike engine now refuses to act on a non-final score.
        const score = await this.kraService.calculateForEmployee(employee.id, parts.month, parts.year);
        await this.kraService.finalize(score.id);
        await this.strikesService.evaluateForScore(score.id);
        finalized++;
      } catch (error) {
        failures.push({ employeeId: employee.id, reason: (error as Error).message });
      }
    }

    if (failures.length) {
      this.logger.warn(`KRA finalization failed for ${failures.length} employee(s): ` + failures.map((f) => `${f.employeeId} (${f.reason})`).join("; "));
    }
    if (!finalized) this.logger.log("No employee reached their department-specific last working day — KRA finalization skipped.");
    else this.logger.log(`KRA finalized for ${finalized} employee(s).`);
    return { finalized, failed: failures.length, failures };
  }

  async runStrikeEvaluation() {
    const expired = await this.prisma.strike.updateMany({ where:{status:StrikeStatus.ACTIVE,expiresAt:{lt:new Date()}}, data:{status:StrikeStatus.EXPIRED} });
    this.logger.log(`Strike evaluation expired ${expired.count} strike(s) outside the rolling window.`);
    return { expired:expired.count };
  }
}
