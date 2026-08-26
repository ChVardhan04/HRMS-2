import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { FileInterceptor } from "@nestjs/platform-express";
import { Roles } from "../common/decorators/roles.decorator";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
import { CreatePolicyDto, UpdatePolicyDto } from "./dto/policy.dto";
import { PoliciesService } from "./policies.service";

@Controller("policies")
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.policies.list(user.employeeId);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreatePolicyDto) {
    return this.policies.create(dto);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePolicyDto) {
    return this.policies.update(id, dto);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id/archive")
  archive(@Param("id") id: string) {
    return this.policies.archive(id);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post(":id/file")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        cb(null, allowed.includes(file.mimetype));
      },
    }),
  )
  upload(@Param("id") id: string, @UploadedFile() file: Express.Multer.File) {
    return this.policies.upload(id, file);
  }

  @Post(":id/acknowledge")
  acknowledge(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.policies.acknowledge(id, user.employeeId!, req.ip);
  }

  @Get(":id/download")
  download(@Param("id") id: string) {
    return this.policies.download(id);
  }
}
