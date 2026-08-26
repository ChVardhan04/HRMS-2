import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  STORAGE_ADAPTER,
  StorageAdapter,
} from "../integrations/storage/storage-adapter.interface";
import { Inject } from "@nestjs/common";
import { CreatePolicyDto, UpdatePolicyDto } from "./dto/policy.dto";
import { randomUUID } from "crypto";

@Injectable()
export class PoliciesService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private storage: StorageAdapter,
  ) {}

  private async org() {
    const org = await this.prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (!org) throw new NotFoundException("Organization is not configured");
    return org;
  }

  async list(employeeId?: string) {
    const org = await this.org();
    const policies = await this.prisma.policy.findMany({
      where: { organizationId: org.id, isActive: true },
      include: employeeId
        ? {
            acknowledgements: {
              where: { employeeId },
              select: { acknowledgedAt: true },
            },
          }
        : undefined,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });
    return policies.map((p: any) => ({
      ...p,
      acknowledged: Boolean(p.acknowledgements?.length),
      acknowledgements: undefined,
    }));
  }

  async create(dto: CreatePolicyDto) {
    const org = await this.org();
    return this.prisma.policy.create({
      data: {
        organizationId: org.id,
        title: dto.title,
        description: dto.description,
        effectiveFrom: dto.effectiveFrom
          ? new Date(dto.effectiveFrom)
          : undefined,
        publishedAt: new Date(),
      },
    });
  }

  async update(id: string, dto: UpdatePolicyDto) {
    const policy = await this.prisma.policy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException("Policy not found");
    return this.prisma.policy.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        effectiveFrom: dto.effectiveFrom
          ? new Date(dto.effectiveFrom)
          : undefined,
        version: { increment: 1 },
      },
    });
  }

  async archive(id: string) {
    const policy = await this.prisma.policy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException("Policy not found");
    return this.prisma.policy.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async upload(policyId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException("Policy file is required");
    const policy = await this.prisma.policy.findUnique({
      where: { id: policyId },
    });
    if (!policy) throw new NotFoundException("Policy not found");
    const key = `policies/${policy.organizationId}/${policy.id}/${randomUUID()}-${file.originalname}`;
    const uploaded = await this.storage.upload({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });
    return this.prisma.policy.update({
      where: { id: policyId },
      data: {
        fileName: file.originalname,
        storageKey: uploaded.key,
        version: policy.storageKey ? { increment: 1 } : undefined,
      },
    });
  }

  async acknowledge(policyId: string, employeeId: string, ipAddress?: string) {
    const policy = await this.prisma.policy.findFirst({
      where: { id: policyId, isActive: true },
    });
    if (!policy) throw new NotFoundException("Policy not found");
    return this.prisma.policyAcknowledgement.upsert({
      where: { policyId_employeeId: { policyId, employeeId } },
      create: {
        policyId,
        employeeId,
        policyVersion: policy.version,
        ipAddress,
      },
      update: {
        policyVersion: policy.version,
        acknowledgedAt: new Date(),
        ipAddress,
      },
    });
  }

  async download(policyId: string) {
    const policy = await this.prisma.policy.findUnique({
      where: { id: policyId },
    });
    if (!policy) throw new NotFoundException("Policy not found");
    if (!policy.storageKey)
      throw new NotFoundException("No document is attached to this policy");
    return {
      url: await this.storage.getSignedDownloadUrl(policy.storageKey),
      fileName: policy.fileName,
    };
  }
}
