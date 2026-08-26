import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JobStatus, RoleName } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { JobsService } from "./jobs.service";
import { CreateJobRequisitionDto } from "./dto/job.dto";
import { CandidatesService } from "../candidates/candidates.service";
import { CreateCandidateDto } from "../candidates/dto/candidate.dto";

@Controller("jobs")
export class JobsController {
  constructor(
    private jobsService: JobsService,
    private candidatesService: CandidatesService,
  ) {}

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("requisitions")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateJobRequisitionDto,
  ) {
    return this.jobsService.createRequisition(user.employeeId!, dto);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("requisitions")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("status") status?: JobStatus,
  ) {
    return this.jobsService.listRequisitions(status, user);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch("requisitions/:id/approve")
  approve(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.jobsService.approveRequisition(
      id,
      user.employeeId!,
      user.roles,
    );
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("requisitions/:id/publish")
  publish(@Param("id") id: string) {
    return this.jobsService.publishToCareersPage(id);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch("postings/:id/close")
  close(@Param("id") id: string) {
    return this.jobsService.closePosting(id);
  }

  @Public()
  @Get("careers")
  careers() {
    return this.jobsService.publicListings();
  }

  @Public()
  @Get("careers/:slug")
  careersDetail(@Param("slug") slug: string) {
    return this.jobsService.publicPosting(slug);
  }

  @Public()
  @Post("careers/:slug/apply")
  @UseInterceptors(
    FileInterceptor("resume", { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  apply(
    @Param("slug") slug: string,
    @UploadedFile() resume: Express.Multer.File,
    @Body() body: any,
  ) {
    const dto: CreateCandidateDto = {
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      skills: body.skills
        ? String(body.skills)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      experienceYears: body.experienceYears
        ? Number(body.experienceYears)
        : undefined,
    };
    return this.candidatesService.applyToCareers(slug, dto, resume);
  }
}
