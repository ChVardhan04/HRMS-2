import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
import { DprService } from "./dpr.service";
import { ReviewDprDto, SaveDprDraftDto, UnlockDprDto } from "./dto/dpr.dto";

@Controller("dpr")
export class DprController {
  constructor(private dprService: DprService) {}

  @Get("work-day/:workDayId")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workDayId") workDayId: string,
  ) {
    return this.dprService.getForWorkDay(
      workDayId,
      user.employeeId!,
      user.roles,
    );
  }

  @Patch("work-day/:workDayId/draft")
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workDayId") workDayId: string,
    @Body() dto: SaveDprDraftDto,
  ) {
    return this.dprService.saveDraft(workDayId, user.employeeId!, dto);
  }

  @Post("work-day/:workDayId/submit")
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workDayId") workDayId: string,
  ) {
    return this.dprService.submit(workDayId, user.employeeId!);
  }

  @Roles(RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @Get("pending-review")
  pendingReview(@CurrentUser() user: AuthenticatedUser) {
    return this.dprService.pendingForManager(user.employeeId!);
  }

  @Roles(RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @Get("team-status")
  teamStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.dprService.teamStatus(user.employeeId!);
  }

  @Roles(RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @Patch(":dprId/approve")
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("dprId") dprId: string,
    @Body() dto: ReviewDprDto,
  ) {
    return this.dprService.review(
      dprId,
      user.employeeId!,
      "APPROVED",
      dto.comment,
      dto.qualityScore,
      user.roles,
    );
  }

  @Roles(RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @Patch(":dprId/reject")
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("dprId") dprId: string,
    @Body() dto: ReviewDprDto,
  ) {
    return this.dprService.review(
      dprId,
      user.employeeId!,
      "REJECTED",
      dto.comment,
      dto.qualityScore,
      user.roles,
    );
  }

  @Roles(RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @Patch(":dprId/request-changes")
  requestChanges(
    @CurrentUser() user: AuthenticatedUser,
    @Param("dprId") dprId: string,
    @Body() dto: ReviewDprDto,
  ) {
    return this.dprService.review(
      dprId,
      user.employeeId!,
      "NEEDS_CHANGES",
      dto.comment,
      dto.qualityScore,
      user.roles,
    );
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":dprId/quality")
  quality(
    @CurrentUser() user: AuthenticatedUser,
    @Param("dprId") dprId: string,
    @Body() dto: ReviewDprDto,
  ) {
    return this.dprService.rateQuality(
      dprId,
      user.employeeId!,
      dto.qualityScore ?? 0,
      dto.comment,
    );
  }

  @Roles(RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @Patch(":dprId/unlock")
  unlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param("dprId") dprId: string,
    @Body() dto: UnlockDprDto,
  ) {
    return this.dprService.unlock(dprId, user.employeeId!, dto.reason);
  }
}
