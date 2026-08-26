import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LeaveStatus, RoleName } from "@prisma/client";
import { CalendarService } from "../calendar/calendar.service";

export interface KraBreakdownItem {
  weight: number;
  achievementPercent: number;
  contribution: number;
  isAutomated: boolean;
  manualScore?: number;
}

/**
 * Implements plan section 8: Monthly KRA Score = Σ(weight × achievement%), automated where the
 * plan says it can be (DPR submission %, task completion %, attendance %) and manual elsewhere
 * (DPR quality avg is itself computed from manager ratings; collaboration is fully manual until
 * Phase 3 brings Jira/GitHub metrics in).
 */
@Injectable()
export class KraService {
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
  ) {}

  async getDefaultTemplate(roleName = "All Employees") {
    let template = await this.prisma.kRATemplate.findFirst({
      where: { roleName },
      include: { items: true },
    });
    if (!template) {
      template = await this.prisma.kRATemplate.findFirst({
        where: { isDefault: true },
        include: { items: true },
      });
    }
    if (!template) throw new NotFoundException("No KRA template configured");
    return template;
  }

  private async computeAutomatedAchievement(
    employeeId: string,
    itemName: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const month = start.getUTCMonth() + 1;
    const year = start.getUTCFullYear();
    const calendar = await this.calendarService.workingDaySummary(month, year);
    const workingDates = calendar.days
      .filter((day: any) => day.working)
      .map((day: any) => day.date as string);
    const workDays = await this.prisma.workDay.findMany({
      where: { employeeId, date: { gte: start, lte: end } },
    });
    const workDayByDate = new Map(
      workDays.map((workDay) => [
        workDay.date.toISOString().slice(0, 10),
        workDay,
      ]),
    );
    const approvedLeaves = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: LeaveStatus.APPROVED,
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { startDate: true, endDate: true },
    });
    const leaveDates = new Set<string>();
    for (const leave of approvedLeaves) {
      for (
        let d = new Date(leave.startDate);
        d <= leave.endDate;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        leaveDates.add(d.toISOString().slice(0, 10));
      }
    }

    switch (itemName) {
      case "DPR_SUBMISSION": {
        const expectedDprDates = workingDates.filter(
          (date) => !leaveDates.has(date),
        );
        if (expectedDprDates.length === 0) return 100;
        const submitted = expectedDprDates.filter((date) => {
          const workDay = workDayByDate.get(date);
          return (
            !!workDay &&
            ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(
              workDay.dprStatus,
            )
          );
        }).length;
        return (submitted / expectedDprDates.length) * 100;
      }
      case "ATTENDANCE": {
        if (workingDates.length === 0) return 100;
        const present = workingDates.filter((date) => {
          if (leaveDates.has(date)) return true;
          const workDay = workDayByDate.get(date);
          return (
            !!workDay &&
            [
              "PRESENT",
              "LATE",
              "HALF_DAY",
              "ON_LEAVE",
              "WORK_FROM_HOME",
            ].includes(workDay.attendanceStatus)
          );
        }).length;
        return (present / workingDates.length) * 100;
      }
      case "TASK_COMPLETION": {
        const tasks = await this.prisma.todo.findMany({
          where: {
            assigneeId: employeeId,
            createdAt: { gte: start, lte: end },
            status: { not: "CANCELLED" },
          },
          select: { aiCompletionPercent: true, eodStatus: true, status: true },
        });
        if (tasks.length === 0) return 100;
        const analyzed = tasks.filter((t) => t.aiCompletionPercent != null);
        if (analyzed.length > 0) {
          return analyzed.reduce((sum, t) => sum + Number(t.aiCompletionPercent), 0) / analyzed.length;
        }
        const resolved = tasks.filter((t) => t.eodStatus === "COMPLETED").length;
        return (resolved / tasks.length) * 100;
      }
      case "DPR_QUALITY": {
        const dprs = await this.prisma.dPR.findMany({
          where: {
            workDay: { employeeId, date: { gte: start, lte: end } },
            qualityScore: { not: null },
          },
        });
        if (dprs.length === 0) return 70;
        const avg =
          dprs.reduce((sum, d) => sum + Number(d.qualityScore), 0) /
          dprs.length;
        return (avg / 10) * 100;
      }
      default:
        return 70;
    }
  }

  async calculateForEmployee(
    employeeId: string,
    month: number,
    year: number,
    manualScores: Record<string, number> = {},
  ) {
    const template = await this.getDefaultTemplate();
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const existing = await this.prisma.kRAScore.findUnique({
      where: {
        employeeId_periodMonth_periodYear: {
          employeeId,
          periodMonth: month,
          periodYear: year,
        },
      },
    });
    const existingBreakdown = (existing?.breakdown ?? {}) as Record<
      string,
      any
    >;
    const breakdown: Record<string, KraBreakdownItem> = {};
    let finalScore = 0;

    for (const item of template.items) {
      const persistedManual = existingBreakdown[item.name]?.manualScore;
      const manualScore = manualScores[item.name] ?? persistedManual;
      const achievementPercent = item.isAutomated
        ? await this.computeAutomatedAchievement(
            employeeId,
            item.name,
            start,
            end,
          )
        : (manualScore ?? 70);

      const weight = Number(item.weightPercent);
      const contribution = (weight / 100) * achievementPercent;
      breakdown[item.name] = {
        weight,
        achievementPercent: Number(achievementPercent.toFixed(1)),
        contribution: Number(contribution.toFixed(2)),
        isAutomated: item.isAutomated,
        ...(item.isAutomated
          ? {}
          : { manualScore: Number(achievementPercent.toFixed(1)) }),
      } as any;
      finalScore += contribution;
    }

    return this.prisma.kRAScore.upsert({
      where: {
        employeeId_periodMonth_periodYear: {
          employeeId,
          periodMonth: month,
          periodYear: year,
        },
      },
      create: {
        employeeId,
        templateId: template.id,
        periodMonth: month,
        periodYear: year,
        breakdown: breakdown as any,
        finalScore: Number(finalScore.toFixed(2)),
      },
      update: {
        breakdown: breakdown as any,
        finalScore: Number(finalScore.toFixed(2)),
        calculatedAt: new Date(),
      },
    });
  }

  async finalize(scoreId: string) {
    return this.prisma.kRAScore.update({
      where: { id: scoreId },
      data: { isFinal: true },
    });
  }

  async myScores(employeeId: string) {
    return this.prisma.kRAScore.findMany({
      where: { employeeId },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    });
  }

  async teamScores(
    managerId: string,
    month: number,
    year: number,
    roles: string[] = [],
  ) {
    const isHr =
      roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    const reports = await this.prisma.employee.findMany({
      where: isHr
        ? { deletedAt: null, employmentStatus: { not: "EXITED" } }
        : { managerId, deletedAt: null },
      select: { id: true },
    });
    return this.prisma.kRAScore.findMany({
      where: {
        employeeId: { in: reports.map((r) => r.id) },
        periodMonth: month,
        periodYear: year,
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeCode: true },
        },
      },
    });
  }

  async setManualScore(
    employeeId: string,
    itemName: string,
    month: number,
    year: number,
    score: number,
    actorId: string,
    roles: string[],
  ) {
    if (score < 0 || score > 100)
      throw new ForbiddenException("KRA score must be between 0 and 100");
    const isHr =
      roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    const target = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, managerId: true },
    });
    if (!target) throw new NotFoundException("Employee not found");
    if (
      !isHr &&
      !(roles.includes(RoleName.MANAGER) && target.managerId === actorId)
    )
      throw new ForbiddenException(
        "Managers can only score their direct reports",
      );
    const template = await this.getDefaultTemplate();
    const item = template.items.find((i) => i.name === itemName);
    if (!item) throw new NotFoundException("KRA item not found");
    if (item.isAutomated)
      throw new ForbiddenException(
        "Automated KRA metrics cannot be manually overridden",
      );
    return this.calculateForEmployee(employeeId, month, year, {
      [itemName]: score,
    });
  }
}
