import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
import { StrikesService } from "./strikes.service";

@Controller("strikes")
export class StrikesController {
  constructor(private strikesService: StrikesService) {}

  @Roles(RoleName.HR_ADMIN, RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @Get("dashboard")
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.strikesService.dashboardStatus(user.employeeId!, user.roles);
  }

  @Get("me")
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.strikesService.listForEmployee(user.employeeId!);
  }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("employee/:employeeId")
  forEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
  ) {
    return this.strikesService.listForEmployee(
      employeeId,
      user.employeeId!,
      user.roles,
    );
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post(":strikeId/pip-task")
  createPip(
    @CurrentUser() user: AuthenticatedUser,
    @Param("strikeId") strikeId: string,
    @Body("employeeId") employeeId: string,
  ) {
    return this.strikesService.createPipTask(
      employeeId,
      user.employeeId!,
      strikeId,
    );
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":strikeId/resolve")
  resolve(@Param("strikeId") strikeId: string) {
    return this.strikesService.resolve(strikeId);
  }
}
