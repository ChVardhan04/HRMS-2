import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { AtsScreeningService } from "./screening.service";
import { PrismaService } from "../prisma/prisma.service";

@Controller("ats")
export class AtsScreeningController {
  constructor(private screening: AtsScreeningService, private prisma: PrismaService) {}

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("screen-resume")
  @UseInterceptors(FileInterceptor("resume", { limits: { fileSize: 5 * 1024 * 1024 } }))
  screenResume(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() resume: Express.Multer.File,
    @Body() body: any,
  ) {
    if (!body?.jobPostingId) throw new BadRequestException("jobPostingId is required");
    return this.screening.screenResume(
      body.jobPostingId,
      resume,
      user,
      { firstName: body.firstName, lastName: body.lastName, email: body.email, phone: body.phone, source: body.source },
    );
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("job/:jobPostingId/screenings")
  screenings(@Param("jobPostingId") jobPostingId: string) {
    return this.prisma.atsScreeningResult.findMany({
      where: { jobPostingId },
      orderBy: { atsScore: "desc" },
      include: { candidate: true },
    });
  }
}
