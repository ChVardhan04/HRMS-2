import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
import { KraService } from "./kra.service";

@Controller("kra")
export class KraController {
  constructor(private kraService: KraService) {}

  @Get("me")
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.kraService.myScores(user.employeeId!);
  }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("team")
  team(
    @CurrentUser() user: AuthenticatedUser,
    @Query("month") month: string,
    @Query("year") year: string,
  ) {
    const now = new Date();
    return this.kraService.teamScores(
      user.employeeId!,
      Number(month) || now.getMonth() + 1,
      Number(year) || now.getFullYear(),
      user.roles,
    );
  }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("employee/:employeeId/manual-score")
  manualScore(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
    @Body("itemName") itemName: string,
    @Body("month") month: number,
    @Body("year") year: number,
    @Body("score") score: number,
  ) {
    return this.kraService.setManualScore(
      employeeId,
      itemName,
      month,
      year,
      score,
      user.employeeId!,
      user.roles,
    );
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("employee/:employeeId/recalculate")
  recalculate(
    @Param("employeeId") employeeId: string,
    @Body("month") month: number,
    @Body("year") year: number,
  ) {
    return this.kraService.calculateForEmployee(employeeId, month, year);
  }
}
