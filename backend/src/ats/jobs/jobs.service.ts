import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JobStatus, RoleName } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateJobRequisitionDto } from "./dto/job.dto";
import * as crypto from "crypto";

/** Job requisition workflow from plan 7.1: Hiring Manager raises req -> HR review -> Finance/Leadership approval -> published. */
@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  async createRequisition(requestedById: string, dto: CreateJobRequisitionDto) {
    return this.prisma.jobRequisition.create({
      data: { ...dto, requestedById, status: JobStatus.PENDING_APPROVAL },
    });
  }

  async listRequisitions(
    status?: JobStatus,
    actor?: { employeeId?: string; roles: string[] },
  ) {
    const isHr =
      actor?.roles.includes(RoleName.HR_ADMIN) ||
      actor?.roles.includes(RoleName.SUPER_ADMIN);
    const where: any = status ? { status } : {};
    if (!isHr && actor?.roles.includes(RoleName.MANAGER))
      where.requestedById = actor.employeeId;
    return this.prisma.jobRequisition.findMany({
      where,
      include: { postings: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async approveRequisition(id: string, approvedById: string, roles: string[]) {
    const req = await this.prisma.jobRequisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundException("Requisition not found");
    const isHr = roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    if (!isHr) throw new BadRequestException("Only HR can approve recruitment requisitions");
    if (req.status === JobStatus.CLOSED) throw new BadRequestException("Closed requisitions cannot be approved");
    return this.prisma.jobRequisition.update({
      where: { id },
      data: { hrApprovedById: approvedById, approvedById, status: JobStatus.OPEN },
    });
  }

  /** Publishes to the built-in careers page — always available, zero dependency on paid job-board APIs. */
  async publishToCareersPage(requisitionId: string) {
    const requisition = await this.prisma.jobRequisition.findUnique({
      where: { id: requisitionId },
    });
    if (!requisition) throw new NotFoundException("Requisition not found");
    if (requisition.status !== JobStatus.OPEN) {
      throw new BadRequestException(
        "Only approved/open requisitions can be published",
      );
    }

    const slugBase = requisition.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const publicSlug = `${slugBase}-${crypto.randomBytes(3).toString("hex")}`;

    return this.prisma.jobPosting.create({
      data: {
        requisitionId,
        publicSlug,
        isPublished: true,
        publishedAt: new Date(),
      },
    });
  }

  async closePosting(id: string) {
    return this.prisma.jobPosting.update({
      where: { id },
      data: { isPublished: false },
    });
  }

  /** Public careers page listing — no auth required. */
  async publicListings() {
    return this.prisma.jobPosting.findMany({
      where: { isPublished: true },
      include: { requisition: true },
    });
  }

  async publicPosting(slug: string) {
    const posting = await this.prisma.jobPosting.findUnique({
      where: { publicSlug: slug },
      include: { requisition: true },
    });
    if (!posting || !posting.isPublished)
      throw new NotFoundException("Job posting not found");
    return posting;
  }
}
