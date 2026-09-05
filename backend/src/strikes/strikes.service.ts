import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { StrikeStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationCategory } from "../notifications/notification-category.enum";

const STRIKE_THRESHOLD_SCORE = 80;
const ROLLING_WINDOW_MONTHS = 6;
const STRIKES_TO_ESCALATE = 3;

@Injectable()
export class StrikesService {
  private readonly logger = new Logger(StrikesService.name);

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

  /**
   * Called after a KRA score is finalized for the month — plan section 23.
   *
   * A strike is a serious employment action, so it is issued ONLY when the score
   * that triggered it can actually be trusted. Three guards, all of which used to
   * be missing:
   *
   *   1. the score must be FINAL (a mid-month projection must never strike)
   *   2. the template must be properly configured (metrics exist, weights = 100)
   *   3. the AI must have genuinely evaluated the metrics
   *
   * Without these, a template with no metrics, unbalanced weights, or an
   * unreachable AI provider produced a 0%–60% score that was indistinguishable
   * from real non-performance, and every affected employee was struck.
   */
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

    if (!score.isFinal) {
      this.logger.warn(
        `Skipping strike evaluation for KRA score ${kraScoreId}: score is not final.`,
      );
      return null;
    }

    const meta = (score.breakdown as any)?.__meta ?? null;

    if (!meta) {
      this.logger.warn(
        `Skipping strike evaluation for KRA score ${kraScoreId}: score has no calculation metadata (calculated by an older version). Recalculate before striking.`,
      );
      return null;
    }

    if (!meta.eligibleForStrike) {
      this.logger.warn(
        `Skipping strike for employee ${score.employeeId} (${score.periodMonth}/${score.periodYear}): ` +
          `metricCount=${meta.metricCount}, totalWeight=${meta.totalWeight}, ` +
          `weightsBalanced=${meta.weightsBalanced}, aiEvaluated=${meta.aiEvaluated}. ` +
          `The score is not trustworthy enough to justify a strike.`,
      );
      await this.notifyHrOfUnscoreableEmployee(score, meta);
      return null;
    }

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

  /**
   * When an employee cannot be reliably scored we tell HR rather than failing
   * silently — an unconfigured template is an HR problem, not the employee's.
   */
  private async notifyHrOfUnscoreableEmployee(score: any, meta: any) {
    const reason = !meta.metricCount
      ? "their KRA template has no metrics configured"
      : !meta.weightsBalanced
        ? `their KRA template weights total ${meta.totalWeight}% instead of 100%`
        : "the AI evaluation was unavailable, so the score used the fallback calculation";

    const hrUsers = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: { name: { in: ["HR_ADMIN", "SUPER_ADMIN"] } } } },
        isActive: true,
      },
      select: { id: true, email: true },
    });

    for (const hrUser of hrUsers) {
      await this.notifications.notify({
        userId: hrUser.id,
        title: "KRA score could not be trusted — no strike issued",
        body: `${score.employee.firstName} ${score.employee.lastName} scored ${score.finalScore}% for ${score.periodMonth}/${score.periodYear}, but no strike was issued because ${reason}. Fix the configuration and recalculate.`,
        category: NotificationCategory.KRA,
        emailAlso: true,
        recipientEmail: hrUser.email,
      });
    }
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

    // Escalate once per distinct strike count, not on every evaluation. Without
    // this, an employee sitting at 3+ strikes re-notified their manager and every
    // HR user every single month.
    const alreadyEscalated = await this.prisma.notification.findFirst({
      where: {
        category: NotificationCategory.STRIKE,
        title: "Three-strike escalation",
        body: { contains: `[esc:${employeeId}:${count}]` },
      },
      select: { id: true },
    });
    if (alreadyEscalated) return { escalated: false, count, alreadyNotified: true };

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
        body: `${employee.firstName} ${employee.lastName} has reached ${count} strikes within the rolling ${config.rollingWindowMonths}-month window. [esc:${employeeId}:${count}]`,
        category: NotificationCategory.STRIKE,
        emailAlso: true,
        recipientEmail: employee.manager.user.email,
      });
    }

    for (const hrUser of hrUsers) {
      await this.notifications.notify({
        userId: hrUser.id,
        title: "Three-strike escalation",
        body: `${employee.firstName} ${employee.lastName} has reached ${count} strikes. Consider a PIP. [esc:${employeeId}:${count}]`,
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
    const existing = await this.prisma.strike.findUnique({
      where: { id: strikeId },
    });
    if (!existing) throw new NotFoundException("Strike not found");
    if (existing.status !== StrikeStatus.ACTIVE) {
      throw new ForbiddenException("Only active strikes can be resolved");
    }
    return this.prisma.strike.update({
      where: { id: strikeId },
      data: { status: StrikeStatus.RESOLVED },
    });
  }
}
