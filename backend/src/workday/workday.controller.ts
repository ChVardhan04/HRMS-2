import { Controller, Get, Param, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { WorkdayService } from "./workday.service";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";

@Controller("work-days")
export class WorkdayController {
  constructor(private workdayService: WorkdayService) {}

  @Get("today")
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.workdayService.findForEmployeeDate(
      user.employeeId!,
      new Date(),
    );
  }

  @Get("team-today")
  teamToday(@CurrentUser() user: AuthenticatedUser) {
    return this.workdayService.teamToday(user.employeeId!, user.roles);
  }

  @Get("history/me")
  historyMe(
    @CurrentUser() user: AuthenticatedUser,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.workdayService.history(
      user.employeeId!,
      fromDate,
      toDate,
      user,
    );
  }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("history/:employeeId")
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.workdayService.history(employeeId, fromDate, toDate, user);
  }
}
