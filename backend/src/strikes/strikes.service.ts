import { ForbiddenException, Injectable } from "@nestjs/common";
import { StrikeStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationCategory } from "../notifications/notification-category.enum";

const STRIKE_THRESHOLD_SCORE = 80;
const ROLLING_WINDOW_MONTHS = 6;
const STRIKES_TO_ESCALATE = 3;

@Injectable()
export class StrikesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  static readonly config = {
    thresholdScore: STRIKE_THRESHOLD_SCORE,
    rollingWindowMonths: ROLLING_WINDOW_MONTHS,
    strikesToEscalate: STRIKES_TO_ESCALATE,
  };

  private async getConfig() {
    const org = await this.prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
    });
    return {
      thresholdScore: org?.kraStrikeThresholdScore ?? STRIKE_THRESHOLD_SCORE,
      rollingWindowMonths: org?.kraRollingWindowMonths ?? ROLLING_WINDOW_MONTHS,
      strikesToEscalate: org?.kraStrikesToEscalate ?? STRIKES_TO_ESCALATE,
    };
  }

  /** Called after a KRA score is finalized for the month — plan section 23. */
  async evaluateForScore(kraScoreId: string) {
    const score = await this.prisma.kRAScore.findUnique({
      where: { id: kraScoreId },
      include: {
        employee: {
          include: { user: true, manager: { include: { user: true } } },
        },
      },
    });
    if (!score) return null;

    const config = await this.getConfig();
    if (Number(score.finalScore) >= config.thresholdScore) return null;

    const existing = await this.prisma.strike.findUnique({
      where: { kraScoreId },
    });
    if (existing) return existing;

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt);
    expiresAt.setMonth(expiresAt.getMonth() + config.rollingWindowMonths);

    const strike = await this.prisma.strike.create({
      data: {
        employeeId: score.employeeId,
        kraScoreId,
        reason: `Monthly KRA score ${score.finalScore}% is below the ${config.thresholdScore}% threshold`,
        expiresAt,
      },
    });

    await this.notifications.notify({
      userId: score.employee.userId,
      title: "Performance strike issued",
      body: `Your ${score.periodMonth}/${score.periodYear} KRA score (${score.finalScore}%) triggered a strike.`,
      category: NotificationCategory.STRIKE,
      emailAlso: true,
      recipientEmail: score.employee.user.email,
    });

    await this.checkEscalation(score.employeeId);
    return strike;
  }

  private async activeStrikeCount(employeeId: string) {
    const config = await this.getConfig();
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - config.rollingWindowMonths);
    return this.prisma.strike.count({
      where: {
        employeeId,
        status: StrikeStatus.ACTIVE,
        issuedAt: { gte: cutoff },
      },
    });
  }

  async checkEscalation(employeeId: string) {
    const config = await this.getConfig();
    const count = await this.activeStrikeCount(employeeId);
    if (count < config.strikesToEscalate) return { escalated: false, count };

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true, manager: { include: { user: true } } },
    });
    if (!employee) return { escalated: false, count };

    const hrUsers = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: { name: "HR_ADMIN" } } },
        isActive: true,
      },
    });

    if (employee.manager?.user) {
      await this.notifications.notify({
        userId: employee.manager.userId!,
        title: "Three-strike escalation",
        body: `${employee.firstName} ${employee.lastName} has reached ${count} strikes within the rolling ${config.rollingWindowMonths}-month window.`,
        category: NotificationCategory.STRIKE,
        emailAlso: true,
        recipientEmail: employee.manager.user.email,
      });
    }

    for (const hrUser of hrUsers) {
      await this.notifications.notify({
        userId: hrUser.id,
        title: "Three-strike escalation",
        body: `${employee.firstName} ${employee.lastName} has reached ${count} strikes. Consider a PIP.`,
        category: NotificationCategory.STRIKE,
        emailAlso: true,
        recipientEmail: hrUser.email,
      });
    }

    return { escalated: true, count };
  }

  /** Optional PIP task creation, gated behind HR confirmation rather than fully automatic (plan 23). */
  async createPipTask(employeeId: string, creatorId: string, strikeId: string) {
    const existing = await this.prisma.strike.findUnique({
      where: { id: strikeId },
    });
    if (!existing || existing.employeeId !== employeeId)
      throw new ForbiddenException(
        "Strike does not belong to the selected employee",
      );
    if (existing.status !== StrikeStatus.ACTIVE)
      throw new ForbiddenException("Only active strikes can create a PIP task");
    if (existing.pipTaskCreated) return existing;
    const strike = await this.prisma.strike.update({
      where: { id: strikeId },
      data: { pipTaskCreated: true },
    });
    await this.prisma.todo.create({
      data: {
        title: "Performance Improvement Plan check-in",
        description:
          "Auto-created after 3-strike escalation. Schedule a PIP conversation and document next steps.",
        assigneeId: employeeId,
        creatorId,
        priority: "URGENT",
      },
    });
    return strike;
  }

  /** HR dashboard color coding from plan 23: 0=green, 1=yellow, 2=orange, 3+=red. */
  async dashboardStatus(actorId?: string, roles: string[] = []) {
    const isHr = roles.includes("HR_ADMIN") || roles.includes("SUPER_ADMIN");
    const employees = await this.prisma.employee.findMany({
      where: {
        employmentStatus: { not: "EXITED" },
        ...(isHr ? {} : { managerId: actorId }),
      },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });

    const results: unknown[] = [];
    for (const employee of employees) {
      const count = await this.activeStrikeCount(employee.id);
      const color =
        count === 0
          ? "GREEN"
          : count === 1
            ? "YELLOW"
            : count === 2
              ? "ORANGE"
              : "RED";
      results.push({ ...employee, activeStrikes: count, color });
    }
    return results;
  }

  async listForEmployee(
    employeeId: string,
    actorId?: string,
    roles: string[] = [],
  ) {
    const isHr = roles.includes("HR_ADMIN") || roles.includes("SUPER_ADMIN");
    if (!isHr && actorId && actorId !== employeeId) {
      if (!roles.includes("MANAGER"))
        throw new ForbiddenException("You can only view your own strikes");
      const target = await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { managerId: true },
      });
      if (target?.managerId !== actorId)
        throw new ForbiddenException(
          "Managers can only view direct-report strikes",
        );
    }
    return this.prisma.strike.findMany({
      where: { employeeId },
      orderBy: { issuedAt: "desc" },
    });
  }

  async resolve(strikeId: string) {
    return this.prisma.strike.update({
      where: { id: strikeId },
      data: { status: StrikeStatus.RESOLVED },
    });
  }
}
