import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LeaveStatus, RoleName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WorkdayService } from "../workday/workday.service";
import { CalendarService } from "../calendar/calendar.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationCategory } from "../notifications/notification-category.enum";
import { ApplyLeaveDto, CreateLeaveTypeDto } from "./dto/leave.dto";

@Injectable()
export class LeaveService {
  constructor(
    private prisma: PrismaService,
    private workdayService: WorkdayService,
    private notifications: NotificationsService,
    private calendarService: CalendarService,
  ) {}

  async listTypes() {
    const org = await this.calendarService.getOrganization();
    return this.prisma.leaveType.findMany({
      where: { organizationId: org.id },
      orderBy: { name: "asc" },
    });
  }

  async createType(dto: CreateLeaveTypeDto) {
    const org = await this.calendarService.getOrganization();
    return this.prisma.leaveType.create({
      data: { ...dto, organizationId: org.id },
    });
  }

  private async workingDaysByYear(start: Date, end: Date) {
    const result = new Map<number, number>();
    for (
      let d = new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          start.getUTCDate(),
        ),
      );
      d <= end;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      if (!(await this.calendarService.isWorkingDay(d)).working) continue;
      const year = d.getUTCFullYear();
      result.set(year, (result.get(year) ?? 0) + 1);
    }
    return result;
  }

  async balances(employeeId: string, year = new Date().getFullYear()) {
    return this.prisma.leaveBalance.findMany({
      where: { employeeId, year },
      include: { leaveType: true },
    });
  }

  async apply(employeeId: string, dto: ApplyLeaveDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { manager: { include: { user: true } } },
    });
    if (!employee) throw new NotFoundException("Employee not found");

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start)
      throw new BadRequestException("endDate cannot be before startDate");
    const numberOfDaysByYear = await this.workingDaysByYear(start, end);
    const numberOfDays = Array.from(numberOfDaysByYear.values()).reduce(
      (sum, value) => sum + value,
      0,
    );
    if (numberOfDays === 0)
      throw new BadRequestException(
        "The selected dates contain no company working days",
      );

    const leaveType = await this.prisma.leaveType.findFirst({
      where: {
        id: dto.leaveTypeId,
        organizationId: (await this.calendarService.getOrganization()).id,
      },
    });
    if (!leaveType) throw new NotFoundException("Leave type not found");

    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: {
          in: [
            LeaveStatus.PENDING,
            LeaveStatus.MANAGER_APPROVED,
            LeaveStatus.APPROVED,
          ],
        },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlap)
      throw new BadRequestException(
        "You already have a leave request covering part of these dates",
      );

    for (const [year, requestedDays] of numberOfDaysByYear) {
      const balance = await this.prisma.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId,
            leaveTypeId: dto.leaveTypeId,
            year,
          },
        },
      });
      const available = balance
        ? Number(balance.accrued) +
          Number(balance.carriedForward) -
          Number(balance.used)
        : 0;
      if (
        leaveType.isPaid &&
        leaveType.code !== "WFH" &&
        available < requestedDays
      ) {
        throw new BadRequestException(
          `Insufficient ${leaveType.name} balance for ${year}: ${available} day(s) available, ${requestedDays} requested`,
        );
      }
    }

    const request = await this.prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: dto.leaveTypeId,
        startDate: start,
        endDate: end,
        numberOfDays,
        reason: dto.reason,
        managerId: employee.managerId,
      },
    });

    if (employee.manager?.user) {
      await this.notifications.notify({
        userId: employee.manager.userId!,
        title: "Leave approval required",
        body: `${employee.firstName} ${employee.lastName} requested ${numberOfDays} day(s) leave (${dto.startDate} to ${dto.endDate}).`,
        category: NotificationCategory.LEAVE_APPROVAL,
        emailAlso: true,
        recipientEmail: employee.manager.user.email,
      });
    } else {
      const hrUsers = await this.prisma.user.findMany({
        where: {
          isActive: true,
          roles: { some: { role: { name: RoleName.HR_ADMIN } } },
        },
      });
      for (const hrUser of hrUsers) {
        await this.notifications.notify({
          userId: hrUser.id,
          title: "Leave approval required",
          body: `${employee.firstName} ${employee.lastName} requested leave but has no reporting manager; HR review is required.`,
          category: NotificationCategory.LEAVE_APPROVAL,
          emailAlso: false,
        });
      }
    }

    return request;
  }

  async managerApprove(requestId: string, managerId: string) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { employee: true, leaveType: true },
    });
    if (!request) throw new NotFoundException("Leave request not found");
    if (request.managerId !== managerId)
      throw new BadRequestException(
        "This leave request is not assigned to you",
      );
    if (request.status !== LeaveStatus.PENDING)
      throw new BadRequestException("Request already actioned");

    const updated = await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: LeaveStatus.MANAGER_APPROVED,
        managerActionAt: new Date(),
      },
    });

    const hrUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { role: { name: RoleName.HR_ADMIN } } },
      },
    });
    for (const hrUser of hrUsers) {
      await this.notifications.notify({
        userId: hrUser.id,
        title: "Leave ready for HR approval",
        body: `${request.employee.firstName} ${request.employee.lastName}'s ${request.leaveType.name} request was approved by the manager.`,
        category: NotificationCategory.LEAVE_APPROVAL,
        emailAlso: false,
      });
    }
    return updated;
  }

  /** HR final approval — reconciles attendance for the leave period via the WorkDay sync engine. */
  async hrApprove(requestId: string, hrEmployeeId: string) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException("Leave request not found");
    if (request.managerId && request.status !== LeaveStatus.MANAGER_APPROVED) {
      throw new BadRequestException("Request is not awaiting approval");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status: LeaveStatus.APPROVED, hrActionAt: new Date() },
      });

      const perYear = await this.workingDaysByYear(
        request.startDate,
        request.endDate,
      );
      for (const [year, days] of perYear) {
        await tx.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              year,
            },
          },
          create: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
            used: days,
          },
          update: { used: { increment: days } },
        });
      }
    });

    const leaveType = await this.prisma.leaveType.findUnique({
      where: { id: request.leaveTypeId },
    });
    for (
      let d = new Date(request.startDate);
      d <= request.endDate;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      if ((await this.calendarService.isWorkingDay(d)).working) {
        await this.workdayService.markLeave(
          request.employeeId,
          new Date(d),
          leaveType?.code === "WFH",
        );
      }
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: request.employeeId },
      include: { user: true },
    });
    if (employee) {
      await this.notifications.notify({
        userId: employee.userId,
        title: "Leave approved",
        body: `Your leave request from ${request.startDate.toDateString()} to ${request.endDate.toDateString()} has been approved.`,
        category: NotificationCategory.LEAVE_APPROVAL,
        emailAlso: true,
        recipientEmail: employee.user.email,
      });
    }

    return this.prisma.leaveRequest.findUnique({ where: { id: requestId } });
  }

  async reject(
    requestId: string,
    approverId: string,
    roles: string[],
    reason: string,
  ) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException("Leave request not found");
    const isHr =
      roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    const isManager = roles.includes(RoleName.MANAGER);
    if (
      isManager &&
      !isHr &&
      (request.managerId !== approverId ||
        request.status !== LeaveStatus.PENDING)
    ) {
      throw new BadRequestException("You cannot reject this leave request");
    }
    if (isHr && request.status === LeaveStatus.PENDING && request.managerId) {
      throw new BadRequestException(
        "Manager approval is required before HR can reject this request",
      );
    }
    return this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: LeaveStatus.REJECTED, rejectionReason: reason },
    });
  }

  async pendingApprovals(employeeId: string, roles: string[]) {
    const isHr =
      roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    if (isHr) {
      return this.prisma.leaveRequest.findMany({
        where: {
          OR: [
            { status: LeaveStatus.MANAGER_APPROVED },
            { status: LeaveStatus.PENDING, managerId: null },
          ],
        },
        include: {
          employee: {
            select: { firstName: true, lastName: true, employeeCode: true },
          },
          leaveType: true,
        },
        orderBy: { createdAt: "asc" },
      });
    }
    return this.prisma.leaveRequest.findMany({
      where: { managerId: employeeId, status: LeaveStatus.PENDING },
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeCode: true },
        },
        leaveType: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async cancel(requestId: string, employeeId: string) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id: requestId, employeeId },
    });
    if (!request) throw new NotFoundException("Leave request not found");
    if (request.status === LeaveStatus.APPROVED) {
      throw new BadRequestException(
        "Approved leave requires HR to reverse it manually",
      );
    }
    return this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: LeaveStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  async reverseApproved(requestId: string, actorId: string) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { leaveType: true },
    });
    if (!request) throw new NotFoundException("Leave request not found");
    if (request.status !== LeaveStatus.APPROVED)
      throw new BadRequestException(
        "Only fully approved leave can be reversed",
      );
    const perYear = await this.workingDaysByYear(
      request.startDate,
      request.endDate,
    );
    return this.prisma.$transaction(async (tx) => {
      for (const [year, days] of perYear) {
        await tx.leaveBalance.updateMany({
          where: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
          data: { used: { decrement: days } },
        });
      }
      await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: LeaveStatus.CANCELLED,
          cancelledAt: new Date(),
          hrActionAt: new Date(),
        },
      });
      for (
        let d = new Date(request.startDate);
        d <= request.endDate;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const day = new Date(d);
        const workDay = await tx.workDay.findUnique({
          where: {
            employeeId_date: { employeeId: request.employeeId, date: day },
          },
        });
        if (!workDay) continue;
        const status = workDay.checkInAt
          ? workDay.isLate
            ? "LATE"
            : "PRESENT"
          : "ABSENT";
        await tx.workDay.update({
          where: { id: workDay.id },
          data: { attendanceStatus: status as any, dprStatus: "DRAFT" },
        });
      }
      return { requestId, status: LeaveStatus.CANCELLED, reversedBy: actorId };
    });
  }

  async history(employeeId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { employeeId },
      include: { leaveType: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async teamCalendar(managerId: string, from: Date, to: Date) {
    const reports = await this.prisma.employee.findMany({
      where: { managerId },
      select: { id: true },
    });
    return this.prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: reports.map((r) => r.id) },
        status: { in: [LeaveStatus.APPROVED, LeaveStatus.MANAGER_APPROVED] },
        startDate: { lte: to },
        endDate: { gte: from },
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        leaveType: true,
      },
    });
  }
}
