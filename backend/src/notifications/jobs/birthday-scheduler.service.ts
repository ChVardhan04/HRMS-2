import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications.service";
import { NotificationCategory } from "../notification-category.enum";

@Injectable()
export class BirthdaySchedulerService {
  private readonly logger = new Logger(BirthdaySchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private localDateParts(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    return {
      year: Number(parts.find((p) => p.type === "year")?.value),
      month: Number(parts.find((p) => p.type === "month")?.value),
      day: Number(parts.find((p) => p.type === "day")?.value),
    };
  }

  async runBirthdaySweep(date = new Date()) {
    const organization = await this.prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { timezone: true },
    });
    const timezone = organization?.timezone ?? "Asia/Kolkata";
    const local = this.localDateParts(date, timezone);

    const employees = await this.prisma.employee.findMany({
      where: {
        dateOfBirth: { not: null },
        deletedAt: null,
        employmentStatus: { not: "EXITED" },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userId: true,
        user: { select: { email: true, isActive: true } },
        dateOfBirth: true,
      },
    });

    const birthdayEmployees = employees.filter((employee) => {
      if (!employee.dateOfBirth || !employee.user.isActive) return false;
      const birth = this.localDateParts(employee.dateOfBirth, timezone);
      return birth.month === local.month && birth.day === local.day;
    });

    const hrUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { role: { name: { in: ["HR_ADMIN", "SUPER_ADMIN"] } } } },
      },
      select: { id: true },
    });

    let employeesNotified = 0;
    let hrReminders = 0;
    let duplicates = 0;

    for (const employee of birthdayEmployees) {
      try {
        await this.prisma.birthdayNotificationLog.create({
          data: { employeeId: employee.id, year: local.year },
        });
      } catch (error: any) {
        if (error?.code === "P2002") {
          duplicates++;
          continue;
        }
        throw error;
      }

      const name = `${employee.firstName} ${employee.lastName}`.trim();
      await this.notifications.notify({
        userId: employee.userId,
        title: "Happy Birthday! 🎉",
        body: `Happy Birthday, ${name}! Wishing you a wonderful day and a successful year ahead.`,
        category: NotificationCategory.BIRTHDAY,
        metadata: { type: "employee-birthday", employeeId: employee.id, year: local.year },
        emailAlso: false,
      });
      employeesNotified++;

      for (const hr of hrUsers) {
        await this.notifications.notify({
          userId: hr.id,
          title: `Employee birthday today: ${name}`,
          body: `${name} has a birthday today. Please wish them a happy birthday.`,
          category: NotificationCategory.BIRTHDAY,
          metadata: { type: "hr-birthday-reminder", employeeId: employee.id, year: local.year },
          emailAlso: false,
        });
        hrReminders++;
      }
    }

    this.logger.log(`Birthday sweep complete: ${employeesNotified} employee wish(es), ${hrReminders} HR reminder(s), ${duplicates} duplicate(s) suppressed.`);
    return { date: `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`, matched: birthdayEmployees.length, employeesNotified, hrReminders, duplicates };
  }
}
