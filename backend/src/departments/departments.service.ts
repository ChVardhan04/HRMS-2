import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AttendanceStatus, LeaveStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateDepartmentDto,
  CreateDesignationDto,
  DepartmentLeavePolicyDto,
  DepartmentPolicyDto,
  UpdateDepartmentDto,
} from "./dto/department.dto";

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  private async defaultOrgId() {
    const org = await this.prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    if (!org) throw new NotFoundException("Organization is not configured");
    return org.id;
  }

  private async ensurePolicy(departmentId: string) {
    return this.prisma.departmentPolicy.upsert({
      where: { departmentId },
      create: { departmentId },
      update: {},
    });
  }

  private async ensureDefaultLeavePolicies(departmentId: string) {
    const types = await this.prisma.leaveType.findMany();
    for (const type of types) {
      const code = type.code.toUpperCase();
      const defaults = code === "CL"
        ? { annualEntitlement: 6, requiresBalance: true, advanceNoticeWorkingDays: 2, allowPostApproval: false, medicalCertificateAfterDays: null, sandwichApplies: true }
        : code === "SL"
          ? { annualEntitlement: 7, requiresBalance: true, advanceNoticeWorkingDays: 0, allowPostApproval: true, medicalCertificateAfterDays: 1, sandwichApplies: true }
          : code === "UNPAID" || code === "WFH"
            ? { annualEntitlement: 0, requiresBalance: false, advanceNoticeWorkingDays: 0, allowPostApproval: true, medicalCertificateAfterDays: null, sandwichApplies: false }
            : { annualEntitlement: 0, requiresBalance: type.isPaid, advanceNoticeWorkingDays: 0, allowPostApproval: false, medicalCertificateAfterDays: null, sandwichApplies: true };
      await this.prisma.departmentLeavePolicy.upsert({
        where: { departmentId_leaveTypeId: { departmentId, leaveTypeId: type.id } },
        create: { departmentId, leaveTypeId: type.id, ...defaults },
        update: {},
      });
    }
  }

  async listDepartments() {
    const departments = await this.prisma.department.findMany({
      where: { deletedAt: null },
      include: {
        designations: { where: { deletedAt: null }, orderBy: { title: "asc" } },
        policy: true,
        _count: { select: { employees: true } },
      },
      orderBy: { name: "asc" },
    });
    return Promise.all(departments.map(async (d) => ({ ...d, policy: d.policy ?? await this.ensurePolicy(d.id) })));
  }

  async getDepartment(id: string, month?: number, year?: number) {
    const department = await this.prisma.department.findFirst({
      where: { id, deletedAt: null },
      include: {
        designations: { where: { deletedAt: null }, orderBy: { title: "asc" } },
        policy: true,
        leavePolicies: { include: { leaveType: true }, orderBy: { leaveType: { name: "asc" } } },
      },
    });
    if (!department) throw new NotFoundException("Department not found");
    await this.ensurePolicy(id);
    await this.ensureDefaultLeavePolicies(id);

    const now = new Date();
    const m = month && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
    const y = year || now.getFullYear();
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const [employees, presentToday, absentToday, leaveToday, pendingLeaves, lateThisMonth, kraScores] = await Promise.all([
      this.prisma.employee.count({ where: { departmentId: id, deletedAt: null, employmentStatus: { not: "EXITED" } } }),
      this.prisma.workDay.count({ where: { employee: { departmentId: id }, date: { gte: todayStart, lt: todayEnd }, attendanceStatus: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.HALF_DAY] } } }),
      this.prisma.workDay.count({ where: { employee: { departmentId: id }, date: { gte: todayStart, lt: todayEnd }, attendanceStatus: AttendanceStatus.ABSENT } }),
      this.prisma.workDay.count({ where: { employee: { departmentId: id }, date: { gte: todayStart, lt: todayEnd }, attendanceStatus: { in: [AttendanceStatus.ON_LEAVE, AttendanceStatus.WORK_FROM_HOME] } } }),
      this.prisma.leaveRequest.count({ where: { employee: { departmentId: id }, status: { in: [LeaveStatus.PENDING, LeaveStatus.MANAGER_APPROVED] } } }),
      this.prisma.workDay.count({ where: { employee: { departmentId: id }, date: { gte: start, lt: end }, isLate: true } }),
      this.prisma.kRAScore.findMany({ where: { employee: { departmentId: id }, periodMonth: m, periodYear: y }, select: { finalScore: true } }),
    ]);
    const avgKra = kraScores.length ? kraScores.reduce((a, s) => a + Number(s.finalScore), 0) / kraScores.length : null;

    const fresh = await this.prisma.department.findUnique({
      where: { id },
      include: {
        designations: { where: { deletedAt: null }, orderBy: { title: "asc" } },
        policy: true,
        leavePolicies: { include: { leaveType: true }, orderBy: { leaveType: { name: "asc" } } },
      },
    });
    return { ...fresh, summary: { employees, presentToday, absentToday, leaveToday, pendingLeaves, lateThisMonth, averageKra: avgKra } };
  }

  async createDepartment(dto: CreateDepartmentDto) {
    const organizationId = await this.defaultOrgId();
    const department = await this.prisma.department.create({ data: { name: dto.name.trim(), organizationId } });
    await this.ensurePolicy(department.id);
    await this.ensureDefaultLeavePolicies(department.id);
    return this.getDepartment(department.id);
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto) {
    await this.getDepartment(id);
    return this.prisma.department.update({ where: { id }, data: { name: dto.name.trim() } });
  }

  async updatePolicy(id: string, dto: DepartmentPolicyDto) {
    await this.getDepartment(id);
    const current = await this.ensurePolicy(id);
    const merged = { ...current, ...dto } as any;
    if (merged.officeEndMinutes <= merged.officeStartMinutes) throw new BadRequestException("Office end must be after office start");
    if (merged.lunchEndMinutes <= merged.lunchStartMinutes) throw new BadRequestException("Lunch end must be after lunch start");
    if (merged.lateAfterMinutes < merged.checkInOpenMinutes) throw new BadRequestException("Late threshold cannot be before check-in opening");
    if (merged.halfDayAfterMinutes < merged.lateAfterMinutes) throw new BadRequestException("Half-day threshold cannot be before late threshold");
    if (merged.checkInCutoffMinutes < merged.halfDayAfterMinutes) throw new BadRequestException("Check-in cutoff cannot be before half-day threshold");
    return this.prisma.departmentPolicy.upsert({ where: { departmentId: id }, create: { departmentId: id, ...dto }, update: dto });
  }

  async updateLeavePolicy(id: string, dto: DepartmentLeavePolicyDto) {
    await this.getDepartment(id);
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: dto.leaveTypeId } });
    if (!leaveType) throw new NotFoundException("Leave type not found");
    return this.prisma.departmentLeavePolicy.upsert({
      where: { departmentId_leaveTypeId: { departmentId: id, leaveTypeId: dto.leaveTypeId } },
      create: { departmentId: id, ...dto },
      update: dto,
      include: { leaveType: true },
    });
  }

  async createDesignation(dto: CreateDesignationDto) {
    const department = await this.prisma.department.findFirst({ where: { id: dto.departmentId, deletedAt: null } });
    if (!department) throw new NotFoundException("Department not found");
    const title = dto.title.trim();
    if (!title) throw new BadRequestException("Designation title is required");
    return this.prisma.designation.create({ data: { title, departmentId: department.id } });
  }

  async softDeleteDepartment(id: string) {
    const activeEmployees = await this.prisma.employee.count({ where: { departmentId: id, deletedAt: null, employmentStatus: { not: "EXITED" } } });
    if (activeEmployees) throw new BadRequestException("Move active employees to another department before deleting it");
    return this.prisma.department.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
