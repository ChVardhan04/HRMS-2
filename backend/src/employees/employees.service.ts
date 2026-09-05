import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
} from "./dto/employee.dto";
import { Paginated } from "../common/dto/pagination.dto";
import * as crypto from "crypto";

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * employeeCode is @unique. A bare random 6-digit suffix collides often enough
   * to matter (~1% at 130 employees, ~50% at ~1000), which surfaced as a raw
   * P2002 500 during employee creation. Retry against the database instead.
   */
  private async generateEmployeeCode(tx: any = this.prisma): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = `EMP-${crypto.randomInt(100000, 999999)}`;
      const clash = await tx.employee.findUnique({
        where: { employeeCode: code },
        select: { id: true },
      });
      if (!clash) return code;
    }
    return `EMP-${Date.now().toString(36).toUpperCase()}${crypto.randomInt(100, 999)}`;
  }

  async create(dto: CreateEmployeeDto) {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new BadRequestException(
        "An account with this work email already exists",
      );
    }

    if (dto.designationId) {
      const designation = await this.prisma.designation.findFirst({ where: { id: dto.designationId, deletedAt: null } });
      if (!designation) throw new BadRequestException("Selected designation does not exist");
      if (dto.departmentId && designation.departmentId !== dto.departmentId) throw new BadRequestException("Selected designation does not belong to the selected department");
    }

    const requestedRoles = dto.roleNames?.length
      ? [...new Set(dto.roleNames)]
      : [RoleName.EMPLOYEE];

    const allowedRoles: RoleName[] = [
      RoleName.EMPLOYEE,
      RoleName.MANAGER,
    ];

    const invalidRole = requestedRoles.find(
      (role) => !allowedRoles.includes(role as RoleName),
    );
    if (invalidRole) {
      throw new ForbiddenException(
        "HR can create employee or manager accounts only",
      );
    }

    const roleNames = requestedRoles as RoleName[];
    const roles = await this.prisma.role.findMany({
      where: { name: { in: roleNames } },
    });

    if (roles.length !== roleNames.length) {
      throw new BadRequestException(
        "One or more selected roles are not configured",
      );
    }

    // The initial password is deliberately random and never shown to HR.
    // The employee must activate the account using a one-time link.
    const unusablePassword = crypto.randomBytes(48).toString("base64url");
    const passwordHash = await AuthService.hashPassword(unusablePassword);

    const employee = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          isActive: true,
          mustChangePassword: true,
          roles: {
            create: roles.map((r) => ({ roleId: r.id })),
          },
        },
      });

      return tx.employee.create({
        data: {
          employeeCode: await this.generateEmployeeCode(tx),
          userId: user.id,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          personalEmail: dto.personalEmail?.trim().toLowerCase(),
          phone: dto.phone,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          emergencyContact: dto.emergencyContact,
          emergencyAddress: dto.emergencyAddress,
          dateOfJoining: new Date(dto.dateOfJoining),
          employmentType: dto.employmentType,
          departmentId: dto.departmentId,
          designationId: dto.designationId,
          managerId: dto.managerId,
          skipLevelManagerId: dto.skipLevelManagerId,
          location: dto.location,
          monthlySalary: dto.monthlySalary,
          salaryCurrency: dto.salaryCurrency ?? "INR",
          payrollEligible: dto.payrollEligible ?? true,
        },
        include: {
          department: true,
          designation: true,
          manager: true,
        },
      });
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const ttlHours = Number(process.env.ACCOUNT_ACTIVATION_TTL_HOURS ?? 24);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.prisma.accountActivationToken.create({
      data: {
        userId: employee.userId,
        tokenHash,
        expiresAt,
      },
    });

    const appUrl = (
      process.env.APP_URL ??
      process.env.FRONTEND_URL ??
      "http://localhost:3000"
    ).replace(/\/$/, "");
    const activationUrl = `${appUrl}/auth/activate?token=${encodeURIComponent(rawToken)}`;

    await this.notifications.sendEmail({
      to: email,
      subject: "Your HRMS account is ready",
      body: [
        `Hello ${employee.firstName},`,
        "",
        "Your HRMS account has been created by HR.",
        "",
        `Activate your account: ${activationUrl}`,
        "",
        `This activation link expires in ${ttlHours} hours.`,
        "You will create your own password during activation.",
      ].join("\n"),
      html: [
        `<p>Hello ${employee.firstName},</p>`,
        "<p>Your HRMS account has been created by HR.</p>",
        `<p><a href="${activationUrl}">Activate your HRMS account</a></p>`,
        `<p>This activation link expires in ${ttlHours} hours.</p>`,
        "<p>You will create your own password during activation.</p>",
      ].join(""),
    });

    return {
      employee,
      account: {
        email,
        status: "PENDING_ACTIVATION",
        activationExpiresAt: expiresAt,
        // Helpful for local development when SMTP is intentionally not configured.
        // Never expose activation tokens in production responses.
        ...(process.env.NODE_ENV !== "production" ? { activationUrl } : {}),
      },
    };
  }

  async resendActivation(id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
      include: { user: true },
    });

    if (!employee) throw new NotFoundException("Employee not found");
    if (!employee.user.isActive) {
      throw new BadRequestException("The employee account is disabled");
    }
    if (!employee.user.mustChangePassword) {
      throw new BadRequestException(
        "This employee account is already activated",
      );
    }

    await this.prisma.accountActivationToken.deleteMany({
      where: { userId: employee.userId, usedAt: null },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const ttlHours = Number(process.env.ACCOUNT_ACTIVATION_TTL_HOURS ?? 24);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.prisma.accountActivationToken.create({
      data: { userId: employee.userId, tokenHash, expiresAt },
    });

    const appUrl = (
      process.env.APP_URL ??
      process.env.FRONTEND_URL ??
      "http://localhost:3000"
    ).replace(/\/$/, "");
    const activationUrl = `${appUrl}/auth/activate?token=${encodeURIComponent(rawToken)}`;

    await this.notifications.sendEmail({
      to: employee.user.email,
      subject: "Activate your HRMS account",
      body: `Activate your HRMS account: ${activationUrl}\n\nThis link expires in ${ttlHours} hours.`,
      html: `<p><a href="${activationUrl}">Activate your HRMS account</a></p><p>This link expires in ${ttlHours} hours.</p>`,
    });

    return {
      success: true,
      status: "PENDING_ACTIVATION",
      activationExpiresAt: expiresAt,
      ...(process.env.NODE_ENV !== "production" ? { activationUrl } : {}),
    };
  }

  async findAll(
    query: EmployeeQueryDto,
    user: { employeeId?: string; roles: string[] },
  ): Promise<Paginated<any>> {
    const isHr =
      user.roles.includes(RoleName.HR_ADMIN) ||
      user.roles.includes(RoleName.SUPER_ADMIN);
    const isManager = user.roles.includes(RoleName.MANAGER);
    if (!isHr && !isManager)
      throw new ForbiddenException("Employee directory access is restricted");

    const where: any = {
      deletedAt: null,
      ...(isManager && !isHr ? { managerId: user.employeeId } : {}),
      ...(query.includeExited ? {} : { employmentStatus: { not: "EXITED" } }),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.employmentStatus
        ? { employmentStatus: query.employmentStatus }
        : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { employeeCode: { contains: query.search, mode: "insensitive" } },
              {
                user: {
                  email: { contains: query.search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { [query.sortBy ?? "createdAt"]: query.sortDir ?? "desc" },
        include: {
          department: true,
          designation: true,
          manager: { select: { id: true, firstName: true, lastName: true } },
          user: {
            select: { email: true, isActive: true, mustChangePassword: true },
          },
        },
      }),
      this.prisma.employee.count({ where }),
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

  async findOne(id: string, user?: { employeeId?: string; roles: string[] }) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
      include: {
        department: true,
        designation: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
        skipLevelManager: {
          select: { id: true, firstName: true, lastName: true },
        },
        reports: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
          },
        },
        user: {
          select: {
            email: true,
            isActive: true,
            mustChangePassword: true,
            roles: { include: { role: true } },
          },
        },
        documents: true,
      },
    });
    if (!employee) throw new NotFoundException("Employee not found");

    if (user) {
      const isHr =
        user.roles.includes(RoleName.HR_ADMIN) ||
        user.roles.includes(RoleName.SUPER_ADMIN);
      const isManager = user.roles.includes(RoleName.MANAGER);
      const isSelf = user.employeeId === employee.id;
      const isDirectReport = employee.managerId === user.employeeId;
      if (!isHr && !isSelf && !(isManager && isDirectReport)) {
        throw new ForbiddenException(
          "You are not allowed to view this employee",
        );
      }
    }

    if (user) {
      const isHr =
        user.roles.includes(RoleName.HR_ADMIN) ||
        user.roles.includes(RoleName.SUPER_ADMIN);
      if (!isHr) {
        const {
          monthlySalary,
          salaryCurrency,
          payrollEligible,
          ...safeEmployee
        } = employee as any;
        return safeEmployee;
      }
    }

    return employee;
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    user?: { employeeId?: string; roles: string[] },
  ) {
    const employee = await this.findOne(id, user);
    const targetDepartmentId = dto.departmentId ?? employee.departmentId;
    const departmentChanged =
      dto.departmentId !== undefined &&
      dto.departmentId !== employee.departmentId;
    const designationId =
      dto.designationId !== undefined
        ? dto.designationId
        : departmentChanged
          ? undefined
          : employee.designationId ?? undefined;

    if (designationId) {
      const designation = await this.prisma.designation.findFirst({
        where: { id: designationId, deletedAt: null },
      });
      if (!designation) {
        throw new BadRequestException("Selected designation does not exist");
      }
      if (
        targetDepartmentId &&
        designation.departmentId !== targetDepartmentId
      ) {
        throw new BadRequestException(
          "Selected designation does not belong to the selected department",
        );
      }
    }
    const isHr =
      user?.roles.includes(RoleName.HR_ADMIN) ||
      user?.roles.includes(RoleName.SUPER_ADMIN);
    if (!isHr)
      throw new ForbiddenException(
        "Only HR can update employee master records",
      );
    return this.prisma.employee.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        personalEmail: dto.personalEmail,
        phone: dto.phone,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        emergencyContact: dto.emergencyContact,
        emergencyAddress: dto.emergencyAddress,
        dateOfJoining: dto.dateOfJoining
          ? new Date(dto.dateOfJoining)
          : undefined,
        employmentType: dto.employmentType,
        employmentStatus: dto.employmentStatus,
        departmentId: dto.departmentId,
        designationId:
          dto.designationId !== undefined
            ? dto.designationId
            : departmentChanged
              ? null
              : undefined,
        managerId: dto.managerId,
        skipLevelManagerId: dto.skipLevelManagerId,
        location: dto.location,
        monthlySalary: dto.monthlySalary,
        salaryCurrency: dto.salaryCurrency,
        payrollEligible: dto.payrollEligible,
        exitDate: dto.exitDate ? new Date(dto.exitDate) : undefined,
      },
      include: {
        department: true,
        designation: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id },
        data: { employmentStatus: "EXITED", exitDate: new Date() },
      });
      await tx.user.update({
        where: { id: employee.userId },
        data: { isActive: false },
      });
      return employee;
    });
  }

  async reactivate(id: string) {
    const employee = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: { employmentStatus: "CONFIRMED", exitDate: null },
      });
      await tx.user.update({
        where: { id: employee.userId },
        data: { isActive: true },
      });
      return updated;
    });
  }

  async myReports(user: { employeeId?: string; roles: string[] }) {
    if (!user.employeeId || !user.roles.includes(RoleName.MANAGER)) {
      throw new ForbiddenException("Only managers can view direct reports");
    }
    return this.prisma.employee.findMany({
      where: {
        managerId: user.employeeId,
        deletedAt: null,
        employmentStatus: { not: "EXITED" },
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
      },
      orderBy: { firstName: "asc" },
    });
  }

  async orgHierarchy() {
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null, employmentStatus: { not: "EXITED" } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        managerId: true,
        designation: { select: { title: true } },
      },
    });

    const byManager = new Map<string | null, typeof employees>();
    for (const emp of employees) {
      const key = emp.managerId ?? null;
      if (!byManager.has(key)) byManager.set(key, [] as any);
      byManager.get(key)!.push(emp);
    }

    const build = (managerId: string | null): any[] =>
      (byManager.get(managerId) ?? []).map((emp) => ({
        ...emp,
        reports: build(emp.id),
      }));

    return build(null);
  }
}
