import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CalendarService } from "../calendar/calendar.service";

/** Plan section 8.5 / 35: HR reports + the auto-generated month-end KRA report, no manual Excel assembly. */
@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
  ) {}

  async employeeReport() {
    return this.prisma.employee.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        phone: true,
        dateOfJoining: true,
        employmentType: true,
        employmentStatus: true,
        location: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
        manager: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async attendanceReport(month: number, year: number) {
    const calendar = await this.calendarService.workingDaySummary(month, year);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null },
      include: {
        department: true,
        designation: true,
        manager: { select: { firstName: true, lastName: true } },
      },
      orderBy: { firstName: "asc" },
    });
    const workDays = await this.prisma.workDay.findMany({
      where: { date: { gte: start, lt: end } },
    });
    const approvedLeaves = await this.prisma.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lt: end },
        endDate: { gte: start },
      },
      include: { leaveType: true },
    });
    const leaveByKey = new Map<string, boolean>();
    for (const leave of approvedLeaves) {
      for (
        let d = new Date(leave.startDate);
        d <= leave.endDate;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        leaveByKey.set(
          `${leave.employeeId}:${d.toISOString().slice(0, 10)}`,
          leave.leaveType.isPaid,
        );
      }
    }
    const byKey = new Map(
      workDays.map((w) => [
        `${w.employeeId}:${w.date.toISOString().slice(0, 10)}`,
        w,
      ]),
    );
    const isActiveOn = (employee: any, dateKey: string) => {
      const doj = employee.dateOfJoining.toISOString().slice(0, 10);
      const exit = employee.exitDate
        ? employee.exitDate.toISOString().slice(0, 10)
        : null;
      return dateKey >= doj && (!exit || dateKey <= exit);
    };

    return employees.map((employee) => {
      const activeDays = calendar.days.filter((d: any) =>
        isActiveOn(employee, d.date),
      );
      const workingDays = activeDays.filter((d: any) => d.working);
      const counts = {
        present: 0,
        late: 0,
        absent: 0,
        halfDay: 0,
        leave: 0,
        paidLeave: 0,
        unpaidLeave: 0,
        wfh: 0,
        holiday: 0,
        weekend: 0,
        workingHours: 0,
      };
      for (const day of activeDays) {
        if (!day.working) {
          if (day.type === "HOLIDAY") counts.holiday++;
          else counts.weekend++;
          continue;
        }
        const wd: any = byKey.get(`${employee.id}:${day.date}`);
        if (!wd || wd.attendanceStatus === "ABSENT") counts.absent++;
        else if (wd.attendanceStatus === "HALF_DAY") counts.halfDay++;
        else if (wd.attendanceStatus === "ON_LEAVE") {
          counts.leave++;
          if (leaveByKey.get(`${employee.id}:${day.date}`)) counts.paidLeave++;
          else counts.unpaidLeave++;
        } else if (wd.attendanceStatus === "WORK_FROM_HOME") {
          counts.wfh++;
        } else {
          counts.present++;
          if (wd.attendanceStatus === "LATE") counts.late++;
        }
        if (wd?.workingHours) counts.workingHours += Number(wd.workingHours);
      }
      const payableDays = Math.max(
        0,
        counts.present + counts.wfh + counts.paidLeave + counts.halfDay * 0.5,
      );
      const attendanceRate = workingDays.length
        ? Number(
            (
              ((counts.present +
                counts.wfh +
                counts.paidLeave +
                counts.halfDay * 0.5) /
                workingDays.length) *
              100
            ).toFixed(1),
          )
        : 100;
      return {
        employee: {
          id: employee.id,
          employeeCode: employee.employeeCode,
          firstName: employee.firstName,
          lastName: employee.lastName,
          department: employee.department?.name ?? null,
          designation: employee.designation?.title ?? null,
        },
        workingDays: workingDays.length,
        ...counts,
        payableDays: Number(payableDays.toFixed(1)),
        attendanceRate,
        monthlySalary: employee.monthlySalary
          ? Number(employee.monthlySalary)
          : null,
        salaryCurrency: employee.salaryCurrency,
        payableAmount:
          employee.monthlySalary && workingDays.length
            ? Number(
                (
                  (Number(employee.monthlySalary) * payableDays) /
                  workingDays.length
                ).toFixed(2),
              )
            : null,
      };
    });
  }

  async payAttendanceReport(month: number, year: number) {
    const rows = await this.attendanceReport(month, year);
    return { month, year, rows, generatedAt: new Date().toISOString() };
  }

  async leaveReport(year: number) {
    return this.prisma.leaveRequest.findMany({
      where: {
        startDate: { lt: new Date(year + 1, 0, 1) },
        endDate: { gte: new Date(year, 0, 1) },
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        leaveType: true,
      },
    });
  }

  async dprComplianceReport(month: number, year: number) {
    const calendar = await this.calendarService.workingDaySummary(month, year);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null },
      select: { id: true, dateOfJoining: true, exitDate: true },
    });
    const workDays = await this.prisma.workDay.findMany({
      where: { date: { gte: start, lt: end } },
    });
    const approvedLeaves = await this.prisma.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lt: end },
        endDate: { gte: start },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    });
    const leaveDates = new Set<string>();
    for (const leave of approvedLeaves) {
      for (
        let d = new Date(leave.startDate);
        d <= leave.endDate;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        leaveDates.add(`${leave.employeeId}:${d.toISOString().slice(0, 10)}`);
      }
    }
    const workingDateKeys = new Set(
      calendar.days.filter((d: any) => d.working).map((d: any) => d.date),
    );
    const expected = employees.reduce(
      (sum, employee) =>
        sum +
        calendar.days.filter(
          (d: any) =>
            d.working &&
            d.date >= employee.dateOfJoining.toISOString().slice(0, 10) &&
            (!employee.exitDate ||
              d.date <= employee.exitDate.toISOString().slice(0, 10)) &&
            !leaveDates.has(`${employee.id}:${d.date}`),
        ).length,
      0,
    );
    const submitted = workDays.filter(
      (w) =>
        workingDateKeys.has(w.date.toISOString().slice(0, 10)) &&
        !leaveDates.has(
          `${w.employeeId}:${w.date.toISOString().slice(0, 10)}`,
        ) &&
        ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(w.dprStatus),
    ).length;
    return {
      totalWorkingDays: calendar.workingDays,
      expectedDprs: expected,
      submitted,
      missing: Math.max(0, expected - submitted),
      complianceRate: expected
        ? Number(((submitted / expected) * 100).toFixed(1))
        : 100,
    };
  }

  async staleCandidatesCount() {
    return {
      count: await this.prisma.candidate.count({ where: { isStale: true } }),
    };
  }

  async hiringFunnelReport() {
    const stages = [
      "SOURCED",
      "APPLIED",
      "RESUME_SCREEN",
      "HR_SCREEN",
      "TECHNICAL_ROUND",
      "MANAGER_ROUND",
      "OFFER",
      "JOINED",
      "REJECTED",
    ];
    const counts = await Promise.all(
      stages.map(async (stage) => ({
        stage,
        count: await this.prisma.candidate.count({
          where: { currentStage: stage as any },
        }),
      })),
    );
    return counts;
  }

  async groupComplianceReport() {
    const groups = await this.prisma.communicationGroup.findMany({
      where: { isActive: true },
      include: { checkLogs: { orderBy: { checkedAt: "desc" }, take: 30 } },
    });
    return groups.map((g) => ({
      group: g.name,
      checksLast30: g.checkLogs.length,
      lastChecked: g.checkLogs[0]?.checkedAt ?? null,
      escalations: g.checkLogs.filter((c) => c.escalated).length,
    }));
  }

  /** The single deliverable HR opens on the last working day (plan 8.5): everything assembled, nothing manual. */
  async monthEndKraReport(month: number, year: number) {
    const [
      scores,
      strikes,
      attendance,
      dprCompliance,
      hiringFunnel,
      groupCompliance,
    ] = await Promise.all([
      this.prisma.kRAScore.findMany({
        where: { periodMonth: month, periodYear: year },
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              employeeCode: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { finalScore: "desc" },
      }),
      this.prisma.strike.findMany({
        where: {
          issuedAt: {
            gte: new Date(year, month - 1, 1),
            lte: new Date(year, month, 0, 23, 59, 59),
          },
        },
        include: {
          employee: {
            select: { firstName: true, lastName: true, employeeCode: true },
          },
        },
      }),
      this.attendanceReport(month, year),
      this.dprComplianceReport(month, year),
      this.hiringFunnelReport(),
      this.groupComplianceReport(),
    ]);

    const byTeam = new Map<string, { team: string; scores: number[] }>();
    for (const score of scores) {
      const team = score.employee.department?.name ?? "Unassigned";
      if (!byTeam.has(team)) byTeam.set(team, { team, scores: [] });
      byTeam.get(team)!.scores.push(Number(score.finalScore));
    }
    const teamWiseSummary = Array.from(byTeam.values()).map((t) => ({
      team: t.team,
      averageScore: Number(
        (t.scores.reduce((a, b) => a + b, 0) / t.scores.length).toFixed(1),
      ),
      headcount: t.scores.length,
    }));

    return {
      period: { month, year },
      teamWiseSummary,
      topPerformers: scores.slice(0, 5),
      bottomPerformers: [...scores].reverse().slice(0, 5),
      strikeHistory: strikes,
      attendanceCompliance: attendance,
      dprCompliance,
      hiringFunnel,
      groupCompliance,
      generatedAt: new Date().toISOString(),
    };
  }
}
