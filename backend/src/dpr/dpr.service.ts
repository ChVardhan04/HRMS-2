import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DprStatus, RoleName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SaveDprDraftDto } from "./dto/dpr.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationCategory } from "../notifications/notification-category.enum";
import { TaskCompletionAiService } from "../todos/task-completion-ai.service";

/**
 * DPR sits at the end of the sync chain: Attendance -> To-Do -> DPR -> Manager Review -> KRA.
 * All conflict-handling rules from plan section 6.4 / 15 are enforced here:
 *   1. task hours vs DPR hours mismatch -> flagged, not silently accepted
 *   2. a completed task missing from the DPR -> warning surfaced to the employee
 *   3. submitting DPR with no attendance for the day -> blocked (configurable)
 *   4. editing an approved DPR -> requires unlock + is captured in the audit trail
 *   5. manager unlock/reopen -> explicit endpoint + reason
 */
@Injectable()
export class DprService {
  // Whether DPR submission is hard-blocked without a check-in, or only warned. Configurable per plan 6.2.
  private readonly BLOCK_SUBMISSION_WITHOUT_ATTENDANCE = true;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private taskAi: TaskCompletionAiService,
  ) {}

  private buildAiSummary(todos: any[]) {
    const analyzed = todos.filter((todo) => todo.aiCompletionPercent != null);
    if (!analyzed.length) {
      return {
        score: null,
        analyzedTasks: 0,
        totalTasks: todos.length,
        provider: null,
        confidence: null,
      };
    }

    const score = analyzed.reduce(
      (sum, todo) => sum + Number(todo.aiCompletionPercent),
      0,
    ) / analyzed.length;

    const analyses = analyzed
      .map((todo) => todo.aiCompletionAnalysis as any)
      .filter(Boolean);
    const providers = analyses.map((analysis) => analysis.provider).filter(Boolean);
    const confidences = analyses
      .map((analysis) => Number(analysis.confidence))
      .filter((value) => Number.isFinite(value));

    return {
      score: Number(score.toFixed(1)),
      analyzedTasks: analyzed.length,
      totalTasks: todos.length,
      provider: providers.length && providers.every((p) => p === providers[0]) ? providers[0] : 'mixed',
      confidence: confidences.length
        ? Number((confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(0))
        : null,
    };
  }

  private async getOrCreateDprForWorkDay(workDayId: string) {
    let dpr = await this.prisma.dPR.findUnique({ where: { workDayId } });
    if (!dpr) {
      dpr = await this.prisma.dPR.create({
        data: { workDayId, status: DprStatus.DRAFT },
      });
      await this.prisma.workDay.update({
        where: { id: workDayId },
        data: { dprStatus: DprStatus.DRAFT },
      });
    }
    return dpr;
  }

  /** Called by TodosService.complete() — auto-fills/updates the draft DPR line item for a completed task. */
  async autoFillFromTodo(
    workDayId: string,
    todo: {
      id: string;
      title: string;
      project: string | null;
      actualHours: any;
    },
    outputSummary?: string,
  ) {
    const dpr = await this.getOrCreateDprForWorkDay(workDayId);
    if (dpr.lockedAt) return dpr; // approved DPRs are never silently mutated by task completion

    const existingEntry = await this.prisma.dPREntry.findFirst({
      where: { dprId: dpr.id, todoId: todo.id },
    });
    if (existingEntry) {
      await this.prisma.dPREntry.update({
        where: { id: existingEntry.id },
        data: {
          hours: Number(todo.actualHours),
          output: outputSummary ?? existingEntry.output,
        },
      });
    } else {
      await this.prisma.dPREntry.create({
        data: {
          dprId: dpr.id,
          todoId: todo.id,
          project: todo.project,
          description: todo.title,
          hours: Number(todo.actualHours),
          output: outputSummary,
          isManualEntry: false,
        },
      });
    }

    await this.recalcHoursAndFlags(dpr.id);
    return dpr;
  }

  private async recalcHoursAndFlags(dprId: string) {
    const dpr = await this.prisma.dPR.findUniqueOrThrow({
      where: { id: dprId },
      include: { entries: true, workDay: { include: { todos: true } } },
    });

    const totalDprHours = dpr.entries.reduce(
      (sum, e) => sum + Number(e.hours),
      0,
    );
    await this.prisma.workDay.update({
      where: { id: dpr.workDayId },
      data: { totalLoggedHours: totalDprHours },
    });

    // Conflict 1: task hours vs DPR hours mismatch (per completed task with a linked entry).
    const completedTasks = dpr.workDay.todos.filter(
      (t) => t.status === "COMPLETED",
    );
    let mismatch = false;
    const notes: string[] = [];

    for (const task of completedTasks) {
      const entry = dpr.entries.find((e) => e.todoId === task.id);
      if (
        entry &&
        task.actualHours != null &&
        Number(entry.hours) !== Number(task.actualHours)
      ) {
        mismatch = true;
        notes.push(
          `"${task.title}": task logged ${task.actualHours}h but DPR entry has ${entry.hours}h`,
        );
      }
    }

    // Conflict 2: completed task missing entirely from DPR.
    const missing = completedTasks.filter(
      (t) => !dpr.entries.some((e) => e.todoId === t.id),
    );
    if (missing.length > 0) {
      notes.push(
        `${missing.length} completed task(s) not reflected in DPR: ${missing.map((m) => m.title).join(", ")}`,
      );
    }

    await this.prisma.dPR.update({
      where: { id: dprId },
      data: {
        hasMismatchFlag: mismatch || missing.length > 0,
        mismatchNotes: notes.join(" | ") || null,
      },
    });

    return { mismatch, missing };
  }

  async getForWorkDay(workDayId: string, employeeId: string, roles: string[]) {
    const workDay = await this.prisma.workDay.findUnique({
      where: { id: workDayId },
      select: {
        id: true,
        employeeId: true,
        employee: { select: { managerId: true } },
      },
    });
    if (!workDay) throw new NotFoundException("WorkDay not found");
    const isHr =
      roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    const isManager =
      roles.includes(RoleName.MANAGER) &&
      workDay.employee.managerId === employeeId;
    if (!isHr && !isManager && workDay.employeeId !== employeeId)
      throw new ForbiddenException("You are not allowed to view this DPR");
    const dpr = await this.getOrCreateDprForWorkDay(workDayId);
    const result = await this.prisma.dPR.findUnique({
      where: { id: dpr.id },
      include: {
        entries: { include: { todo: true } },
        auditTrail: { orderBy: { createdAt: "desc" } },
        workDay: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeCode: true,
              },
            },
            todos: true,
          },
        },
      },
    });

    if (!result) throw new NotFoundException("DPR not found");
    return {
      ...result,
      aiSummary: this.buildAiSummary(result.workDay.todos),
    };
  }

  async saveDraft(workDayId: string, employeeId: string, dto: SaveDprDraftDto) {
    const workDay = await this.prisma.workDay.findFirst({
      where: { id: workDayId, employeeId },
    });
    if (!workDay) throw new NotFoundException("WorkDay not found");

    const dpr = await this.getOrCreateDprForWorkDay(workDayId);
    if (dpr.lockedAt) {
      throw new ForbiddenException(
        "DPR is locked after approval. Ask your manager to unlock it before editing.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const entry of dto.entries) {
        if (entry.hours <= 0 || entry.hours > 24)
          throw new BadRequestException(
            "DPR hours must be greater than 0 and no more than 24",
          );
        if (entry.todoId) {
          const todo = await tx.todo.findFirst({
            where: { id: entry.todoId, workDayId },
          });
          if (!todo)
            throw new BadRequestException(
              "One of the selected tasks does not belong to this work day",
            );
        }
        if (entry.id) {
          const existing = await tx.dPREntry.findFirst({
            where: { id: entry.id, dprId: dpr.id },
          });
          if (!existing)
            throw new ForbiddenException(
              "DPR entry does not belong to this report",
            );
          await tx.dPREntry.update({
            where: { id: entry.id },
            data: {
              description: entry.description,
              hours: entry.hours,
              project: entry.project,
              output: entry.output,
              blocker: entry.blocker,
              tomorrowPlan: entry.tomorrowPlan,
            },
          });
        } else {
          await tx.dPREntry.create({
            data: {
              dprId: dpr.id,
              todoId: entry.todoId,
              description: entry.description,
              hours: entry.hours,
              project: entry.project,
              output: entry.output,
              blocker: entry.blocker,
              tomorrowPlan: entry.tomorrowPlan,
              isManualEntry: !entry.todoId,
            },
          });
        }
      }
    });

    await this.recalcHoursAndFlags(dpr.id);
    if (dpr.status === DprStatus.NEEDS_CHANGES || dpr.status === DprStatus.REJECTED) {
      await this.prisma.dPRAuditEntry.create({
        data: {
          dprId: dpr.id,
          action: "EDITED_AFTER_REVIEW",
          actorId: employeeId,
          detail: "Employee updated the DPR after manager feedback.",
        },
      });
    }
    return this.getForWorkDay(workDayId, employeeId, [RoleName.EMPLOYEE]);
  }

  async submit(workDayId: string, employeeId: string) {
    const workDay = await this.prisma.workDay.findFirst({
      where: { id: workDayId, employeeId },
    });
    if (!workDay) throw new NotFoundException("WorkDay not found");

    // Conflict 3: DPR submitted without attendance for the day.
    if (!workDay.checkInAt && this.BLOCK_SUBMISSION_WITHOUT_ATTENDANCE) {
      throw new BadRequestException(
        "Cannot submit a DPR for a day with no recorded attendance",
      );
    }

    const dpr = await this.getOrCreateDprForWorkDay(workDayId);
    if (dpr.lockedAt) {
      throw new ForbiddenException("This DPR is approved and locked.");
    }
    const submitAllowedStatuses: DprStatus[] = [
      DprStatus.DRAFT,
      DprStatus.NEEDS_CHANGES,
      DprStatus.REJECTED,
    ];
    if (!submitAllowedStatuses.includes(dpr.status)) {
      throw new BadRequestException(
        `DPR cannot be submitted while it is ${dpr.status.replace(/_/g, " ").toLowerCase()}.`,
      );
    }
    const { mismatch, missing } = await this.recalcHoursAndFlags(dpr.id);
    if (mismatch || missing.length > 0)
      throw new BadRequestException(
        "Reconcile the DPR with completed task hours before submitting.",
      );

    const entryCount = await this.prisma.dPREntry.count({
      where: { dprId: dpr.id },
    });
    // Allowed but flagged low-quality for KRA if no to-dos backed the DPR at all.
    const isLowQuality = entryCount === 0;

    const updated = await this.prisma.dPR.update({
      where: { id: dpr.id },
      data: {
        status: DprStatus.SUBMITTED,
        submittedAt: new Date(),
        qualityScore: isLowQuality ? 3 : undefined,
      },
    });

    await this.prisma.workDay.update({
      where: { id: workDay.id },
      data: { dprStatus: DprStatus.SUBMITTED },
    });

    await this.prisma.dPRAuditEntry.create({
      data: {
        dprId: dpr.id,
        action: "SUBMITTED",
        actorId: employeeId,
        detail: !workDay.checkInAt
          ? "Submitted without attendance check-in (warning)"
          : missing.length
            ? `${missing.length} completed task(s) missing from report`
            : undefined,
      },
    });

    const analysisText = (await this.prisma.dPREntry.findMany({
      where: { dprId: dpr.id },
      orderBy: { createdAt: "asc" },
      select: { description: true, output: true, blocker: true, tomorrowPlan: true },
    }))
      .map((entry) => [entry.description, entry.output, entry.blocker, entry.tomorrowPlan].filter(Boolean).join("\n"))
      .join("\n\n");

    await this.taskAi.analyzeAndPersistForWorkDay(workDay.id, analysisText);

    return this.prisma.dPR.findUniqueOrThrow({
      where: { id: dpr.id },
      include: { entries: true },
    });
  }

  async review(
    dprId: string,
    reviewerId: string,
    decision: "APPROVED" | "REJECTED" | "NEEDS_CHANGES",
    comment?: string,
    qualityScore?: number,
    reviewerRoles: string[] = [],
  ) {
    const dpr = await this.prisma.dPR.findUnique({
      where: { id: dprId },
      include: {
        workDay: { include: { employee: { select: { managerId: true } } } },
      },
    });
    if (!dpr) throw new NotFoundException("DPR not found");
    const isSuperAdmin = reviewerRoles.includes(RoleName.SUPER_ADMIN);
    if (!isSuperAdmin && dpr.workDay.employee.managerId !== reviewerId) {
      throw new BadRequestException(
        "Only the reporting manager can review this DPR",
      );
    }
    if (
      dpr.status !== DprStatus.SUBMITTED &&
      dpr.status !== DprStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException("Only submitted DPRs can be reviewed");
    }
    if ((decision === "NEEDS_CHANGES" || decision === "REJECTED") && !comment?.trim()) {
      throw new BadRequestException("A review comment is required when changes are requested or a DPR is rejected");
    }

    const updated = await this.prisma.dPR.update({
      where: { id: dprId },
      data: {
        status: decision as DprStatus,
        reviewedAt: new Date(),
        reviewerId,
        reviewComment: comment,
        qualityScore: qualityScore ?? dpr.qualityScore,
        lockedAt: decision === "APPROVED" ? new Date() : null,
      },
    });

    await this.prisma.workDay.update({
      where: { id: dpr.workDayId },
      data: { dprStatus: decision as DprStatus },
    });

    await this.prisma.dPRAuditEntry.create({
      data: { dprId, action: decision, actorId: reviewerId, detail: comment },
    });

    const employee = await this.prisma.employee.findUnique({
      where: { id: dpr.workDay.employeeId },
      include: { user: true },
    });
    if (employee) {
      const title =
        decision === "APPROVED"
          ? "DPR approved"
          : decision === "NEEDS_CHANGES"
            ? "DPR changes requested"
            : "DPR rejected";
      await this.notifications.notify({
        userId: employee.userId,
        title,
        body: comment ? `${title}: ${comment}` : title,
        category: NotificationCategory.DPR_REVIEW,
        emailAlso: true,
        recipientEmail: employee.user.email,
      });
    }

    return updated;
  }

  async rateQuality(
    dprId: string,
    hrEmployeeId: string,
    qualityScore: number,
    comment?: string,
  ) {
    if (qualityScore < 0 || qualityScore > 10)
      throw new BadRequestException("Quality score must be between 0 and 10");
    const dpr = await this.prisma.dPR.findUnique({ where: { id: dprId } });
    if (!dpr) throw new NotFoundException("DPR not found");
    const updated = await this.prisma.dPR.update({
      where: { id: dprId },
      data: { qualityScore, reviewComment: comment ?? dpr.reviewComment },
    });
    await this.prisma.dPRAuditEntry.create({
      data: {
        dprId,
        action: "QUALITY_RATED",
        actorId: hrEmployeeId,
        detail: comment ? `${qualityScore}: ${comment}` : String(qualityScore),
      },
    });
    return updated;
  }

  /** Conflict 4/5: editing an approved DPR requires an explicit manager unlock, fully audited. */
  async unlock(dprId: string, managerId: string, reason: string) {
    const dpr = await this.prisma.dPR.findUnique({
      where: { id: dprId },
      include: {
        workDay: { include: { employee: { select: { managerId: true } } } },
      },
    });
    if (!dpr) throw new NotFoundException("DPR not found");
    if (!dpr.lockedAt) throw new BadRequestException("DPR is not locked");
    if (dpr.workDay.employee.managerId !== managerId)
      throw new ForbiddenException(
        "Only the reporting manager can unlock this DPR",
      );

    const updated = await this.prisma.dPR.update({
      where: { id: dprId },
      data: {
        lockedAt: null,
        unlockedById: managerId,
        unlockedAt: new Date(),
        unlockReason: reason,
        status: DprStatus.NEEDS_CHANGES,
      },
    });

    await this.prisma.dPRAuditEntry.create({
      data: { dprId, action: "UNLOCKED", actorId: managerId, detail: reason },
    });

    return updated;
  }

  /** Any edit made after approval (post-unlock) is captured explicitly, not just implied by updatedAt. */
  async recordPostApprovalEdit(dprId: string, actorId: string, detail: string) {
    return this.prisma.dPRAuditEntry.create({
      data: { dprId, action: "EDITED_AFTER_APPROVAL", actorId, detail },
    });
  }

  async pendingForManager(managerId: string) {
    const reports = await this.prisma.employee.findMany({
      where: { managerId },
      select: { id: true },
    });
    const ids = reports.map((r) => r.id);
    const dprs = await this.prisma.dPR.findMany({
      where: {
        status: { in: [DprStatus.SUBMITTED, DprStatus.UNDER_REVIEW] },
        workDay: { employeeId: { in: ids } },
      },
      include: {
        workDay: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
            todos: true,
          },
        },
        entries: { include: { todo: true } },
      },
      orderBy: { submittedAt: "asc" },
    });
    return dprs.map((dpr) => ({
      ...dpr,
      aiSummary: this.buildAiSummary(dpr.workDay.todos),
    }));
  }
  async teamStatus(managerId: string) {
    const reports = await this.prisma.employee.findMany({
      where: { managerId, deletedAt: null, employmentStatus: { not: "EXITED" } },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
      orderBy: { firstName: "asc" },
    });

    if (!reports.length) return [];

    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const workDays = await this.prisma.workDay.findMany({
      where: { employeeId: { in: reports.map((r) => r.id) }, date: { gte: start, lt: end } },
      include: { dpr: true, todos: true },
    });
    const byEmployee = new Map(workDays.map((workDay) => [workDay.employeeId, workDay]));

    return reports.map((employee) => {
      const workDay = byEmployee.get(employee.id);
      const aiSummary = this.buildAiSummary(workDay?.todos ?? []);
      return {
        employee,
        workDayId: workDay?.id ?? null,
        attendanceStatus: workDay?.attendanceStatus ?? "ABSENT",
        dprStatus: workDay?.dprStatus ?? "DRAFT",
        submittedAt: workDay?.dpr?.submittedAt ?? null,
        reviewedAt: workDay?.dpr?.reviewedAt ?? null,
        reviewComment: workDay?.dpr?.reviewComment ?? null,
        aiSummary,
      };
    });
  }

}
