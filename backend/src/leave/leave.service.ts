import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LeaveDurationType, LeaveStatus, RoleName, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { WorkdayService } from "../workday/workday.service";
import { CalendarService } from "../calendar/calendar.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationCategory } from "../notifications/notification-category.enum";
import { STORAGE_ADAPTER, StorageAdapter } from "../integrations/storage/storage-adapter.interface";
import { ApplyLeaveDto, CreateLeaveTypeDto, SetLeaveBalanceDto } from "./dto/leave.dto";

@Injectable()
export class LeaveService {
  constructor(
    private prisma: PrismaService,
    private workdayService: WorkdayService,
    private notifications: NotificationsService,
    private calendarService: CalendarService,
    @Inject(STORAGE_ADAPTER) private storage: StorageAdapter,
  ) {}

  async listTypes() {
    const org = await this.calendarService.getOrganization();
    return this.prisma.leaveType.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } });
  }

  async createType(dto: CreateLeaveTypeDto) {
    const org = await this.calendarService.getOrganization();
    const type = await this.prisma.leaveType.create({ data: { ...dto, code: dto.code.trim().toUpperCase(), organizationId: org.id } });
    const departments = await this.prisma.department.findMany({ where: { deletedAt: null } });
    for (const department of departments) {
      await this.ensureDepartmentLeavePolicy(department.id, type.id, type.code, type.isPaid);
    }
    return type;
  }

  private async ensureDepartmentLeavePolicy(departmentId: string, leaveTypeId: string, code?: string, isPaid?: boolean) {
    const leaveType = code ? { code, isPaid: Boolean(isPaid) } : await this.prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType) throw new NotFoundException("Leave type not found");
    const c = leaveType.code.toUpperCase();
    const defaults = c === "CL"
      ? { annualEntitlement: 6, requiresBalance: true, advanceNoticeWorkingDays: 2, allowPostApproval: false, medicalCertificateAfterDays: null, sandwichApplies: true }
      : c === "SL"
        ? { annualEntitlement: 7, requiresBalance: true, advanceNoticeWorkingDays: 0, allowPostApproval: true, medicalCertificateAfterDays: 1, sandwichApplies: true }
        : c === "UNPAID" || c === "WFH"
          ? { annualEntitlement: 0, requiresBalance: false, advanceNoticeWorkingDays: 0, allowPostApproval: true, medicalCertificateAfterDays: null, sandwichApplies: false }
          : { annualEntitlement: 0, requiresBalance: Boolean(leaveType.isPaid), advanceNoticeWorkingDays: 0, allowPostApproval: false, medicalCertificateAfterDays: null, sandwichApplies: true };
    return this.prisma.departmentLeavePolicy.upsert({
      where: { departmentId_leaveTypeId: { departmentId, leaveTypeId } },
      create: { departmentId, leaveTypeId, ...defaults },
      update: {},
      include: { leaveType: true },
    });
  }

  private async effectiveLeavePolicy(employee: any, leaveType: any) {
    if (employee.departmentId) return this.ensureDepartmentLeavePolicy(employee.departmentId, leaveType.id, leaveType.code, leaveType.isPaid);
    return {
      leaveType,
      annualEntitlement: leaveType.code === "CL" ? 6 : leaveType.code === "SL" ? 7 : 0,
      monthlyEntitlement: null,
      requiresBalance: leaveType.isPaid && !["WFH", "UNPAID"].includes(leaveType.code),
      advanceNoticeWorkingDays: leaveType.code === "CL" ? 2 : 0,
      allowPostApproval: leaveType.code === "SL",
      medicalCertificateAfterDays: leaveType.code === "SL" ? 1 : null,
      sandwichApplies: !["WFH", "UNPAID"].includes(leaveType.code),
      maxConsecutiveDays: null,
      active: true,
    } as any;
  }

  private requiresBalance(type: { code: string; isPaid: boolean }, policy?: any) {
    if (policy) return Boolean(policy.requiresBalance);
    return type.isPaid && !["WFH", "UNPAID"].includes(type.code);
  }

  private async ensureBalance(employeeId: string, leaveType: any, year: number, policy: any) {
    if (!this.requiresBalance(leaveType, policy)) return null;
    const where = { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: leaveType.id, year } };

    // Read first so the HR monthly overview does not repeatedly try to insert
    // balances that already exist. The create path is still race-safe below.
    const existing = await this.prisma.leaveBalance.findUnique({ where });
    if (existing) return existing;

    try {
      return await this.prisma.leaveBalance.create({
        data: { employeeId, leaveTypeId: leaveType.id, year, accrued: Number(policy.annualEntitlement ?? 0) },
      });
    } catch (error) {
      // Another request may have created this employee/type/year balance after
      // the read above. Reuse that row instead of returning a 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrent = await this.prisma.leaveBalance.findUnique({ where });
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  async balances(employeeId: string, year = new Date().getFullYear()) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, departmentId: true } });
    if (!employee) throw new NotFoundException("Employee not found");
    const types = await this.listTypes();
    const result: any[] = [];
    for (const leaveType of types) {
      const policy = await this.effectiveLeavePolicy(employee, leaveType);
      const balance = await this.ensureBalance(employeeId, leaveType, year, policy);
      const pendingRows = await this.prisma.leaveRequest.findMany({
        where: { employeeId, leaveTypeId: leaveType.id, status: { in: [LeaveStatus.PENDING, LeaveStatus.MANAGER_APPROVED] } },
        select: { numberOfDays: true },
      });
      const accrued = Number(balance?.accrued ?? policy.annualEntitlement ?? 0);
      const carriedForward = Number(balance?.carriedForward ?? 0);
      const used = Number(balance?.used ?? 0);
      const pending = pendingRows.reduce((sum, r) => sum + Number(r.numberOfDays), 0);
      result.push({
        id: balance?.id ?? `${employeeId}-${leaveType.id}-${year}`,
        employeeId, leaveType, year, accrued, carriedForward, used, pending,
        available: this.requiresBalance(leaveType, policy) ? Math.max(0, accrued + carriedForward - used) : null,
        balanceControlled: this.requiresBalance(leaveType, policy),
        policy: {
          annualEntitlement: Number(policy.annualEntitlement ?? 0),
          advanceNoticeWorkingDays: policy.advanceNoticeWorkingDays,
          allowPostApproval: policy.allowPostApproval,
          medicalCertificateAfterDays: policy.medicalCertificateAfterDays == null ? null : Number(policy.medicalCertificateAfterDays),
          sandwichApplies: policy.sandwichApplies,
        },
      });
    }
    return result;
  }

  async adminOverview(year: number, month: number, departmentId?: string) {
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new BadRequestException("month must be between 1 and 12");
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null, employmentStatus: { not: "EXITED" }, ...(departmentId ? { departmentId } : {}) },
      include: { department: true, designation: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    const rows: any[] = [];
    for (const employee of employees) {
      rows.push({
        id: employee.id, employeeCode: employee.employeeCode, firstName: employee.firstName, lastName: employee.lastName,
        department: employee.department, designation: employee.designation,
        balances: await this.balances(employee.id, year),
        leaves: await this.prisma.leaveRequest.findMany({
          where: { employeeId: employee.id, startDate: { lte: to }, endDate: { gte: from } },
          include: { leaveType: true }, orderBy: { startDate: "asc" },
        }),
      });
    }
    return { year, month, departmentId: departmentId ?? null, leaveTypes: await this.listTypes(), employees: rows };
  }

  async setBalance(employeeId: string, leaveTypeId: string, year: number, dto: SetLeaveBalanceDto) {
    const [employee, leaveType] = await Promise.all([
      this.prisma.employee.findUnique({ where: { id: employeeId } }),
      this.prisma.leaveType.findUnique({ where: { id: leaveTypeId } }),
    ]);
    if (!employee) throw new NotFoundException("Employee not found");
    if (!leaveType) throw new NotFoundException("Leave type not found");
    const policy = await this.effectiveLeavePolicy(employee, leaveType);
    if (!this.requiresBalance(leaveType, policy)) throw new BadRequestException(`${leaveType.name} does not use an allocated leave balance.`);
    const balance = await this.prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
      create: { employeeId, leaveTypeId, year, accrued: dto.accrued, carriedForward: dto.carriedForward ?? 0 },
      update: { accrued: dto.accrued, carriedForward: dto.carriedForward ?? 0 }, include: { leaveType: true },
    });
    return { ...balance, accrued: Number(balance.accrued), carriedForward: Number(balance.carriedForward), used: Number(balance.used), available: Math.max(0, Number(balance.accrued) + Number(balance.carriedForward) - Number(balance.used)) };
  }

  private async workingDays(employeeId: string, start: Date, end: Date) {
    const dates: Date[] = [];
    for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      if ((await this.calendarService.isWorkingDayForEmployee(employeeId, d)).working) dates.push(new Date(d));
    }
    return dates;
  }

  private async sandwichDates(employeeId: string, start: Date, end: Date, enabled: boolean, includePreviousWorking: boolean) {
    if (!enabled) return [] as Date[];
    const extra = new Map<string, Date>();
    const addWeeklyOffs = async (cursor: Date, step: number) => {
      let d = new Date(cursor);
      for (let i = 0; i < 8; i++) {
        d.setUTCDate(d.getUTCDate() + step);
        const policy = await this.calendarService.isWorkingDayForEmployee(employeeId, d);
        if (policy.type === "HOLIDAY") break; // festival/company holidays are excluded
        if (policy.working) break;
        extra.set(d.toISOString().slice(0, 10), new Date(d));
      }
    };
    await addWeeklyOffs(end, 1);   // Friday/Saturday leave can consume following weekly offs
    await addWeeklyOffs(start, -1); // Monday leave can consume preceding weekly offs

    if (includePreviousWorking) {
      const prev = new Date(start);
      prev.setUTCDate(prev.getUTCDate() - 1);
      const prevPolicy = await this.calendarService.isWorkingDayForEmployee(employeeId, prev);
      // If start is Monday-like after weekly offs, include the previous working day as configured by HR policy.
      if (!prevPolicy.working && prevPolicy.type === "WEEKEND") {
        for (let i = 0; i < 8; i++) {
          prev.setUTCDate(prev.getUTCDate() - 1);
          const p = await this.calendarService.isWorkingDayForEmployee(employeeId, prev);
          if (p.type === "HOLIDAY") break;
          if (p.working) { extra.set(prev.toISOString().slice(0, 10), new Date(prev)); break; }
        }
      }
    }
    return [...extra.values()].sort((a, b) => a.getTime() - b.getTime());
  }

  private async advanceWorkingDays(employeeId: string, start: Date) {
    const today = new Date();
    const startToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (start <= startToday) return 0;
    return this.calendarService.countWorkingDaysForEmployee(employeeId, startToday, new Date(start.getTime() - 86400000));
  }

  async preview(employeeId: string, dto: ApplyLeaveDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException("Employee not found");
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: dto.leaveTypeId } });
    if (!leaveType) throw new NotFoundException("Leave type not found");
    const start = new Date(dto.startDate); const end = new Date(dto.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new BadRequestException("Invalid leave dates");
    const durationType = dto.durationType ?? LeaveDurationType.FULL_DAY;
    if (durationType !== LeaveDurationType.FULL_DAY && start.toISOString().slice(0,10) !== end.toISOString().slice(0,10)) throw new BadRequestException("Half-day leave must be for a single date");
    const policy = await this.effectiveLeavePolicy(employee, leaveType);
    const deptPolicy = await this.calendarService.getEmployeePolicy(employeeId);
    const workingDates = await this.workingDays(employeeId, start, end);
    let appliedWorkingDays = workingDates.length;
    if (durationType !== LeaveDurationType.FULL_DAY) appliedWorkingDays = appliedWorkingDays ? 0.5 : 0;
    const sandwich = await this.sandwichDates(employeeId, start, end, Boolean(deptPolicy.sandwichLeaveEnabled && policy.sandwichApplies), Boolean(deptPolicy.sandwichIncludesPreviousWorkingDay));
    const sandwichDays = sandwich.length;
    const chargeableDays = appliedWorkingDays + sandwichDays;
    const advanceDays = await this.advanceWorkingDays(employeeId, start);
    return {
      leaveType, policy, durationType, appliedWorkingDays, sandwichDays, chargeableDays,
      sandwichDates: sandwich.map((d) => d.toISOString().slice(0,10)), advanceWorkingDays: advanceDays,
      medicalCertificateRequired: policy.medicalCertificateAfterDays != null && appliedWorkingDays > Number(policy.medicalCertificateAfterDays),
    };
  }

  async apply(employeeId: string, dto: ApplyLeaveDto, medicalCertificate?: Express.Multer.File) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, include: { manager: { include: { user: true } } } });
    if (!employee) throw new NotFoundException("Employee not found");
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: dto.leaveTypeId } });
    if (!leaveType) throw new NotFoundException("Leave type not found");
    const preview = await this.preview(employeeId, dto);
    if (preview.chargeableDays <= 0) throw new BadRequestException("The selected dates contain no chargeable leave days");
    if (!dto.reason?.trim()) throw new BadRequestException("A genuine leave reason is required");
    if (!dto.emergencyContact?.trim()) throw new BadRequestException("Emergency contact is required during leave");
    if (!dto.emergencyAddress?.trim()) throw new BadRequestException("Emergency address is required during leave");

    if (preview.medicalCertificateRequired && !medicalCertificate) throw new BadRequestException("A medical certificate is required for sick leave exceeding one day");
    if (medicalCertificate && !["application/pdf", "image/jpeg", "image/png"].includes(medicalCertificate.mimetype)) throw new BadRequestException("Medical certificate must be PDF, JPG, or PNG");

    const start = new Date(dto.startDate); const end = new Date(dto.endDate);
    const overlap = await this.prisma.leaveRequest.findFirst({ where: { employeeId, status: { in: [LeaveStatus.PENDING, LeaveStatus.MANAGER_APPROVED, LeaveStatus.APPROVED] }, startDate: { lte: end }, endDate: { gte: start } } });
    if (overlap) throw new BadRequestException("You already have a leave request covering part of these dates");

    const deptPolicy = await this.calendarService.getEmployeePolicy(employeeId);
    const isProbation = employee.employmentStatus === "PROBATION" || employee.employmentType === "INTERN";
    if (isProbation) {
      if (preview.chargeableDays > Number(deptPolicy.probationMaxDaysPerRequest)) throw new BadRequestException(`During probation/internship, maximum ${deptPolicy.probationMaxDaysPerRequest} day(s) are allowed per request`);
      const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      const monthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      const usedThisMonth = await this.prisma.leaveRequest.aggregate({
        where: { employeeId, status: { in: [LeaveStatus.PENDING, LeaveStatus.MANAGER_APPROVED, LeaveStatus.APPROVED] }, startDate: { gte: monthStart, lt: monthEnd } },
        _sum: { numberOfDays: true },
      });
      if (Number(usedThisMonth._sum.numberOfDays ?? 0) + preview.chargeableDays > Number(deptPolicy.probationMonthlyLeaveLimit)) throw new BadRequestException(`Probation/internship allows only ${deptPolicy.probationMonthlyLeaveLimit} leave day(s) per month`);
    }

    if (!preview.policy.allowPostApproval && preview.advanceWorkingDays < Number(preview.policy.advanceNoticeWorkingDays ?? 0)) {
      throw new BadRequestException(`This leave requires at least ${preview.policy.advanceNoticeWorkingDays} working day(s) advance notice`);
    }
    if (preview.policy.maxConsecutiveDays != null && preview.chargeableDays > Number(preview.policy.maxConsecutiveDays)) throw new BadRequestException(`Maximum ${preview.policy.maxConsecutiveDays} day(s) are allowed for this leave type`);

    const year = start.getUTCFullYear();
    const balance = await this.ensureBalance(employeeId, leaveType, year, preview.policy);
    if (this.requiresBalance(leaveType, preview.policy)) {
      const available = Number(balance?.accrued ?? 0) + Number(balance?.carriedForward ?? 0) - Number(balance?.used ?? 0);
      if (available < preview.chargeableDays) throw new BadRequestException(`Insufficient ${leaveType.name} balance for ${year}: ${available} day(s) available, ${preview.chargeableDays} requested`);
    }

    let certificate: { key: string; fileName: string; mimeType: string } | null = null;
    if (medicalCertificate) {
      const key = `employees/${employeeId}/leave-certificates/${randomUUID()}-${medicalCertificate.originalname}`;
      const uploaded = await this.storage.upload({ key, body: medicalCertificate.buffer, contentType: medicalCertificate.mimetype });
      certificate = { key: uploaded.key, fileName: medicalCertificate.originalname, mimeType: medicalCertificate.mimetype };
    }

    const request = await this.prisma.leaveRequest.create({
      data: {
        employeeId, leaveTypeId: leaveType.id, startDate: start, endDate: end,
        numberOfDays: preview.chargeableDays, appliedWorkingDays: preview.appliedWorkingDays,
        sandwichDays: preview.sandwichDays, durationType: preview.durationType,
        reason: dto.reason.trim(), emergencyContact: dto.emergencyContact?.trim(), emergencyAddress: dto.emergencyAddress?.trim(), managerId: employee.managerId,
        medicalCertificateFileName: certificate?.fileName, medicalCertificateStorageKey: certificate?.key, medicalCertificateMimeType: certificate?.mimeType,
        policySnapshot: { departmentPolicyId: (deptPolicy as any).id ?? null, leavePolicyId: preview.policy.id ?? null, sandwichDates: preview.sandwichDates, advanceWorkingDays: preview.advanceWorkingDays },
      },
      include: { leaveType: true },
    });

    if (employee.manager?.user) {
      await this.notifications.notify({ userId: employee.manager.userId!, title: "Leave approval required", body: `${employee.firstName} ${employee.lastName} requested ${preview.chargeableDays} day(s) ${leaveType.name}.`, category: NotificationCategory.LEAVE_APPROVAL, emailAlso: true, recipientEmail: employee.manager.user.email });
    } else {
      const hrs = await this.prisma.user.findMany({ where: { isActive: true, roles: { some: { role: { name: RoleName.HR_ADMIN } } } } });
      for (const hr of hrs) await this.notifications.notify({ userId: hr.id, title: "Leave approval required", body: `${employee.firstName} ${employee.lastName} requested leave and has no reporting manager.`, category: NotificationCategory.LEAVE_APPROVAL, emailAlso: false });
    }
    return request;
  }

  async medicalCertificateDownload(requestId: string, actor: { employeeId?: string; roles: string[] }) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { employee: true } });
    if (!request || !request.medicalCertificateStorageKey) throw new NotFoundException("Medical certificate not found");
    const isHr = actor.roles.includes(RoleName.HR_ADMIN) || actor.roles.includes(RoleName.SUPER_ADMIN);
    const isManager = actor.roles.includes(RoleName.MANAGER) && request.managerId === actor.employeeId;
    if (!isHr && !isManager && actor.employeeId !== request.employeeId) throw new BadRequestException("You are not allowed to access this certificate");
    return { url: await this.storage.getSignedDownloadUrl(request.medicalCertificateStorageKey), fileName: request.medicalCertificateFileName };
  }

  async managerApprove(requestId: string, managerId: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { employee: true, leaveType: true } });
    if (!request) throw new NotFoundException("Leave request not found");
    if (request.managerId !== managerId) throw new BadRequestException("This leave request is not assigned to you");
    if (request.status !== LeaveStatus.PENDING) throw new BadRequestException("Request already actioned");
    const updated = await this.prisma.leaveRequest.update({ where: { id: requestId }, data: { status: LeaveStatus.MANAGER_APPROVED, managerActionAt: new Date() } });
    const hrs = await this.prisma.user.findMany({ where: { isActive: true, roles: { some: { role: { name: RoleName.HR_ADMIN } } } } });
    for (const hr of hrs) await this.notifications.notify({ userId: hr.id, title: "Leave ready for HR approval", body: `${request.employee.firstName} ${request.employee.lastName}'s ${request.leaveType.name} request was approved by the manager.`, category: NotificationCategory.LEAVE_APPROVAL, emailAlso: false });
    return updated;
  }

  async hrApprove(requestId: string, hrEmployeeId: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { leaveType: true } });
    if (!request) throw new NotFoundException("Leave request not found");
    if (request.managerId && request.status !== LeaveStatus.MANAGER_APPROVED) throw new BadRequestException("Manager approval is required before HR final approval");
    if (!request.managerId && request.status !== LeaveStatus.PENDING) throw new BadRequestException("Request is not awaiting HR approval");

    const employee = await this.prisma.employee.findUnique({ where: { id: request.employeeId } });
    if (!employee) throw new NotFoundException("Employee not found");
    const policy = await this.effectiveLeavePolicy(employee, request.leaveType);
    await this.prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({ where: { id: requestId }, data: { status: LeaveStatus.APPROVED, hrActionAt: new Date() } });
      if (this.requiresBalance(request.leaveType, policy)) {
        const year = request.startDate.getUTCFullYear();
        await tx.leaveBalance.upsert({
          where: { employeeId_leaveTypeId_year: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year } },
          create: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year, accrued: Number(policy.annualEntitlement ?? 0), used: request.numberOfDays },
          update: { used: { increment: request.numberOfDays } },
        });
      }
    });

    // Reconcile all selected working days. Sandwich weekly offs remain visible through the leave request but do not create fake working WorkDays.
    for (let d = new Date(request.startDate); d <= request.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      if ((await this.calendarService.isWorkingDayForEmployee(request.employeeId, d)).working) await this.workdayService.markLeave(request.employeeId, new Date(d), request.leaveType.code === "WFH");
    }
    const user = await this.prisma.employee.findUnique({ where: { id: request.employeeId }, include: { user: true } });
    if (user) await this.notifications.notify({ userId: user.userId, title: "Leave approved", body: `Your ${request.leaveType.name} request from ${request.startDate.toDateString()} to ${request.endDate.toDateString()} has been approved.`, category: NotificationCategory.LEAVE_APPROVAL, emailAlso: true, recipientEmail: user.user.email });
    return this.prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { leaveType: true } });
  }

  async reject(requestId: string, approverId: string, roles: string[], reason: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException("Leave request not found");
    const isHr = roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    const isManager = roles.includes(RoleName.MANAGER);
    if (isManager && !isHr && (request.managerId !== approverId || request.status !== LeaveStatus.PENDING)) throw new BadRequestException("You cannot reject this leave request");
    if (isHr && request.status === LeaveStatus.PENDING && request.managerId) throw new BadRequestException("Manager action is required before HR final action");
    return this.prisma.leaveRequest.update({ where: { id: requestId }, data: { status: LeaveStatus.REJECTED, rejectionReason: reason } });
  }

  async pendingApprovals(employeeId: string, roles: string[]) {
    const isHr = roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    return this.prisma.leaveRequest.findMany({
      where: isHr ? { OR: [{ status: LeaveStatus.MANAGER_APPROVED }, { status: LeaveStatus.PENDING, managerId: null }] } : { managerId: employeeId, status: LeaveStatus.PENDING },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: true } }, leaveType: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async cancel(requestId: string, employeeId: string) {
    const request = await this.prisma.leaveRequest.findFirst({ where: { id: requestId, employeeId } });
    if (!request) throw new NotFoundException("Leave request not found");
    if (request.status === LeaveStatus.APPROVED) throw new BadRequestException("Approved leave requires HR to reverse it manually");
    return this.prisma.leaveRequest.update({ where: { id: requestId }, data: { status: LeaveStatus.CANCELLED, cancelledAt: new Date() } });
  }

  async reverseApproved(requestId: string, actorId: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { leaveType: true } });
    if (!request) throw new NotFoundException("Leave request not found");
    if (request.status !== LeaveStatus.APPROVED) throw new BadRequestException("Only fully approved leave can be reversed");
    const employee = await this.prisma.employee.findUnique({ where: { id: request.employeeId } });
    const policy = employee ? await this.effectiveLeavePolicy(employee, request.leaveType) : null;
    return this.prisma.$transaction(async (tx) => {
      if (policy && this.requiresBalance(request.leaveType, policy)) {
        await tx.leaveBalance.updateMany({ where: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year: request.startDate.getUTCFullYear() }, data: { used: { decrement: request.numberOfDays } } });
      }
      await tx.leaveRequest.update({ where: { id: requestId }, data: { status: LeaveStatus.CANCELLED, cancelledAt: new Date(), hrActionAt: new Date() } });
      for (let d = new Date(request.startDate); d <= request.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const workDay = await tx.workDay.findUnique({ where: { employeeId_date: { employeeId: request.employeeId, date: day } } });
        if (!workDay) continue;
        const status = workDay.checkInAt ? (workDay.isLate ? "LATE" : "PRESENT") : "ABSENT";
        await tx.workDay.update({ where: { id: workDay.id }, data: { attendanceStatus: status as any, dprStatus: "DRAFT" } });
      }
      return { requestId, status: LeaveStatus.CANCELLED, reversedBy: actorId };
    });
  }

  async history(employeeId: string) {
    return this.prisma.leaveRequest.findMany({ where: { employeeId }, include: { leaveType: true }, orderBy: { createdAt: "desc" } });
  }

  async teamCalendar(managerId: string, from: Date, to: Date, roles: string[] = []) {
    const isHr = roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    const ids = isHr ? undefined : (await this.prisma.employee.findMany({ where: { managerId }, select: { id: true } })).map((r) => r.id);
    return this.prisma.leaveRequest.findMany({
      where: { ...(ids ? { employeeId: { in: ids } } : {}), status: { in: [LeaveStatus.APPROVED, LeaveStatus.MANAGER_APPROVED] }, startDate: { lte: to }, endDate: { gte: from } },
      include: { employee: { select: { firstName: true, lastName: true, department: true } }, leaveType: true },
      orderBy: { startDate: "asc" },
    });
  }
}
