import { Injectable, Logger } from "@nestjs/common";
import { StrikeStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { KraService } from "./kra.service";
import { StrikesService } from "../strikes/strikes.service";
import { CalendarService } from "../calendar/calendar.service";

/** Monthly result-driven KRA finalization, using each employee's designation metrics and HRMS evidence. */
@Injectable()
export class KraSchedulerService {
  private readonly logger = new Logger(KraSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private kraService: KraService,
    private strikesService: StrikesService,
    private calendarService: CalendarService,
  ) {}

  private localDateParts(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(date);
    return { year:Number(parts.find(p=>p.type==="year")?.value), month:Number(parts.find(p=>p.type==="month")?.value), day:Number(parts.find(p=>p.type==="day")?.value) };
  }

  /**
   * Final monthly KRA processing runs on the 7th of each month for the
   * immediately preceding month. Employees have the entire previous calendar
   * month to enter/update commitments; once the month closes, commitments are
   * locked and the 7th-day job calculates the final result from the saved
   * designation metrics, employee results and recorded HRMS evidence.
   */
  async runMonthlyFinalizationOnSeventh(date = new Date()) {
    const org = await this.calendarService.getOrganization();
    const parts = this.localDateParts(date, org.timezone);
    if (parts.day !== 7) {
      this.logger.log(`KRA monthly finalization skipped because today is ${parts.day}, not the configured 7th-day calculation date.`);
      return { finalized: 0, failed: 0, skipped: true };
    }

    const previous = new Date(Date.UTC(parts.year, parts.month - 2, 1));
    const month = previous.getUTCMonth() + 1;
    const year = previous.getUTCFullYear();
    const employees = await this.prisma.employee.findMany({
      where: { employmentStatus: { not: "EXITED" }, deletedAt: null },
      select: { id: true },
    });

    let finalized = 0;
    let skipped = 0;
    const failures: Array<{ employeeId: string; reason: string }> = [];

    for (const employee of employees) {
      try {
        const template = await this.kraService.getTemplateForEmployee(employee.id);
        if (!template.items.length) {
          skipped++;
          continue;
        }
        const score = await this.kraService.calculateForEmployee(employee.id, month, year);
        await this.kraService.finalize(score.id);
        await this.strikesService.evaluateForScore(score.id);
        finalized++;
      } catch (error) {
        failures.push({ employeeId: employee.id, reason: (error as Error).message });
      }
    }

    if (failures.length) {
      this.logger.warn(
        `KRA finalization for ${month}/${year} failed for ${failures.length} employee(s): ` +
          failures.map((f) => `${f.employeeId} (${f.reason})`).join("; "),
      );
    }
    this.logger.log(`KRA monthly finalization complete for ${month}/${year}: ${finalized} finalized, ${skipped} skipped, ${failures.length} failed.`);
    return { finalized, skipped, failed: failures.length, failures, month, year };
  }

  async runStrikeEvaluation() {
    const expired = await this.prisma.strike.updateMany({ where:{status:StrikeStatus.ACTIVE,expiresAt:{lt:new Date()}}, data:{status:StrikeStatus.EXPIRED} });
    this.logger.log(`Strike evaluation expired ${expired.count} strike(s) outside the rolling window.`);
    return { expired:expired.count };
  }
}
