import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Implements "Leave accrual — 1st of month — update balances" from plan section 12.2. */
@Injectable()
export class LeaveSchedulerService {
  private readonly logger = new Logger(LeaveSchedulerService.name);

  constructor(private prisma: PrismaService) {}

  async runMonthlyAccrual() {
    const year = new Date().getFullYear();
    const leaveTypes = await this.prisma.leaveType.findMany({
      where: { accrualPerMonth: { gt: 0 } },
    });
    const employees = await this.prisma.employee.findMany({
      where: { employmentStatus: { not: "EXITED" } },
    });

    let updates = 0;
    const monthStart = new Date(year, new Date().getMonth(), 1);
    for (const employee of employees) {
      for (const leaveType of leaveTypes) {
        const existing = await this.prisma.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: employee.id,
              leaveTypeId: leaveType.id,
              year,
            },
          },
        });
        if (existing?.lastAccruedAt && existing.lastAccruedAt >= monthStart)
          continue;
        await this.prisma.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: employee.id,
              leaveTypeId: leaveType.id,
              year,
            },
          },
          create: {
            employeeId: employee.id,
            leaveTypeId: leaveType.id,
            year,
            accrued: leaveType.accrualPerMonth,
            lastAccruedAt: new Date(),
          },
          update: {
            accrued: { increment: leaveType.accrualPerMonth },
            lastAccruedAt: new Date(),
          },
        });
        updates += 1;
      }
    }
    this.logger.log(`Leave accrual applied ${updates} balance update(s).`);
    return { updates };
  }
}
