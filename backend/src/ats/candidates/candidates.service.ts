import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CandidateSource, CandidateStage, RoleName } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CsvImportAdapter } from "../../integrations/job-boards/csv-import.adapter";
import {
  CandidateQueryDto,
  CreateCandidateDto,
  MoveStageDto,
} from "./dto/candidate.dto";
import { Paginated } from "../../common/dto/pagination.dto";
import { randomUUID } from "crypto";
import { AtsScreeningService } from "../screening.service";

const STALE_DAYS_THRESHOLD = 3;

@Injectable()
export class CandidatesService {
  constructor(
    private prisma: PrismaService,
    private csvImportAdapter: CsvImportAdapter,
    private screeningService: AtsScreeningService,
  ) {}

  /** Combines email/phone/name matching and reuses an existing candidate instead of creating duplicate records. */
  async findDuplicates(
    email: string,
    phone?: string,
    firstName?: string,
    lastName?: string,
  ) {
    return this.prisma.candidate.findMany({
      where: {
        OR: [
          { email },
          ...(phone ? [{ phone }] : []),
          ...(firstName && lastName ? [{ firstName, lastName }] : []),
        ],
      },
    });
  }

  async create(dto: CreateCandidateDto, recruiterId?: string) {
    const duplicates = await this.findDuplicates(
      dto.email,
      dto.phone,
      dto.firstName,
      dto.lastName,
    );
    const existing = duplicates[0];
    if (existing) {
      if (dto.jobPostingId) {
        await this.prisma.jobApplication.upsert({
          where: {
            candidateId_jobPostingId: {
              candidateId: existing.id,
              jobPostingId: dto.jobPostingId,
            },
          },
          create: { candidateId: existing.id, jobPostingId: dto.jobPostingId },
          update: {},
        });
      }
      if (recruiterId)
        await this.logActivity(
          existing.id,
          recruiterId,
          "NOTE",
          `Duplicate candidate matched by email/phone/name; record reused${dto.jobPostingId ? " and application linked" : ""}.`,
        );
      return existing;
    }

    const candidate = await this.prisma.candidate.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        skills: dto.skills ?? [],
        experienceYears: dto.experienceYears,
        source: dto.source,
        recruiterId,
        duplicateOfId: duplicates[0]?.id,
        applications: dto.jobPostingId
          ? { create: { jobPostingId: dto.jobPostingId } }
          : undefined,
      },
    });

    if (recruiterId)
      await this.logActivity(
        candidate.id,
        recruiterId,
        "NOTE",
        "Candidate created" +
          (duplicates.length
            ? ` (possible duplicate of ${duplicates.length} record(s))`
            : ""),
      );

    return candidate;
  }

  async findPostingIdBySlug(slug: string) {
    const posting = await this.prisma.jobPosting.findUnique({
      where: { publicSlug: slug, isPublished: true },
      select: { id: true },
    });
    return posting?.id;
  }

  async applyToCareers(
    slug: string,
    dto: CreateCandidateDto,
    file?: Express.Multer.File,
  ) {
    const posting = await this.prisma.jobPosting.findUnique({
      where: { publicSlug: slug },
      include: { requisition: true },
    });
    if (!posting || !posting.isPublished)
      throw new NotFoundException("Job posting not found");
    if (!file) throw new BadRequestException("Resume file is required");
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.mimetype))
      throw new BadRequestException("Resume must be PDF, DOC, or DOCX");
    if (file.size > 5 * 1024 * 1024)
      throw new BadRequestException("Resume must be 5 MB or smaller");

    return this.screeningService.screenResume(
      posting.id,
      file,
      { roles: [RoleName.HR_ADMIN] },
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        source: CandidateSource.CAREERS_PAGE,
      },
    );
  }

  async importCsv(
    fileBuffer: Buffer,
    jobPostingId: string | undefined,
    recruiterId: string,
    source: any,
  ) {
    const records = this.csvImportAdapter.parse(fileBuffer);
    const created: unknown[] = [];
    for (const record of records) {
      if (!record.email) continue;
      const candidate = await this.create(
        {
          firstName: record.firstName,
          lastName: record.lastName,
          email: record.email,
          phone: record.phone,
          skills: record.skills,
          experienceYears: record.experienceYears,
          source,
          jobPostingId,
        },
        recruiterId,
      );
      created.push(candidate);
    }
    return { imported: created.length, candidates: created };
  }

  private async assertCandidateAccess(
    id: string,
    actor: { employeeId?: string; roles: string[] },
  ) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: { applications: { include: { jobPosting: { include: { requisition: true } } } } },
    });
    if (!candidate) throw new NotFoundException("Candidate not found");
    const isHr = actor.roles.includes(RoleName.HR_ADMIN) || actor.roles.includes(RoleName.SUPER_ADMIN);
    if (!isHr) throw new ForbiddenException("Recruitment records are managed by HR");
    return candidate;
  }

  async findAll(
    query: CandidateQueryDto,
    actor?: { employeeId?: string; roles: string[] },
  ): Promise<Paginated<any>> {
    const isHr =
      actor?.roles.includes(RoleName.HR_ADMIN) ||
      actor?.roles.includes(RoleName.SUPER_ADMIN);
    const where: any = {
      ...(query.stage ? { currentStage: query.stage } : {}),
      ...(query.recruiterId ? { recruiterId: query.recruiterId } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.candidate.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { [query.sortBy ?? "createdAt"]: query.sortDir ?? "desc" },
        include: {
          recruiter: { select: { firstName: true, lastName: true } },
          applications: {
            include: { jobPosting: { include: { requisition: true } } },
          },
          screeningResults: { orderBy: { screenedAt: "desc" } },
        },
      }),
      this.prisma.candidate.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async findOne(id: string, actor?: { employeeId?: string; roles: string[] }) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: {
        activities: { orderBy: { createdAt: "desc" } },
        interviews: {
          include: {
            scorecards: true,
            panelists: { include: { employee: true } },
          },
        },
        offer: true,
        applications: {
          include: { jobPosting: { include: { requisition: true } } },
        },
        screeningResults: { orderBy: { screenedAt: "desc" }, include: { jobPosting: { include: { requisition: true } } } },
      },
    });
    if (!candidate) throw new NotFoundException("Candidate not found");
    if (actor) await this.assertCandidateAccess(id, actor);
    return candidate;
  }

  async moveStage(
    id: string,
    actor: { employeeId?: string; roles: string[] },
    dto: MoveStageDto,
  ) {
    if (dto.stage === CandidateStage.REJECTED && !dto.note?.trim())
      throw new BadRequestException("A rejection reason is required");
    const candidateAccess = await this.assertCandidateAccess(id, actor);
    const candidate = await this.prisma.candidate.update({
      where: { id },
      data: {
        currentStage: dto.stage,
        lastContactedAt: new Date(),
        isStale: false,
        rejectionReason:
          dto.stage === CandidateStage.REJECTED ? dto.note : undefined,
      },
    });
    await this.logActivity(
      id,
      actor.employeeId!,
      "STAGE_CHANGE",
      `Moved to ${dto.stage}${dto.note ? `: ${dto.note}` : ""}`,
    );
    return candidate;
  }

  async logActivity(
    candidateId: string,
    performedById: string,
    type: string,
    body?: string,
    followUpDueAt?: Date,
  ) {
    return this.prisma.candidateActivity.create({
      data: { candidateId, performedById, type, body, followUpDueAt },
    });
  }

  async logCallOrNote(
    candidateId: string,
    actor: { employeeId?: string; roles: string[] },
    type: "CALL" | "EMAIL" | "NOTE",
    body: string,
  ) {
    await this.assertCandidateAccess(candidateId, actor);
    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: { lastContactedAt: new Date(), isStale: false },
    });
    return this.logActivity(candidateId, actor.employeeId!, type, body);
  }

  async scheduleFollowUp(
    candidateId: string,
    actor: { employeeId?: string; roles: string[] },
    dueAt: Date,
    note?: string,
  ) {
    await this.assertCandidateAccess(candidateId, actor);
    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: { nextFollowUpAt: dueAt },
    });
    return this.logActivity(
      candidateId,
      actor.employeeId!,
      "FOLLOW_UP_TASK",
      note,
      dueAt,
    );
  }

  async reject(
    id: string,
    actor: { employeeId?: string; roles: string[] },
    reason: string,
  ) {
    await this.assertCandidateAccess(id, actor);
    return this.prisma.candidate.update({
      where: { id },
      data: { currentStage: CandidateStage.REJECTED, rejectionReason: reason },
    });
  }

  async bulkAssignRecruiter(
    candidateIds: string[],
    actor: { employeeId?: string; roles: string[] },
    recruiterId: string,
  ) {
    await Promise.all(
      candidateIds.map((id) => this.assertCandidateAccess(id, actor)),
    );
    return this.prisma.candidate.updateMany({
      where: { id: { in: candidateIds } },
      data: { recruiterId },
    });
  }

  async bulkAssignHiringManager(
    candidateIds: string[],
    actor: { employeeId?: string; roles: string[] },
    hiringManagerId: string,
  ) {
    await Promise.all(
      candidateIds.map((id) => this.assertCandidateAccess(id, actor)),
    );
    return this.prisma.candidate.updateMany({
      where: { id: { in: candidateIds } },
      data: { hiringManagerId },
    });
  }

  async bulkChangeStage(
    candidateIds: string[],
    actor: { employeeId?: string; roles: string[] },
    stage: CandidateStage,
  ) {
    await Promise.all(
      candidateIds.map((id) => this.assertCandidateAccess(id, actor)),
    );
    return this.prisma.candidate.updateMany({
      where: { id: { in: candidateIds } },
      data: { currentStage: stage },
    });
  }

  async bulkReject(
    candidateIds: string[],
    actor: { employeeId?: string; roles: string[] },
    reason: string,
  ) {
    await Promise.all(
      candidateIds.map((id) => this.assertCandidateAccess(id, actor)),
    );
    return this.prisma.candidate.updateMany({
      where: { id: { in: candidateIds } },
      data: { currentStage: CandidateStage.REJECTED, rejectionReason: reason },
    });
  }

  async exportAll() {
    return this.prisma.candidate.findMany({
      include: { applications: { include: { jobPosting: true } } },
    });
  }

  static readonly staleDaysThreshold = STALE_DAYS_THRESHOLD;
}
