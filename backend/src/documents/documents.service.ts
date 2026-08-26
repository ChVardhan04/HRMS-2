import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  STORAGE_ADAPTER,
  StorageAdapter,
} from "../integrations/storage/storage-adapter.interface";
import { Inject } from "@nestjs/common";
import { randomUUID } from "crypto";
import { RoleName } from "@prisma/client";

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private storage: StorageAdapter,
  ) {}

  private async authorize(
    employeeId: string,
    user: { employeeId?: string; roles: string[] },
  ) {
    const target = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException("Employee not found");
    const hr =
      user.roles.includes(RoleName.HR_ADMIN) ||
      user.roles.includes(RoleName.SUPER_ADMIN);
    if (!hr && user.employeeId !== employeeId)
      throw new ForbiddenException(
        "You are not allowed to access these documents",
      );
  }

  async list(
    employeeId: string,
    user: { employeeId?: string; roles: string[] },
  ) {
    await this.authorize(employeeId, user);
    return this.prisma.document.findMany({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
    });
  }

  async upload(
    employeeId: string,
    uploadedBy: string,
    file: Express.Multer.File,
    user: { employeeId?: string; roles: string[] },
    type = "OTHER",
    expiresAt?: string,
  ) {
    const hr =
      user.roles.includes(RoleName.HR_ADMIN) ||
      user.roles.includes(RoleName.SUPER_ADMIN);
    if (!hr && user.employeeId !== employeeId)
      throw new ForbiddenException("You can only upload your own documents");
    if (!file) throw new BadRequestException("Document file is required");
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) throw new NotFoundException("Employee not found");
    const key = `employees/${employeeId}/documents/${randomUUID()}-${file.originalname}`;
    const result = await this.storage.upload({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });
    return this.prisma.document.create({
      data: {
        employeeId,
        uploadedBy,
        type,
        fileName: file.originalname,
        storageKey: result.key,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
    });
  }

  async download(
    employeeId: string,
    documentId: string,
    user: { employeeId?: string; roles: string[] },
  ) {
    await this.authorize(employeeId, user);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, employeeId },
    });
    if (!document) throw new NotFoundException("Document not found");
    return {
      url: await this.storage.getSignedDownloadUrl(document.storageKey),
      fileName: document.fileName,
    };
  }
}
