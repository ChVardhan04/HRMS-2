import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { RoleName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";
import { NotificationCategory } from "./notification-category.enum";

@Injectable()
export class BirthdaySchedulerService {
  private readonly logger = new Logger(BirthdaySchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private localParts(date: Date, timezone: string) {
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

  private async alreadySent(userId: string, employeeId: string, year: number) {
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId,
        category: NotificationCategory.BIRTHDAY,
        metadata: { path: ["birthdayEmployeeId"], equals: employeeId },
        createdAt: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  @Cron("0 30 8 * * *", { timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata" })
  async sendBirthdayWishes() {
    const org = await this.prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    const timezone = org?.timezone || process.env.APP_TIMEZONE || "Asia/Kolkata";
    const today = this.localParts(new Date(), timezone);

    const employees = await this.prisma.employee.findMany({
      where: { dateOfBirth: { not: null }, deletedAt: null, employmentStatus: { not: "EXITED" } },
      include: { user: true },
    });
    const birthdayEmployees = employees.filter((e) => {
      if (!e.dateOfBirth) return false;
      const dob = this.localParts(e.dateOfBirth, "UTC");
      return dob.month === today.month && dob.day === today.day;
    });

    if (!birthdayEmployees.length) return { birthdays: 0, notifications: 0 };

    const hrUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { role: { name: { in: [RoleName.HR_ADMIN, RoleName.SUPER_ADMIN] } } } },
      },
      select: { id: true, email: true },
    });

    let notifications = 0;
    for (const employee of birthdayEmployees) {
      const fullName = `${employee.firstName} ${employee.lastName}`.trim();
      if (!(await this.alreadySent(employee.userId, employee.id, today.year))) {
        await this.notifications.notify({
          userId: employee.userId,
          title: "Happy Birthday! 🎉",
          body: `Wishing you a very happy birthday, ${employee.firstName}! Have a wonderful year ahead.`,
          category: NotificationCategory.BIRTHDAY,
          metadata: { birthdayEmployeeId: employee.id, birthdayYear: today.year },
        });
        notifications++;
      }

      for (const hr of hrUsers) {
        if (hr.id === employee.userId) continue;
        if (await this.alreadySent(hr.id, employee.id, today.year)) continue;
        await this.notifications.notify({
          userId: hr.id,
          title: `Employee birthday: ${fullName}`,
          body: `Today is ${fullName}'s birthday. You may wish to send birthday greetings.`,
          category: NotificationCategory.BIRTHDAY,
          metadata: { birthdayEmployeeId: employee.id, birthdayYear: today.year },
        });
        notifications++;
      }
    }

    this.logger.log(`Birthday sweep: ${birthdayEmployees.length} birthday(s), ${notifications} notification(s) sent.`);
    return { birthdays: birthdayEmployees.length, notifications };
  }
}
