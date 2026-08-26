import { Body, Controller, Param, Patch, Post } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { InterviewsService } from "./interviews.service";
import {
  CreateOfferDto,
  ScheduleInterviewDto,
  SubmitScorecardDto,
} from "./dto/interview.dto";

@Controller("interviews")
export class InterviewsController {
  constructor(private interviewsService: InterviewsService) {}

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post()
  schedule(@Body() dto: ScheduleInterviewDto) {
    return this.interviewsService.schedule(dto);
  }

  @Roles(
    RoleName.EMPLOYEE,
    RoleName.MANAGER,
    RoleName.HR_ADMIN,
    RoleName.SUPER_ADMIN,
  )
  @Post(":id/scorecard")
  scorecard(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SubmitScorecardDto,
  ) {
    return this.interviewsService.submitScorecard(id, user.employeeId!, dto);
  }
}

@Controller("offers")
export class OffersController {
  constructor(private interviewsService: InterviewsService) {}

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateOfferDto) {
    return this.interviewsService.createOffer(dto);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id/hr-approve")
  hrApprove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.interviewsService.approveOfferHr(id, user.employeeId!);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id/send")
  send(@Param("id") id: string) {
    return this.interviewsService.sendOffer(id);
  }

  @Public()
  @Patch(":id/respond")
  respond(@Param("id") id: string, @Body("accepted") accepted: boolean) {
    return this.interviewsService.recordOfferResponse(id, accepted);
  }
}
