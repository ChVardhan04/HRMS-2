import { Injectable, Logger } from "@nestjs/common";
import { GroupMonitorService } from "./group-monitor.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationCategory } from "../notifications/notification-category.enum";
import { PrismaService } from "../prisma/prisma.service";

/** "Group check reminder — daily 10 AM" from plan section 12.2. */
@Injectable()
export class GroupMonitorSchedulerService {
  private readonly logger = new Logger(GroupMonitorSchedulerService.name);

  constructor(
    private groupMonitorService: GroupMonitorService,
    private notifications: NotificationsService,
    private prisma: PrismaService,
  ) {}

  async runCheckReminderSweep() {
    const pending = await this.groupMonitorService.pendingChecksToday();

    const hrUsers = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: { name: "HR_ADMIN" } } },
        isActive: true,
      },
    });

    for (const hrUser of hrUsers) {
      if (pending.length === 0) continue;
      await this.notifications.notify({
        userId: hrUser.id,
        title: `${pending.length} group(s) pending check`,
        body: `Groups not yet checked today: ${pending.map((g) => g.name).join(", ")}`,
        category: NotificationCategory.GROUP_CHECK,
        emailAlso: true,
        recipientEmail: hrUser.email,
      });
    }

    this.logger.log(
      `Group check reminder: ${pending.length} group(s) pending.`,
    );
    return { pending: pending.length };
  }
}
