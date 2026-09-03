import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CalendarService } from "../calendar/calendar.service";
import { AttendanceStatus, RoleName } from "@prisma/client";

/**
 * WorkdayService is the sync hub described in the plan (section 6): every employee has exactly
 * one WorkDay row per calendar date, and Attendance / To-Do / DPR all read and write through it
 * instead of existing as independent silos. Nothing outside this module should create a WorkDay
 * row directly.
 */
@Injectable()
export class WorkdayService {
  private timezoneCache = process.env.HRMS_TIMEZONE ?? "Asia/Kolkata";

  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
  ) {}

  startOfDay(date: Date = new Date(), timezone = this.timezoneCache) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    return new Date(Date.UTC(year, month - 1, day));
  }

  async getOrCreate(employeeId: string, date: Date = new Date()) {
    const org = await this.calendarService.getOrganization();
    this.timezoneCache = org.timezone;
    const day = this.startOfDay(date, org.timezone);

    const calendar = await this.calendarService.isWorkingDayForEmployee(employeeId, day);
    const defaultStatus =
      calendar.type === "HOLIDAY"
        ? AttendanceStatus.HOLIDAY
        : calendar.type === "WEEKEND"
          ? AttendanceStatus.WEEKEND
          : AttendanceStatus.ABSENT;
    // Atomic upsert prevents concurrent team dashboard requests from racing on the unique key.
    const workDay = await this.prisma.workDay.upsert({
      where: { employeeId_date: { employeeId, date: day } },
      create: {
        employeeId,
        date: day,
        attendanceStatus: defaultStatus,
        dprStatus: calendar.working ? "DRAFT" : "APPROVED",
      },
      update: {},
    });
    if (
      !calendar.working &&
      !workDay.checkInAt &&
      workDay.attendanceStatus !== AttendanceStatus.ON_LEAVE
    ) {
      return this.prisma.workDay.update({
        where: { id: workDay.id },
        data: { attendanceStatus: defaultStatus, dprStatus: "APPROVED" },
      });
    }
    return workDay;
  }

  async findForEmployeeDate(employeeId: string, date: Date) {
    const org = await this.calendarService.getOrganization();
    this.timezoneCache = org.timezone;
    return this.prisma.workDay.findUnique({
      where: {
        employeeId_date: {
          employeeId,
          date: this.startOfDay(date, org.timezone),
        },
      },
      include: {
        attendanceRecords: true,
        todos: true,
        dpr: { include: { entries: true } },
      },
    });
  }

  async history(
    employeeId: string,
    from: Date,
    to: Date,
    actor?: { employeeId?: string; roles: string[] },
  ) {
    if (actor) {
      const isHr =
        actor.roles.includes(RoleName.HR_ADMIN) ||
        actor.roles.includes(RoleName.SUPER_ADMIN);
      if (!isHr && actor.employeeId !== employeeId) {
        if (!actor.roles.includes(RoleName.MANAGER))
          throw new ForbiddenException(
            "You can only view your own WorkDay history",
          );
        const target = await this.prisma.employee.findUnique({
          where: { id: employeeId },
          select: { managerId: true },
        });
        if (target?.managerId !== actor.employeeId)
          throw new ForbiddenException(
            "Managers can only view direct-report WorkDay history",
          );
      }
    }
    const org = await this.calendarService.getOrganization();
    this.timezoneCache = org.timezone;
    return this.prisma.workDay.findMany({
      where: {
        employeeId,
        date: {
          gte: this.startOfDay(from, org.timezone),
          lte: this.startOfDay(to, org.timezone),
        },
      },
      orderBy: { date: "desc" },
      include: { todos: true, dpr: true },
    });
  }

  async teamToday(employeeId: string, roles: string[] = []) {
    const today = this.startOfDay();
    const isHr =
      roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { not: "EXITED" },
        ...(isHr ? {} : { managerId: employeeId }),
      },
      select: { id: true },
    });

    // The plan defines one WorkDay per employee per calendar date. Creating today's
    // rows here also makes employees who have not checked in visible as ABSENT.
    await Promise.all(
      employees.map((employee) => this.getOrCreate(employee.id, today)),
    );

    return this.prisma.workDay.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        date: today,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
          },
        },
        dpr: true,
      },
      orderBy: { employee: { firstName: "asc" } },
    });
  }

  /** Recomputes WorkDay.totalLoggedHours from DPR entries — the single source of truth for "hours worked today". */
  async recalcLoggedHours(workDayId: string) {
    const dpr = await this.prisma.dPR.findUnique({
      where: { workDayId },
      include: { entries: true },
    });
    const total = (dpr?.entries ?? []).reduce(
      (sum, e) => sum + Number(e.hours),
      0,
    );
    await this.prisma.workDay.update({
      where: { id: workDayId },
      data: { totalLoggedHours: total },
    });
    return total;
  }

  async setDprStatus(workDayId: string, status: any) {
    return this.prisma.workDay.update({
      where: { id: workDayId },
      data: { dprStatus: status },
    });
  }

  /** Used by leave approval to mark the WorkDay for an approved leave day without requiring a DPR. */
  async markLeave(employeeId: string, date: Date, isWfh = false) {
    const workDay = await this.getOrCreate(employeeId, date);
    return this.prisma.workDay.update({
      where: { id: workDay.id },
      data: {
        attendanceStatus: isWfh
          ? AttendanceStatus.WORK_FROM_HOME
          : AttendanceStatus.ON_LEAVE,
        dprStatus: isWfh ? "DRAFT" : "APPROVED",
      },
    });
  }

  async markHoliday(employeeId: string, date: Date) {
    const workDay = await this.getOrCreate(employeeId, date);
    return this.prisma.workDay.update({
      where: { id: workDay.id },
      data: {
        attendanceStatus: AttendanceStatus.HOLIDAY,
        dprStatus: "APPROVED",
      },
    });
  }
}
