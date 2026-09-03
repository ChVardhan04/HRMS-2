import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Keeps department-controlled annual/monthly leave entitlements synchronized without double-accrual. */
@Injectable()
export class LeaveSchedulerService {
  private readonly logger = new Logger(LeaveSchedulerService.name);
  constructor(private prisma: PrismaService) {}

  async runMonthlyAccrual() {
    const now = new Date();
    const year = now.getFullYear();
    const monthStart = new Date(year, now.getMonth(), 1);
    const employees = await this.prisma.employee.findMany({
      where: { employmentStatus: { not: "EXITED" }, deletedAt: null },
      select: { id: true, departmentId: true },
    });
    let updates = 0;
    for (const employee of employees) {
      if (!employee.departmentId) continue;
      const policies = await this.prisma.departmentLeavePolicy.findMany({
        where: { departmentId: employee.departmentId, active: true, requiresBalance: true },
        include: { leaveType: true },
      });
      for (const policy of policies) {
        const existing = await this.prisma.leaveBalance.findUnique({
          where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: policy.leaveTypeId, year } },
        });
        if (!existing) {
          await this.prisma.leaveBalance.create({
            data: { employeeId: employee.id, leaveTypeId: policy.leaveTypeId, year, accrued: Number(policy.annualEntitlement), lastAccruedAt: now },
          });
          updates++;
          continue;
        }
        if (policy.monthlyEntitlement != null && (!existing.lastAccruedAt || existing.lastAccruedAt < monthStart)) {
          const next = Math.min(Number(policy.annualEntitlement), Number(existing.accrued) + Number(policy.monthlyEntitlement));
          await this.prisma.leaveBalance.update({ where: { id: existing.id }, data: { accrued: next, lastAccruedAt: now } });
          updates++;
        }
      }
    }
    this.logger.log(`Leave entitlement synchronization applied ${updates} update(s).`);
    return { updates };
  }
}
