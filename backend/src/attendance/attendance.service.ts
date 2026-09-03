import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AttendanceSource,
  AttendanceStatus,
  DprStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WorkdayService } from "../workday/workday.service";
import { CalendarService } from "../calendar/calendar.service";
import { CheckInDto, CheckOutDto } from "./dto/attendance.dto";

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private workdayService: WorkdayService,
    private calendarService: CalendarService,
  ) {}

  private localMinutes(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const hour = Number(
      parts.find((p) => p.type === "hour")?.value ?? 0,
    );

    const minute = Number(
      parts.find((p) => p.type === "minute")?.value ?? 0,
    );

    return hour * 60 + minute;
  }

  private breakMinutes(
    checkInAt: Date,
    checkOutAt: Date,
    lunchStart: number,
    lunchEnd: number,
    timezone: string,
  ) {
    const inMinutes = this.localMinutes(checkInAt, timezone);
    const outMinutes = this.localMinutes(checkOutAt, timezone);

    const overlapStart = Math.max(inMinutes, lunchStart);
    const overlapEnd = Math.min(outMinutes, lunchEnd);

    return Math.max(0, overlapEnd - overlapStart);
  }

  async checkIn(employeeId: string, dto: CheckInDto, ip?: string) {
    const now = new Date();
    const policy = await this.calendarService.getEmployeePolicy(employeeId);
    const localMinutes = this.localMinutes(now, policy.timezone);

    if (localMinutes < policy.checkInOpenMinutes) {
      throw new BadRequestException(
        `Check-in opens at ${String(Math.floor(policy.checkInOpenMinutes / 60)).padStart(2, "0")}:${String(policy.checkInOpenMinutes % 60).padStart(2, "0")}.`,
      );
    }
    if (localMinutes >= policy.checkInCutoffMinutes) {
      throw new BadRequestException(
        "The check-in window is closed. Please apply for leave or contact HR.",
      );
    }

    const dayPolicy = await this.calendarService.isWorkingDayForEmployee(employeeId, now);
    if (!dayPolicy.working) {
      throw new BadRequestException(
        dayPolicy.type === "HOLIDAY" ? "Today is a company holiday" : "Today is a non-working day for your department",
      );
    }

    const workDay = await this.workdayService.getOrCreate(employeeId, now);
    if (workDay.checkInAt) throw new BadRequestException("Already checked in today");

    const late = localMinutes > policy.lateAfterMinutes;
    const halfDayByTime = localMinutes > policy.halfDayAfterMinutes;
    let lateCountInMonth: number | null = null;
    let latePenaltyDays = 0;
    if (late) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: policy.timezone, year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(now);
      const year = Number(parts.find((x) => x.type === "year")?.value);
      const month = Number(parts.find((x) => x.type === "month")?.value);
      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const monthEnd = new Date(Date.UTC(year, month, 1));
      const previousLates = await this.prisma.workDay.count({
        where: { employeeId, date: { gte: monthStart, lt: monthEnd }, isLate: true },
      });
      lateCountInMonth = previousLates + 1;
      // The business rule is cumulative: the first two lates are allowed;
      // once the employee reaches the third late in the same month, one full
      // working day is deducted. Further lates do not create another absent
      // day in the same month. The attendance row itself remains LATE because
      // the employee did check in; the monthly payroll/attendance summary
      // carries the one-day penalty separately.
      if (lateCountInMonth <= policy.allowedLatesPerMonth) {
        latePenaltyDays = lateCountInMonth === 1
          ? Number(policy.firstLatePenaltyDays)
          : lateCountInMonth === 2
            ? Number(policy.secondLatePenaltyDays)
            : 0;
      } else if (lateCountInMonth === policy.allowedLatesPerMonth + 1) {
        latePenaltyDays = Number(policy.thirdPlusLatePenaltyDays);
      } else {
        latePenaltyDays = 0;
      }
    }

    const status: AttendanceStatus = halfDayByTime
      ? AttendanceStatus.HALF_DAY
      : late
        ? AttendanceStatus.LATE
        : AttendanceStatus.PRESENT;

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.workDay.updateMany({
        where: { id: workDay.id, checkInAt: null },
        data: {
          checkInAt: now, attendanceStatus: status, isLate: late,
          lateCountInMonth, latePenaltyDays, absenceNotifiedAt: null,
        },
      });
      if (claimed.count !== 1) throw new BadRequestException("Attendance was already checked in. Refresh and try again.");

      await tx.attendanceRecord.create({
        data: {
          workDayId: workDay.id, type: "CHECK_IN", status,
          source: dto.latitude !== undefined && dto.longitude !== undefined ? AttendanceSource.MOBILE_GPS : AttendanceSource.WEB,
          timestamp: now, latitude: dto.latitude, longitude: dto.longitude, ipAddress: ip,
          note: [dto.note, late ? `Late #${lateCountInMonth}; penalty ${latePenaltyDays} day(s)` : null].filter(Boolean).join(" | ") || undefined,
        },
      });

      const dayStart = this.workdayService.startOfDay(now, policy.timezone);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      await tx.todo.updateMany({
        where: { assigneeId: employeeId, workDayId: null, status: { not: "CANCELLED" }, dueDate: { gte: dayStart, lt: dayEnd } },
        data: { workDayId: workDay.id },
      });
      return tx.workDay.findUniqueOrThrow({ where: { id: workDay.id }, include: { attendanceRecords: true } });
    });
  }

  async checkOut(
    employeeId: string,
    dto: CheckOutDto,
    ip?: string,
    roles: string[] = [],
  ) {
    const now = new Date();

    const calendar = await this.calendarService.getEmployeePolicy(employeeId);

    const dayPolicy = await this.calendarService.isWorkingDayForEmployee(employeeId, now);

    if (!dayPolicy.working) {
      throw new BadRequestException(
        dayPolicy.type === "HOLIDAY"
          ? "Today is a company holiday"
          : "Today is a non-working day",
      );
    }

    const workDay =
      await this.workdayService.getOrCreate(
        employeeId,
        now,
      );

    if (!workDay.checkInAt) {
      throw new BadRequestException(
        "Cannot check out before checking in",
      );
    }

    if (workDay.checkOutAt) {
      throw new BadRequestException(
        "Already checked out today",
      );
    }

    // The EOD/DPR gate is an employee-only policy. HR, managers and
    // super admins must be able to check out without completing their own
    // task/DPR workflow first.
    const isEmployeeOnly =
      roles.includes("EMPLOYEE") &&
      !roles.includes("MANAGER") &&
      !roles.includes("HR_ADMIN") &&
      !roles.includes("SUPER_ADMIN");

    if (isEmployeeOnly) {
      const pendingTasks =
        await this.prisma.todo.count({
          where: {
            workDayId: workDay.id,
            status: { not: "CANCELLED" },
            eodStatus: "PENDING",
          },
        });

      if (pendingTasks > 0) {
        throw new BadRequestException(
          `Resolve all ${pendingTasks} pending task(s) before checkout. Completed tasks require screenshot proof; incomplete tasks require a valid reason.`,
        );
      }

      const dpr =
        await this.prisma.dPR.findUnique({
          where: {
            workDayId: workDay.id,
          },
          select: {
            status: true,
          },
        });

      if (
        !dpr ||
        (dpr.status !== DprStatus.SUBMITTED &&
          dpr.status !== DprStatus.APPROVED)
      ) {
        throw new BadRequestException(
          "Submit today's DPR before checkout so the task-completion analysis can be completed.",
        );
      }
    }


    const grossMinutes =
      (now.getTime() -
        new Date(
          workDay.checkInAt,
        ).getTime()) /
      60000;

    const breakMinutes =
      this.breakMinutes(
        new Date(workDay.checkInAt),
        now,
        calendar.lunchStartMinutes,
        calendar.lunchEndMinutes,
        calendar.timezone,
      );

    const workingHours =
      Math.max(
        0,
        grossMinutes - breakMinutes,
      ) / 60;

    const early =
      this.localMinutes(
        now,
        calendar.timezone,
      ) < calendar.officeEndMinutes;

    const status =
      workingHours < 4
        ? AttendanceStatus.HALF_DAY
        : workDay.attendanceStatus;

    return this.prisma.$transaction(
      async (tx) => {
        const claimed =
          await tx.workDay.updateMany({
            where: {
              id: workDay.id,
              checkInAt: { not: null },
              checkOutAt: null,
            },
            data: {
              checkOutAt: now,
              workingHours: Number(
                workingHours.toFixed(2),
              ),
              isEarlyDeparture: early,
              attendanceStatus: status,
            },
          });

        if (claimed.count !== 1) {
          throw new BadRequestException(
            "Attendance was already checked out. Refresh and try again.",
          );
        }

        await tx.attendanceRecord.create({
          data: {
            workDayId: workDay.id,
            type: "CHECK_OUT",
            status,
            source:
              dto.latitude !== undefined &&
              dto.longitude !== undefined
                ? AttendanceSource.MOBILE_GPS
                : AttendanceSource.WEB,
            timestamp: now,
            latitude: dto.latitude,
            longitude: dto.longitude,
            ipAddress: ip,
            note: dto.note,
          },
        });

        return tx.workDay.findUniqueOrThrow({
          where: {
            id: workDay.id,
          },
          include: {
            attendanceRecords: true,
          },
        });
      },
    );
  }

  async undoCheckIn(employeeId: string, ip?: string) {
    const now = new Date();
    const calendar = await this.calendarService.getOrganization();
    const workDay = await this.workdayService.getOrCreate(employeeId, now);

    if (!workDay.checkInAt) {
      throw new BadRequestException("You have not checked in today");
    }

    if (workDay.checkOutAt) {
      throw new BadRequestException(
        "You have already checked out. Undo checkout first, then undo check-in.",
      );
    }

    const localDate = (date: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: calendar.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);

    if (localDate(new Date(workDay.checkInAt)) !== localDate(now)) {
      throw new BadRequestException(
        "Check-in can only be undone on the same working day.",
      );
    }

    // Do not allow the attendance record to be erased after the employee has
    // started completing the EOD workflow. Use regularisation for corrections
    // once meaningful work has already been recorded.
    const dpr = await this.prisma.dPR.findUnique({
      where: { workDayId: workDay.id },
      select: { status: true },
    });
    if (
      dpr &&
      ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(dpr.status)
    ) {
      throw new BadRequestException(
        "Check-in cannot be undone after the DPR has been submitted. Use attendance regularisation instead.",
      );
    }

    const completedOrStartedTasks = await this.prisma.todo.count({
      where: {
        workDayId: workDay.id,
        status: { in: ["IN_PROGRESS", "COMPLETED"] },
      },
    });
    if (completedOrStartedTasks > 0) {
      throw new BadRequestException(
        "Check-in cannot be undone after work has started. Use attendance regularisation instead.",
      );
    }

    const dayPolicy = await this.calendarService.isWorkingDayForEmployee(employeeId, now);
    const restoredStatus = dayPolicy.working
      ? AttendanceStatus.ABSENT
      : dayPolicy.type === "HOLIDAY"
        ? AttendanceStatus.HOLIDAY
        : AttendanceStatus.WEEKEND;

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.workDay.updateMany({
        where: {
          id: workDay.id,
          checkInAt: { not: null },
          checkOutAt: null,
        },
        data: {
          checkInAt: null,
          checkOutAt: null,
          workingHours: null,
          isEarlyDeparture: false,
          isLate: false,
          lateCountInMonth: null,
          latePenaltyDays: 0,
          absenceNotifiedAt: null,
          attendanceStatus: restoredStatus,
        },
      });

      if (claimed.count !== 1) {
        throw new BadRequestException(
          "Check-in could not be undone. Refresh and try again.",
        );
      }

      await tx.attendanceRecord.create({
        data: {
          workDayId: workDay.id,
          type: "CHECK_IN_UNDO",
          status: restoredStatus,
          source: AttendanceSource.WEB,
          timestamp: now,
          ipAddress: ip,
          note: "Check-in undone by employee.",
        },
      });

      return tx.workDay.findUniqueOrThrow({
        where: { id: workDay.id },
        include: { attendanceRecords: true },
      });
    });
  }

  async undoCheckOut(employeeId: string, ip?: string) {
    const now = new Date();
    const calendar = await this.calendarService.getOrganization();
    const workDay = await this.workdayService.getOrCreate(employeeId, now);

    if (!workDay.checkInAt) {
      throw new BadRequestException("Cannot undo checkout before checking in");
    }

    if (!workDay.checkOutAt) {
      throw new BadRequestException("You have not checked out today");
    }

    const localDate = (date: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: calendar.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);

    if (localDate(new Date(workDay.checkOutAt)) !== localDate(now)) {
      throw new BadRequestException(
        "Checkout can only be undone on the same working day.",
      );
    }

    const restoredStatus = workDay.isLate
      ? AttendanceStatus.LATE
      : AttendanceStatus.PRESENT;

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.workDay.updateMany({
        where: {
          id: workDay.id,
          checkOutAt: { not: null },
        },
        data: {
          checkOutAt: null,
          workingHours: null,
          isEarlyDeparture: false,
          attendanceStatus: restoredStatus,
        },
      });

      if (claimed.count !== 1) {
        throw new BadRequestException(
          "Checkout could not be undone. Refresh and try again.",
        );
      }

      await tx.attendanceRecord.create({
        data: {
          workDayId: workDay.id,
          type: "CHECK_OUT_UNDO",
          status: restoredStatus,
          source: AttendanceSource.WEB,
          timestamp: now,
          ipAddress: ip,
          note: "Checkout undone by employee.",
        },
      });

      return tx.workDay.findUniqueOrThrow({
        where: { id: workDay.id },
        include: { attendanceRecords: true },
      });
    });
  }

  async requestRegularisation(
    employeeId: string,
    workDayId: string,
    reason: string,
    requestedCheckIn?: string,
    requestedCheckOut?: string,
  ) {
    const workDay =
      await this.prisma.workDay.findFirst({
        where: {
          id: workDayId,
          employeeId,
        },
      });

    if (!workDay) {
      throw new BadRequestException(
        "WorkDay not found",
      );
    }

    const needsRegularisation =
      workDay.isLate ||
      workDay.attendanceStatus === AttendanceStatus.HALF_DAY ||
      workDay.attendanceStatus === AttendanceStatus.ABSENT ||
      (!!workDay.checkInAt && !workDay.checkOutAt);

    if (!needsRegularisation) {
      throw new BadRequestException(
        "Regularisation is only available for late, absent, half-day, or incomplete attendance records.",
      );
    }

    const existing =
      await this.prisma.attendanceRecord.findFirst({
        where: {
          workDayId,
          type: "REGULARISATION",
          approvedBy: null,
        },
      });

    if (existing) {
      throw new BadRequestException(
        "A regularisation request is already pending for this day",
      );
    }

    return this.prisma.attendanceRecord.create({
      data: {
        workDayId,
        type: "REGULARISATION",
        status: workDay.attendanceStatus,
        source: "MANUAL_REGULARISATION",
        timestamp: new Date(),
        note: JSON.stringify({
          reason,
          requestedCheckIn,
          requestedCheckOut,
        }),
      },
    });
  }

  async approveRegularisation(
    recordId: string,
    approverId: string,
    roles: string[] = [],
  ) {
    const record =
      await this.prisma.attendanceRecord.findUnique({
        where: {
          id: recordId,
        },
        include: {
          workDay: {
            include: {
              employee: {
                select: {
                  managerId: true,
                },
              },
            },
          },
        },
      });

    if (!record) {
      throw new BadRequestException(
        "Regularisation record not found",
      );
    }

    const isAdmin =
      roles.includes("HR_ADMIN") ||
      roles.includes("SUPER_ADMIN");

    if (
      !isAdmin &&
      record.workDay.employee.managerId !==
        approverId
    ) {
      throw new BadRequestException(
        "Only the reporting manager can approve this regularisation",
      );
    }

    const detail = JSON.parse(
      record.note ?? "{}",
    );

    if (record.approvedBy) {
      throw new BadRequestException(
        "Regularisation has already been approved",
      );
    }

    const checkIn = detail.requestedCheckIn
      ? new Date(detail.requestedCheckIn)
      : null;

    const checkOut = detail.requestedCheckOut
      ? new Date(detail.requestedCheckOut)
      : null;

    if (
      checkIn &&
      Number.isNaN(checkIn.getTime())
    ) {
      throw new BadRequestException(
        "Invalid requested check-in time",
      );
    }

    if (
      checkOut &&
      Number.isNaN(checkOut.getTime())
    ) {
      throw new BadRequestException(
        "Invalid requested check-out time",
      );
    }

    if (
      checkIn &&
      checkOut &&
      checkOut <= checkIn
    ) {
      throw new BadRequestException(
        "Requested check-out must be after check-in",
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.attendanceRecord.update({
          where: {
            id: recordId,
          },
          data: {
            approvedBy: approverId,
          },
        });

        const data: any = {
          attendanceStatus: checkIn
            ? AttendanceStatus.PRESENT
            : record.workDay.attendanceStatus,
        };

        if (checkIn) {
          data.checkInAt = checkIn;
        }

        if (checkOut) {
          data.checkOutAt = checkOut;

          const calendar =
            await this.calendarService.getOrganization();

          const gross =
            Math.max(
              0,
              checkOut.getTime() -
                (
                  checkIn ??
                  record.workDay.checkInAt ??
                  checkOut
                ).getTime(),
            ) / 60000;

          const breakMin = checkIn
            ? this.breakMinutes(
                checkIn,
                checkOut,
                calendar.lunchStartMinutes,
                calendar.lunchEndMinutes,
                calendar.timezone,
              )
            : 0;

          data.workingHours = Number(
            Math.max(
              0,
              gross - breakMin,
            ) / 60,
          ).toFixed(2);
        }

        return tx.workDay.update({
          where: {
            id: record.workDayId,
          },
          data,
        });
      },
    );
  }

  async pendingRegularisations(user: {
    employeeId?: string;
    roles: string[];
  }) {
    const isHr =
      user.roles.includes("HR_ADMIN") ||
      user.roles.includes("SUPER_ADMIN");

    const rows =
      await this.prisma.attendanceRecord.findMany({
        where: {
          type: "REGULARISATION",
          approvedBy: null,
          workDay: {
            employee: isHr
              ? { deletedAt: null }
              : {
                  managerId: user.employeeId,
                },
          },
        },
        include: {
          workDay: {
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  employeeCode: true,
                  managerId: true,
                },
              },
            },
          },
        },
        orderBy: {
          timestamp: "asc",
        },
      });

    return rows;
  }

  async monthlyReport(
    employeeId: string,
    month: number,
    year: number,
    actor?: {
      employeeId?: string;
      roles: string[];
    },
  ) {
    if (actor) {
      const isHr = actor.roles.includes("HR_ADMIN") || actor.roles.includes("SUPER_ADMIN");
      if (!isHr && actor.employeeId !== employeeId) {
        const target = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } });
        if (!actor.roles.includes("MANAGER") || target?.managerId !== actor.employeeId) {
          throw new BadRequestException("You are not allowed to view this attendance report");
        }
      }
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, departmentId: true, department: { select: { id: true, name: true } } },
    });
    if (!employee) throw new NotFoundException("Employee not found");

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const calendar = await this.calendarService.workingDaySummaryForEmployee(employeeId, month, year);
    const workDays = await this.prisma.workDay.findMany({
      where: { employeeId, date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
    });
    const approvedLeaves = await this.prisma.leaveRequest.findMany({
      where: { employeeId, status: "APPROVED", startDate: { lt: end }, endDate: { gte: start } },
      include: { leaveType: true },
    });
    const paidLeaveDates = new Set<string>();
    const leaveDates = new Set<string>();
    for (const leave of approvedLeaves) {
      for (let d = new Date(leave.startDate); d <= leave.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        leaveDates.add(key);
        if (leave.leaveType.isPaid) paidLeaveDates.add(key);
      }
    }
    const byDate = new Map(workDays.map((w) => [w.date.toISOString().slice(0, 10), w]));
    const expectedDays = calendar.days.filter((d: any) => d.working);
    const currentMonthWorkingDays = expectedDays.length;
    let workedDays = 0;
    let presentDays = 0;
    let halfDays = 0;
    let wfhDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let absentDays = 0;
    let lateCount = 0;
    let totalHours = 0;

    for (const day of expectedDays) {
      const key = day.date;
      const wd: any = byDate.get(key);
      if (leaveDates.has(key)) {
        if (paidLeaveDates.has(key)) paidLeaveDays++; else unpaidLeaveDays++;
        continue;
      }
      if (!wd || wd.attendanceStatus === "ABSENT") {
        absentDays++;
        continue;
      }
      if (wd.attendanceStatus === "HALF_DAY") {
        halfDays++;
        workedDays += 0.5;
      } else if (wd.attendanceStatus === "WORK_FROM_HOME") {
        wfhDays++;
        workedDays += 1;
      } else if (["PRESENT", "LATE"].includes(wd.attendanceStatus)) {
        presentDays++;
        workedDays += 1;
        if (wd.attendanceStatus === "LATE" || wd.isLate) lateCount++;
      }
      if (wd.workingHours) totalHours += Number(wd.workingHours);
    }

    // One full-day attendance deduction is applied at the third monthly late.
    // It is derived from the monthly late history rather than multiplying by
    // every later late, matching the HR rule requested for the system.
    const latePenaltyDays = lateCount >= 3 ? 1 : 0;
    const effectiveWorkingDays = Math.max(0, currentMonthWorkingDays - latePenaltyDays);
    const attendanceWorkedEquivalent = workedDays + paidLeaveDays;
    const attendanceRate = currentMonthWorkingDays
      ? Number(((attendanceWorkedEquivalent / currentMonthWorkingDays) * 100).toFixed(1))
      : 100;

    return {
      employee: { ...employee, department: employee.department },
      month,
      year,
      totalWorkingDays: currentMonthWorkingDays,
      effectiveWorkingDays,
      workedDays: Number(workedDays.toFixed(1)),
      presentDays,
      halfDays,
      wfhDays,
      paidLeaveDays,
      unpaidLeaveDays,
      absentDays,
      lateCount,
      latePenaltyDays,
      totalHours: Number(totalHours.toFixed(2)),
      attendanceRate,
      records: workDays,
    };
  }

  async monthlyTeamReport(month: number, year: number, actor?: { employeeId?: string; roles: string[] }) {
    const isHr = actor?.roles.includes("HR_ADMIN") || actor?.roles.includes("SUPER_ADMIN");
    if (!isHr) throw new BadRequestException("Only HR can view the monthly attendance team report");
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null, employmentStatus: { not: "EXITED" } },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { id: true, name: true } }, designation: { select: { title: true } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    const rows = await Promise.all(employees.map((employee) => this.monthlyReport(employee.id, month, year, actor)));
    return { month, year, rows };
  }

  async teamAttendanceToday(
    managerId: string,
    roles: string[] = [],
  ) {
    return this.workdayService.teamToday(
      managerId,
      roles,
    );
  }
}
