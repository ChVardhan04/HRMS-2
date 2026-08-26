import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RoleName, TodoEodStatus, TodoStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WorkdayService } from "../workday/workday.service";
import { DprService } from "../dpr/dpr.service";
import { CreateTodoDto, TodoQueryDto, UpdateTodoDto, ResolveTodoDto } from "./dto/todo.dto";
import { STORAGE_ADAPTER, StorageAdapter } from "../integrations/storage/storage-adapter.interface";
import { Inject } from "@nestjs/common";
import { randomUUID } from "crypto";

@Injectable()
export class TodosService {
  constructor(
    private prisma: PrismaService,
    private workdayService: WorkdayService,
    private dprService: DprService,
    @Inject(STORAGE_ADAPTER) private storage: StorageAdapter,
  ) {}

  async create(creatorId: string, creatorRoles: string[], dto: CreateTodoDto) {
    const assigneeId = dto.assigneeId ?? creatorId;
    const isPersonal = assigneeId === creatorId;
    let workDay: any = null;
    if (isPersonal) {
      workDay = await this.workdayService.getOrCreate(creatorId, new Date());
      if (!workDay.checkInAt)
        throw new BadRequestException(
          "Check in first to unlock today's To-Dos",
        );
      if (workDay.attendanceStatus === "ON_LEAVE")
        throw new BadRequestException(
          "To-Dos are unavailable while you are on leave",
        );
    }

    if (!isPersonal) {
      const isManager = creatorRoles.includes(RoleName.MANAGER);
      if (!isManager)
        throw new ForbiddenException("Only managers can assign team To-Dos");
      const assignee = await this.prisma.employee.findUnique({
        where: { id: assigneeId },
      });
      if (!assignee) throw new NotFoundException("Assignee not found");
      if (assignee.managerId !== creatorId)
        throw new ForbiddenException(
          "You can only assign To-Dos to your direct reports",
        );
    }

    return this.prisma.todo.create({
      data: {
        title: dto.title,
        description: dto.description,
        assigneeId,
        creatorId,
        project: dto.project,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        workDayId: isPersonal ? workDay.id : undefined,
        estimatedHours: dto.estimatedHours,
      },
    });
  }

  async findAll(
    query: TodoQueryDto,
    user: { employeeId?: string; roles: string[] },
  ) {
    const isHr =
      user.roles.includes(RoleName.HR_ADMIN) ||
      user.roles.includes(RoleName.SUPER_ADMIN);
    const isManager = user.roles.includes(RoleName.MANAGER);
    if (!user.employeeId)
      throw new ForbiddenException("Employee context is required");
    const allowedAssignees = isHr
      ? undefined
      : isManager
        ? [
            user.employeeId,
            ...(
              await this.prisma.employee.findMany({
                where: { managerId: user.employeeId, deletedAt: null },
                select: { id: true },
              })
            ).map((e) => e.id),
          ]
        : [user.employeeId];

    const where: any = {
      ...(allowedAssignees ? { assigneeId: { in: allowedAssignees } } : {}),
      ...(query.assigneeId
        ? {
            assigneeId: allowedAssignees
              ? { in: allowedAssignees.filter((id) => id === query.assigneeId) }
              : query.assigneeId,
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: "insensitive" } }
        : {}),
    };
    if (
      query.assigneeId &&
      allowedAssignees &&
      !allowedAssignees.includes(query.assigneeId)
    )
      throw new ForbiddenException("You cannot view tasks for this employee");

