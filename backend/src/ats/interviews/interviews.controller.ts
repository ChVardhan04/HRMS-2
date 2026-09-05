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
  OfferResponseDto,
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

  /**
   * HR is the sole approval authority for offers. There is no Finance step.
   */
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

  /**
   * Public candidate offer portal. The :portalToken path segment is the
   * 32-byte random Offer.portalToken emailed to the candidate — NOT the
   * offer's database id. It is the capability that authorises this call.
   */
  @Public()
  @Patch(":portalToken/respond")
  respond(
    @Param("portalToken") portalToken: string,
    @Body() dto: OfferResponseDto,
  ) {
    return this.interviewsService.recordOfferResponse(portalToken, dto.accepted);
  }
}
