import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
import { DocumentsService } from "./documents.service";

@Controller("employees/:employeeId/documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(
    @Param("employeeId") employeeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.list(employeeId, user);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        cb(null, allowed.includes(file.mimetype));
      },
    }),
  )
  upload(
    @Param("employeeId") employeeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Query("type") type?: string,
    @Query("expiresAt") expiresAt?: string,
  ) {
    return this.documents.upload(
      employeeId,
      user.employeeId!,
      file,
      user,
      type,
      expiresAt,
    );
  }

  @Get(":documentId/download")
  download(
    @Param("employeeId") employeeId: string,
    @Param("documentId") documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.download(employeeId, documentId, user);
  }
}
