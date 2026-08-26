import { Controller, Get, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { buildXlsx } from "./xlsx.util";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { ReportsService } from "./reports.service";

@Controller("reports")
@Roles(RoleName.HR_ADMIN, RoleName.LEADERSHIP, RoleName.SUPER_ADMIN)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get("employees")
  employees() {
    return this.reportsService.employeeReport();
  }

  @Get("pay-attendance")
  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  payAttendance(@Query("month") month: string, @Query("year") year: string) {
    const now = new Date();
    return this.reportsService.payAttendanceReport(
      Number(month) || now.getMonth() + 1,
      Number(year) || now.getFullYear(),
    );
  }

  @Get("attendance")
  attendance(@Query("month") month: string, @Query("year") year: string) {
    const now = new Date();
    return this.reportsService.attendanceReport(
      Number(month) || now.getMonth() + 1,
      Number(year) || now.getFullYear(),
    );
  }

  @Get("leave")
  leave(@Query("year") year: string) {
    return this.reportsService.leaveReport(
      Number(year) || new Date().getFullYear(),
    );
  }

  @Get("dpr-compliance")
  dprCompliance(@Query("month") month: string, @Query("year") year: string) {
    const now = new Date();
    return this.reportsService.dprComplianceReport(
      Number(month) || now.getMonth() + 1,
      Number(year) || now.getFullYear(),
    );
  }

  @Get("hiring-funnel")
  hiringFunnel() {
    return this.reportsService.hiringFunnelReport();
  }

  @Get("stale-candidates-count")
  staleCandidatesCount() {
    return this.reportsService.staleCandidatesCount();
  }

  @Get("group-compliance")
  groupCompliance() {
    return this.reportsService.groupComplianceReport();
  }

  @Get("month-end.xlsx")
  async monthEndXlsx(
    @Query("month") month: string,
    @Query("year") year: string,
    @Res() res: Response,
  ) {
    const now = new Date();
    const report = await this.reportsService.monthEndKraReport(
      Number(month) || now.getMonth() + 1,
      Number(year) || now.getFullYear(),
    );
    const attendanceRows = [
      [
        "Employee",
        "Code",
        "Working Days",
        "Present",
        "WFH",
        "Paid Leave",
        "Unpaid Leave",
        "Half Day",
        "Absent",
        "Late",
        "Hours",
        "Payable Days",
        "Attendance %",
        "Payable Amount",
      ],
      ...report.attendanceCompliance.map((r: any) => [
        `${r.employee.firstName} ${r.employee.lastName}`,
        r.employee.employeeCode,
        r.workingDays,
        r.present,
        r.wfh,
        r.paidLeave,
        r.unpaidLeave,
        r.halfDay,
        r.absent,
        r.late,
        r.workingHours,
        r.payableDays,
        r.attendanceRate,
        r.payableAmount ?? "Not configured",
      ]),
    ];
    const sheets = [
      {
        name: "Summary",
        rows: [
          ["Metric", "Value"],
          ["Period", `${report.period.month}/${report.period.year}`],
          ["DPR compliance", report.dprCompliance.complianceRate],
          ["Expected DPRs", report.dprCompliance.expectedDprs],
          ["Submitted DPRs", report.dprCompliance.submitted],
          ["Missing DPRs", report.dprCompliance.missing],
        ],
      },
      {
        name: "Team KRA",
        rows: [
          ["Team", "Average Score", "Headcount"],
          ...report.teamWiseSummary.map((r: any) => [
            r.team,
            r.averageScore,
            r.headcount,
          ]),
        ],
      },
      {
        name: "Top Performers",
        rows: [
          ["Employee", "Code", "Score"],
          ...report.topPerformers.map((r: any) => [
            `${r.employee.firstName} ${r.employee.lastName}`,
            r.employee.employeeCode,
            Number(r.finalScore),
          ]),
        ],
      },
      {
        name: "Bottom Performers",
        rows: [
          ["Employee", "Code", "Score"],
          ...report.bottomPerformers.map((r: any) => [
            `${r.employee.firstName} ${r.employee.lastName}`,
            r.employee.employeeCode,
            Number(r.finalScore),
          ]),
        ],
      },
      {
        name: "Strikes",
        rows: [
          ["Employee", "Code", "Reason", "Issued At", "Status"],
          ...report.strikeHistory.map((r: any) => [
            `${r.employee.firstName} ${r.employee.lastName}`,
            r.employee.employeeCode,
            r.reason,
            r.issuedAt,
            r.status,
          ]),
        ],
      },
      { name: "Attendance", rows: attendanceRows },
      {
        name: "Hiring Funnel",
        rows: [
          ["Stage", "Count"],
          ...report.hiringFunnel.map((r: any) => [r.stage, r.count]),
        ],
      },
      {
        name: "Group Checks",
        rows: [
          ["Group", "Checks Last 30 Days", "Last Checked", "Escalations"],
          ...report.groupCompliance.map((r: any) => [
            r.group,
            r.checksLast30,
            r.lastChecked ?? "",
            r.escalations,
          ]),
        ],
      },
    ];
    const buffer = buildXlsx(sheets);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="hrms-month-end-${report.period.year}-${String(report.period.month).padStart(2, "0")}.xlsx"`,
    );
    res.send(buffer);
  }

  @Get("month-end")
  monthEnd(@Query("month") month: string, @Query("year") year: string) {
    const now = new Date();
    return this.reportsService.monthEndKraReport(
      Number(month) || now.getMonth() + 1,
      Number(year) || now.getFullYear(),
    );
  }
}
