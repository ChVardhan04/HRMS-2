import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";

@Controller("notifications")
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

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

  @Patch(":id/read")
  markRead(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.notificationsService.markRead(user.userId, id);
  }
}