    const [data, total] = await this.prisma.$transaction([
      this.prisma.todo.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { [query.sortBy ?? "createdAt"]: query.sortDir ?? "desc" },
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.todo.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** "Today" board — what check-in unlocks per the sync engine. */
  async today(employeeId: string) {
    const today = this.workdayService.startOfDay();
    const workDay = await this.workdayService.getOrCreate(employeeId, today);
    if (!workDay.checkInAt) return [];
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.todo.findMany({
      where: {
        assigneeId: employeeId,
        status: { notIn: [TodoStatus.CANCELLED] },
        OR: [
          { dueDate: { gte: today, lt: tomorrow } },
          {
            status: {
              in: [
                TodoStatus.PENDING,
                TodoStatus.IN_PROGRESS,
                TodoStatus.OVERDUE,
              ],
            },
          },
        ],
      },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    });
  }

  async update(
    id: string,
    requesterId: string,
    dto: UpdateTodoDto,
    roles: string[] = [],
  ) {
    const todo = await this.prisma.todo.findUnique({ where: { id } });
    if (!todo) throw new NotFoundException("Todo not found");
    const isHr =
      roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    if (
      !isHr &&
      todo.assigneeId !== requesterId &&
      todo.creatorId !== requesterId
    )
      throw new ForbiddenException("Not allowed to modify this task");
    if (dto.status === TodoStatus.COMPLETED && todo.assigneeId !== requesterId)
      throw new ForbiddenException(
        "Only the assignee can complete a task so the DPR stays synchronized",
      );

    return this.prisma.todo.update({
      where: { id },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  /**
   * Core sync-engine behaviour (plan 6.2/6.3): completing a task attaches it to today's WorkDay,
   * and auto-adds/updates a DPR line item with the reported hours — the employee reviews and can
   * edit it before submitting, but never re-types the same work twice.
   */
  async complete(
    id: string,
    employeeId: string,
    actualHours: number,
    outputSummary?: string,
  ) {
    throw new BadRequestException(
      "Use the end-of-day task resolution flow so completion proof is captured.",
    );
  }

  async resolve(
    id: string,
    employeeId: string,
    dto: ResolveTodoDto,
    proof?: Express.Multer.File,
  ) {
    const todo = await this.prisma.todo.findUnique({ where: { id } });
    if (!todo) throw new NotFoundException("Todo not found");
    if (todo.assigneeId !== employeeId) throw new ForbiddenException("Not your task");
    if (!(dto.outcome === "COMPLETED" || dto.outcome === "INCOMPLETE"))
      throw new BadRequestException("Invalid end-of-day outcome");
    if (dto.actualHours < 0 || dto.actualHours > 24)
      throw new BadRequestException("Invalid hours value");
    if (dto.outcome === "COMPLETED" && !proof)
      throw new BadRequestException("A screenshot proof is required to mark a task completed");
    if (dto.outcome === "INCOMPLETE" && !dto.incompleteReason?.trim())
      throw new BadRequestException("A valid reason is required for an incomplete task");

    const workDay = await this.workdayService.getOrCreate(employeeId, new Date());
    if (!workDay.checkInAt) throw new BadRequestException("Check in first before resolving a task");

    let proofKey: string | undefined;
    if (proof) {
      const key = `employees/${employeeId}/task-proofs/${workDay.date.toISOString().slice(0,10)}/${randomUUID()}-${proof.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      proofKey = (await this.storage.upload({ key, body: proof.buffer, contentType: proof.mimetype })).key;
    }

    const updated = await this.prisma.todo.update({
      where: { id },
      data: {
        status: dto.outcome === "COMPLETED" ? TodoStatus.COMPLETED : TodoStatus.IN_PROGRESS,
        completedAt: dto.outcome === "COMPLETED" ? new Date() : null,
        actualHours: dto.actualHours,
        workDayId: workDay.id,
        includedInDpr: true,
        eodStatus: dto.outcome as TodoEodStatus,
        incompleteReason: dto.outcome === "INCOMPLETE" ? dto.incompleteReason?.trim() : null,
        completionOutputSummary: dto.outputSummary?.trim() || null,
        completionProofStorageKey: proofKey ?? todo.completionProofStorageKey,
        completionProofFileName: proof?.originalname ?? todo.completionProofFileName,
        completionProofMimeType: proof?.mimetype ?? todo.completionProofMimeType,
        completionProofSubmittedAt: proof ? new Date() : todo.completionProofSubmittedAt,
        eodResolvedAt: new Date(),
      },
    });

    await this.dprService.autoFillFromTodo(
      workDay.id,
      updated,
      dto.outcome === "INCOMPLETE"
        ? `Incomplete: ${dto.incompleteReason?.trim()}`
        : dto.outputSummary,
    );

    return updated;
  }

  async eodStatus(employeeId: string) {
    const workDay = await this.workdayService.getOrCreate(employeeId, new Date());
    const tasks = await this.prisma.todo.findMany({
      where: { workDayId: workDay.id, status: { not: TodoStatus.CANCELLED } },
      orderBy: { createdAt: "asc" },
    });
    return {
      workDayId: workDay.id,
      resolved: tasks.filter((t) => t.eodStatus !== "PENDING").length,
      pending: tasks.filter((t) => t.eodStatus === "PENDING").length,
      tasks,
    };
  }

  async eodMonitor() {
    const today = this.workdayService.startOfDay();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null, employmentStatus: { not: "EXITED" } },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } },
      orderBy: { firstName: "asc" },
    });
    const tasks = await this.prisma.todo.findMany({
      where: { workDay: { date: { gte: today, lt: tomorrow } }, status: { not: TodoStatus.CANCELLED } },
      orderBy: { createdAt: "asc" },
    });
    return employees.map((employee) => {
      const employeeTasks = tasks.filter((task) => task.assigneeId === employee.id);
      const resolved = employeeTasks.filter((task) => task.eodStatus !== TodoEodStatus.PENDING);
      const aiValues = employeeTasks.filter((task) => task.aiCompletionPercent != null).map((task) => Number(task.aiCompletionPercent));
      return {
        employee,
        totalTasks: employeeTasks.length,
        resolvedTasks: resolved.length,
        pendingTasks: employeeTasks.length - resolved.length,
        aiCompletionPercent: aiValues.length ? Number((aiValues.reduce((a, b) => a + b, 0) / aiValues.length).toFixed(1)) : null,
        tasks: employeeTasks,
      };
    });
  }

  async assertEodReady(employeeId: string) {
    const status = await this.eodStatus(employeeId);
    if (status.pending > 0) {
      throw new BadRequestException(
        `Resolve all ${status.pending} pending task(s) before checking out. Completed tasks need screenshot proof; incomplete tasks need a valid reason.`,
      );
    }
    return status;
  }

  async getProof(id: string, requesterId: string, roles: string[]) {
    const todo = await this.prisma.todo.findUnique({ where: { id } });
    if (!todo) throw new NotFoundException("Task not found");
    const hr = roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    let isReportingManager = false;
    if (!hr && roles.includes(RoleName.MANAGER)) {
      const assignee = await this.prisma.employee.findUnique({
        where: { id: todo.assigneeId },
        select: { managerId: true },
      });
      isReportingManager = assignee?.managerId === requesterId;
    }
    if (!hr && !isReportingManager && todo.assigneeId !== requesterId && todo.creatorId !== requesterId)
      throw new ForbiddenException("You are not allowed to view this proof");
    if (!todo.completionProofStorageKey) throw new NotFoundException("No completion proof uploaded");
    return {
      url: await this.storage.getSignedDownloadUrl(todo.completionProofStorageKey),
      fileName: todo.completionProofFileName,
    };
  }

  async addComment(todoId: string, authorId: string, body: string) {
    if (!body?.trim()) throw new BadRequestException("Comment cannot be empty");
    const todo = await this.prisma.todo.findUnique({
      where: { id: todoId },
      select: { assigneeId: true, creatorId: true },
    });
    if (!todo) throw new NotFoundException("Todo not found");
    if (todo.assigneeId !== authorId && todo.creatorId !== authorId)
      throw new ForbiddenException("You cannot comment on this task");
    return this.prisma.todoComment.create({
      data: { todoId, authorId, body: body.trim() },
    });
  }

  async bulkAction(
    ids: string[],
    action: "complete" | "reschedule" | "reassign" | "cancel",
    payload: { dueDate?: string; assigneeId?: string },
    requesterId: string,
    roles: string[],
  ) {
    const tasks = await this.prisma.todo.findMany({
      where: { id: { in: ids } },
      select: { id: true, assigneeId: true, creatorId: true },
    });
    if (tasks.length !== ids.length)
      throw new NotFoundException("One or more tasks were not found");
    const isHr =
      roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    const reports = roles.includes(RoleName.MANAGER)
      ? await this.prisma.employee.findMany({
          where: { managerId: requesterId },
          select: { id: true },
        })
      : [];
    const allowed = new Set([requesterId, ...reports.map((r) => r.id)]);
    if (
      !isHr &&
      tasks.some(
        (t) => !allowed.has(t.assigneeId) && t.creatorId !== requesterId,
      )
    )
      throw new ForbiddenException("You cannot bulk-edit these tasks");
    if (
      action === "reassign" &&
      payload.assigneeId &&
      !isHr &&
      !allowed.has(payload.assigneeId)
    )
      throw new ForbiddenException(
        "You can only assign tasks to your direct reports",
      );

    switch (action) {
      case "reschedule":
        return this.prisma.todo.updateMany({
          where: { id: { in: ids } },
          data: {
            dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
          },
        });
      case "reassign":
        return this.prisma.todo.updateMany({
          where: { id: { in: ids } },
          data: { assigneeId: payload.assigneeId },
        });
      case "cancel":
        return this.prisma.todo.updateMany({
          where: { id: { in: ids } },
          data: { status: TodoStatus.CANCELLED },
        });
      default:
        throw new BadRequestException(
          "Unsupported bulk action for completion — complete tasks individually to capture hours",
        );
    }
  }

  /** Marks overdue tasks — intended to run as part of the daily cron sweep alongside attendance. */
  async markOverdue() {
    const now = new Date();
    return this.prisma.todo.updateMany({
      where: {
        status: { in: [TodoStatus.PENDING, TodoStatus.IN_PROGRESS] },
        dueDate: { lt: now },
      },
      data: { status: TodoStatus.OVERDUE },
    });
  }
}
