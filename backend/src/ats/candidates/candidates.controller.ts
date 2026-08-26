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
import { CandidateSource, RoleName } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { CandidatesService } from "./candidates.service";
import {
  BulkCandidateActionDto,
  CandidateQueryDto,
  CreateCandidateDto,
  MoveStageDto,
} from "./dto/candidate.dto";

@Controller("candidates")
export class CandidatesController {
  constructor(private candidatesService: CandidatesService) {}

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCandidateDto,
  ) {
    return this.candidatesService.create(dto, user.employeeId);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor("file"))
  @Post("import-csv")
  importCsv(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body("jobPostingId") jobPostingId?: string,
    @Body("source") source: CandidateSource = CandidateSource.OTHER,
  ) {
    return this.candidatesService.importCsv(
      file.buffer,
      jobPostingId,
      user.employeeId!,
      source,
    );
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CandidateQueryDto,
  ) {
    return this.candidatesService.findAll(query, user);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("export")
  export() {
    return this.candidatesService.exportAll();
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.candidatesService.findOne(id, user);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id/stage")
  moveStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: MoveStageDto,
  ) {
    return this.candidatesService.moveStage(id, user, dto);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post(":id/notes")
  note(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body("type") type: "CALL" | "EMAIL" | "NOTE",
    @Body("body") body: string,
  ) {
    return this.candidatesService.logCallOrNote(id, user, type, body);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post(":id/follow-up")
  followUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body("dueAt") dueAt: string,
    @Body("note") note?: string,
  ) {
    return this.candidatesService.scheduleFollowUp(
      id,
      user,
      new Date(dueAt),
      note,
    );
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id/reject")
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body("reason") reason: string,
  ) {
    return this.candidatesService.reject(id, user, reason);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("bulk")
  bulk(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkCandidateActionDto,
  ) {
    switch (dto.action) {
      case "change_stage":
        return this.candidatesService.bulkChangeStage(
          dto.candidateIds,
          user,
          dto.payload?.stage,
        );
      case "assign_recruiter":
        return this.candidatesService.bulkAssignRecruiter(
          dto.candidateIds,
          user,
          dto.payload?.recruiterId,
        );
      case "assign_hiring_manager":
        return this.candidatesService.bulkAssignHiringManager(
          dto.candidateIds,
          user,
          dto.payload?.hiringManagerId,
        );
      case "reject":
        return this.candidatesService.bulkReject(
          dto.candidateIds,
          user,
          dto.payload?.reason ?? "Bulk rejected",
        );
      default:
        return { success: false, message: "Unsupported bulk action" };
    }
  }
}
