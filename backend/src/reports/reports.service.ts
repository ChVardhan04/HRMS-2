import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CalendarService } from "../calendar/calendar.service";

/** Plan section 8.5 / 35: HR reports + the auto-generated month-end KRA report, no manual Excel assembly. */
@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
  ) {}

  async leadershipSummary(month?: number, year?: number) {
    const now = new Date();
    const m = month && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
    const y = year || now.getFullYear();
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const [activeEmployees, presentToday, absentToday, leaveToday, pendingLeaves, kraScores, activeStrikes, departments, openJobs, candidates] = await Promise.all([
      this.prisma.employee.count({ where: { deletedAt: null, employmentStatus: { not: "EXITED" } } }),
      this.prisma.workDay.count({ where: { date: { gte: todayStart, lt: todayEnd }, attendanceStatus: { in: ["PRESENT", "LATE", "HALF_DAY", "WORK_FROM_HOME"] }, employee: { deletedAt: null, employmentStatus: { not: "EXITED" } } } }),
      this.prisma.workDay.count({ where: { date: { gte: todayStart, lt: todayEnd }, attendanceStatus: "ABSENT", employee: { deletedAt: null, employmentStatus: { not: "EXITED" } } } }),
      this.prisma.workDay.count({ where: { date: { gte: todayStart, lt: todayEnd }, attendanceStatus: "ON_LEAVE", employee: { deletedAt: null, employmentStatus: { not: "EXITED" } } } }),
      this.prisma.leaveRequest.count({ where: { status: { in: ["PENDING", "MANAGER_APPROVED"] }, employee: { deletedAt: null, employmentStatus: { not: "EXITED" } } } }),
      this.prisma.kRAScore.findMany({ where: { periodMonth: m, periodYear: y, employee: { deletedAt: null, employmentStatus: { not: "EXITED" } } }, select: { finalScore: true } }),
      this.prisma.strike.count({ where: { status: "ACTIVE", employee: { deletedAt: null, employmentStatus: { not: "EXITED" } } } }),
      this.prisma.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.jobRequisition.count({ where: { status: "OPEN" } }),
      this.prisma.candidate.count(),
    ]);

    const departmentSummary = await Promise.all(departments.map(async (department) => {
      const [headcount, scores] = await Promise.all([
        this.prisma.employee.count({ where: { departmentId: department.id, deletedAt: null, employmentStatus: { not: "EXITED" } } }),
        this.prisma.kRAScore.findMany({ where: { employee: { departmentId: department.id, deletedAt: null, employmentStatus: { not: "EXITED" } }, periodMonth: m, periodYear: y }, select: { finalScore: true } }),
      ]);
      return {
        id: department.id,
        name: department.name,
        headcount,
        averageKra: scores.length ? Number((scores.reduce((sum, score) => sum + Number(score.finalScore), 0) / scores.length).toFixed(1)) : null,
      };
    }));

    return {
      period: { month: m, year: y },
      headcount: activeEmployees,
      attendance: { present: presentToday, absent: absentToday, onLeave: leaveToday },
      pendingLeaves,
      averageKra: kraScores.length ? Number((kraScores.reduce((sum, score) => sum + Number(score.finalScore), 0) / kraScores.length).toFixed(1)) : null,
      activeStrikes,
      openJobs,
      candidates,
      departments: departmentSummary,
    };
  }

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

  async dailyActivity(dateKey: string, employeeId?: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new BadRequestException("Date must be in YYYY-MM-DD format");
    }
    const start = new Date(`${dateKey}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 86400000);

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { not: "EXITED" },
        ...(employeeId ? { id: employeeId } : {}),
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    const [workDays, approvedLeaves] = await Promise.all([
      this.prisma.workDay.findMany({
        where: { employeeId: { in: employees.map((e) => e.id) }, date: { gte: start, lt: end } },
        include: {
          attendanceRecords: true,
          todos: { orderBy: { createdAt: "asc" } },
          dpr: { include: { entries: { include: { todo: true }, orderBy: { createdAt: "asc" } } } },
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: { employeeId: { in: employees.map((e) => e.id) }, status: "APPROVED", startDate: { lt: end }, endDate: { gte: start } },
      }),
    ]);
    const byEmployee = new Map(workDays.map((w) => [w.employeeId, w]));
    const onLeave = new Set(approvedLeaves.map((leave) => leave.employeeId));
    const calendarStates = new Map(
      await Promise.all(
        employees.map(async (employee) => [
          employee.id,
          await this.calendarService.isWorkingDayForEmployee(employee.id, start),
        ] as const),
      ),
    );

    return {
      date: dateKey,
      rows: employees.map((employee) => {
        const workDay: any = byEmployee.get(employee.id);
        const calendarState: any = calendarStates.get(employee.id);
        const inferredStatus = !calendarState?.working
          ? calendarState?.type === "HOLIDAY" ? "HOLIDAY" : "WEEKEND"
          : onLeave.has(employee.id) ? "ON_LEAVE" : "ABSENT";
        const tasks = workDay?.todos ?? [];
        const resolvedTasks = tasks.filter((t: any) => t.eodStatus !== "PENDING");
        const aiValues = tasks
          .filter((t: any) => t.aiCompletionPercent != null)
          .map((t: any) => Number(t.aiCompletionPercent));
        return {
          employee,
          workDayId: workDay?.id ?? null,
          attendance: workDay
            ? {
                status: workDay.attendanceStatus,
                checkInAt: workDay.checkInAt,
                checkOutAt: workDay.checkOutAt,
                workingHours: workDay.workingHours,
                isLate: workDay.isLate,
                isEarlyDeparture: workDay.isEarlyDeparture,
              }
            : {
                status: inferredStatus,
                checkInAt: null,
                checkOutAt: null,
                workingHours: null,
                isLate: false,
                isEarlyDeparture: false,
              },
          dpr: workDay?.dpr
            ? {
                id: workDay.dpr.id,
                status: workDay.dpr.status,
                submittedAt: workDay.dpr.submittedAt,
                reviewedAt: workDay.dpr.reviewedAt,
                reviewComment: workDay.dpr.reviewComment,
                qualityScore: workDay.dpr.qualityScore,
                aiCompletionPercent: aiValues.length
                  ? Number((aiValues.reduce((a, b) => a + b, 0) / aiValues.length).toFixed(1))
                  : null,
                entries: workDay.dpr.entries,
              }
            : null,
          tasks: {
            total: tasks.length,
            resolved: resolvedTasks.length,
            pending: tasks.length - resolvedTasks.length,
            items: tasks,
          },
          attendanceRecords: workDay?.attendanceRecords ?? [],
        };
      }),
    };
  }

  async dailyAttendance(month: number, year: number, employeeId?: string) {
    const calendar = await this.calendarService.workingDaySummary(month, year);
    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { not: "EXITED" },
        ...(employeeId ? { id: employeeId } : {}),
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        dateOfJoining: true,
        exitDate: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const workDays = await this.prisma.workDay.findMany({
      where: { employeeId: { in: employees.map((e) => e.id) }, date: { gte: start, lt: end } },
      include: { dpr: true, todos: true },
    });
    const leaves = await this.prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lt: end }, endDate: { gte: start }, employeeId: { in: employees.map((e) => e.id) } },
      include: { leaveType: true },
    });
    const leaveByKey = new Map<string, boolean>();
    for (const leave of leaves) {
      for (let d = new Date(leave.startDate); d <= leave.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        leaveByKey.set(`${leave.employeeId}:${d.toISOString().slice(0, 10)}`, leave.leaveType.isPaid);
      }
    }
    const workDayByKey = new Map(workDays.map((w) => [`${w.employeeId}:${w.date.toISOString().slice(0, 10)}`, w]));
    const rows: any[] = [];
    for (const employee of employees) {
      for (const day of calendar.days as any[]) {
        const key = day.date as string;
        const doj = employee.dateOfJoining.toISOString().slice(0, 10);
        const exit = employee.exitDate ? employee.exitDate.toISOString().slice(0, 10) : null;
        if (key < doj || (exit && key > exit)) continue;
        const wd: any = workDayByKey.get(`${employee.id}:${key}`);
        const leave = leaveByKey.get(`${employee.id}:${key}`);
        const status = !day.working
          ? day.type === "HOLIDAY" ? "HOLIDAY" : "WEEKEND"
          : leave != null
            ? "ON_LEAVE"
            : wd?.attendanceStatus ?? "ABSENT";
        rows.push({
          date: key,
          employee: {
            id: employee.id,
            employeeCode: employee.employeeCode,
            firstName: employee.firstName,
            lastName: employee.lastName,
            department: employee.department?.name ?? null,
            designation: employee.designation?.title ?? null,
          },
          status,
          leavePaid: leave ?? null,
          checkInAt: wd?.checkInAt ?? null,
          checkOutAt: wd?.checkOutAt ?? null,
          workingHours: wd?.workingHours ?? null,
          isLate: wd?.isLate ?? false,
          isEarlyDeparture: wd?.isEarlyDeparture ?? false,
          dprStatus: wd?.dpr?.status ?? (day.working && leave == null ? "DRAFT" : "APPROVED"),
          dprSubmittedAt: wd?.dpr?.submittedAt ?? null,
          todoTotal: wd?.todos?.length ?? 0,
          todoResolved: wd?.todos?.filter((t: any) => t.eodStatus !== "PENDING").length ?? 0,
          todoPending: wd?.todos?.filter((t: any) => t.eodStatus === "PENDING").length ?? 0,
        });
      }
    }
    return { month, year, rows };
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
