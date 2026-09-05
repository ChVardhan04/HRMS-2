import { Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { NotificationsService } from "./notifications.service";
import { BirthdaySchedulerService } from "./jobs/birthday-scheduler.service";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";

@Controller("notifications")
export class NotificationsController {
  constructor(private notificationsService: NotificationsService, private birthdayScheduler: BirthdaySchedulerService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("unreadOnly") unreadOnly?: string,
  ) {
    return this.notificationsService.listForUser(
      user.userId,
      unreadOnly === "true",
    );
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("birthday-sweep")
  birthdaySweep() {
    return this.birthdayScheduler.runBirthdaySweep();
  }

  @Patch(":id/read")
  markRead(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.notificationsService.markRead(user.userId, id);
  }
}
