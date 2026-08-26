import { BadRequestException, Injectable } from "@nestjs/common";
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

    const calendar = await this.calendarService.getOrganization();

    const dayPolicy =
      await this.calendarService.isWorkingDay(now);

    if (!dayPolicy.working) {
      throw new BadRequestException(
        dayPolicy.type === "HOLIDAY"
          ? "Today is a company holiday"
          : "Today is a non-working day",
      );
    }

    const workDay =
      await this.workdayService.getOrCreate(employeeId, now);

    if (workDay.checkInAt) {
      throw new BadRequestException(
        "Already checked in today",
      );
    }

    const late =
      this.localMinutes(now, calendar.timezone) >
      calendar.officeStartMinutes +
        calendar.lateGraceMinutes;

    const status = late
      ? AttendanceStatus.LATE
      : AttendanceStatus.PRESENT;

    const updated = await this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.workDay.updateMany({
          where: {
            id: workDay.id,
            checkInAt: null,
          },
          data: {
            checkInAt: now,
            attendanceStatus: status,
            isLate: late,
          },
        });

        if (claimed.count !== 1) {
          throw new BadRequestException(
            "Attendance was already checked in. Refresh and try again.",
          );
        }

        await tx.attendanceRecord.create({
          data: {
            workDayId: workDay.id,
            type: "CHECK_IN",
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

        const dayStart =
          this.workdayService.startOfDay(now);

        const dayEnd = new Date(
          dayStart.getTime() +
            24 * 60 * 60 * 1000,
        );

        await tx.todo.updateMany({
          where: {
            assigneeId: employeeId,
            workDayId: null,
            status: { not: "CANCELLED" },
            dueDate: {
              gte: dayStart,
              lt: dayEnd,
            },
          },
          data: {
            workDayId: workDay.id,
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

    return updated;
  }

  async checkOut(
    employeeId: string,
    dto: CheckOutDto,
    ip?: string,
  ) {
    const now = new Date();

    const calendar =
      await this.calendarService.getOrganization();

    const dayPolicy =
      await this.calendarService.isWorkingDay(now);

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

    // Allow checkout when today's DPR is either
    // SUBMITTED or APPROVED.
if (
  !dpr ||
  (dpr.status !== DprStatus.SUBMITTED &&
    dpr.status !== DprStatus.APPROVED)
) {
  throw new BadRequestException(
    "Submit today's DPR before checkout so the task-completion analysis can be completed.",
  );
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
      const isHr =
        actor.roles.includes("HR_ADMIN") ||
        actor.roles.includes("SUPER_ADMIN");

      if (
        !isHr &&
        actor.employeeId !== employeeId
      ) {
        const target =
          await this.prisma.employee.findUnique({
            where: {
              id: employeeId,
            },
            select: {
              managerId: true,
            },
          });

        if (
          !actor.roles.includes("MANAGER") ||
          target?.managerId !== actor.employeeId
        ) {
          throw new BadRequestException(
            "You are not allowed to view this attendance report",
          );
        }
      }
    }

    const start = new Date(
      year,
      month - 1,
      1,
    );

    const end = new Date(
      year,
      month,
      0,
      23,
      59,
      59,
    );

    return this.prisma.workDay.findMany({
      where: {
        employeeId,
        date: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        date: "asc",
      },
    });
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
