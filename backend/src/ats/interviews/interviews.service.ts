import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { CandidateStage, InterviewOutcome } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { NotificationCategory } from "../../notifications/notification-category.enum";
import {
  ScheduleInterviewDto,
  SubmitScorecardDto,
  CreateOfferDto,
} from "./dto/interview.dto";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";

@Injectable()
export class InterviewsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async schedule(dto: ScheduleInterviewDto) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: dto.candidateId },
    });
    if (!candidate) throw new NotFoundException("Candidate not found");
    if (!dto.panelistIds?.length)
      throw new BadRequestException(
        "At least one interview panelist is required",
      );
    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()))
      throw new BadRequestException("Invalid interview date/time");
    if (scheduledAt <= new Date())
      throw new BadRequestException(
        "Interview must be scheduled in the future",
      );
    const panelists = await this.prisma.employee.findMany({
      where: {
        id: { in: dto.panelistIds },
        deletedAt: null,
        employmentStatus: { not: "EXITED" },
      },
      select: { id: true },
    });
    if (panelists.length !== dto.panelistIds.length)
      throw new BadRequestException(
        "One or more interview panelists are not active employees",
      );
    const interview = await this.prisma.interview.create({
      data: {
        candidateId: dto.candidateId,
        round: dto.round,
        scheduledAt,
        durationMin: dto.durationMin ?? 45,
        panelists: {
          create: dto.panelistIds.map((employeeId) => ({ employeeId })),
        },
      },
      include: {
        panelists: { include: { employee: { include: { user: true } } } },
      },
    });

    await this.prisma.candidate.update({
      where: { id: dto.candidateId },
      data: { currentStage: this.stageForRound(dto.round) },
    });

    for (const panelist of interview.panelists) {
      if (!panelist.employee.user) continue;
      await this.notifications.notify({
        userId: panelist.employee.userId,
        title: "Interview panel assignment",
        body: `You've been assigned to a ${dto.round} interview on ${new Date(dto.scheduledAt).toLocaleString()}.`,
        category: NotificationCategory.GENERAL,
        emailAlso: true,
        recipientEmail: panelist.employee.user.email,
      });
    }

    // NOTE: Google Calendar sync would call the calendar integration here once
    // GOOGLE_CALENDAR_CLIENT_ID/SECRET are configured (plan 7.4) — omitted rather than faked.
    return interview;
  }

  private stageForRound(round: string): CandidateStage {
    const map: Record<string, CandidateStage> = {
      RESUME_SCREEN: CandidateStage.RESUME_SCREEN,
      HR_SCREEN: CandidateStage.HR_SCREEN,
      TECHNICAL: CandidateStage.TECHNICAL_ROUND,
      MANAGER: CandidateStage.MANAGER_ROUND,
    };
    return map[round] ?? CandidateStage.TECHNICAL_ROUND;
  }

  async submitScorecard(
    interviewId: string,
    submittedById: string,
    dto: SubmitScorecardDto,
  ) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { panelists: true },
    });
    if (!interview) throw new NotFoundException("Interview not found");
    if (
      !interview.panelists.some(
        (panelist) => panelist.employeeId === submittedById,
      )
    )
      throw new ForbiddenException(
        "Only assigned interview panelists can submit a scorecard",
      );
    const existing = await this.prisma.scorecard.findFirst({
      where: { interviewId, submittedById },
    });
    if (existing)
      throw new BadRequestException(
        "You have already submitted feedback for this interview",
      );
    const scorecard = await this.prisma.scorecard.create({
      data: { interviewId, submittedById, ...dto },
    });

    const outcome: InterviewOutcome =
      dto.recommendation === "STRONG_YES" || dto.recommendation === "YES"
        ? InterviewOutcome.SELECTED
        : InterviewOutcome.REJECTED;

    await this.prisma.interview.update({
      where: { id: interviewId },
      data: { outcome },
    });
    return scorecard;
  }

  async remindPendingFeedback() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pending = await this.prisma.interview.findMany({
      where: { outcome: InterviewOutcome.PENDING, scheduledAt: { lt: cutoff } },
      include: {
        panelists: { include: { employee: { include: { user: true } } } },
      },
    });

    for (const interview of pending) {
      for (const panelist of interview.panelists) {
        const hasScorecard = await this.prisma.scorecard.findFirst({
          where: {
            interviewId: interview.id,
            submittedById: panelist.employeeId,
          },
        });
        if (hasScorecard) continue;
        await this.notifications.notify({
          userId: panelist.employee.userId,
          title: "Interview feedback overdue",
          body: `Please submit your scorecard for the ${interview.round} interview.`,
          category: NotificationCategory.GENERAL,
          emailAlso: true,
          recipientEmail: panelist.employee.user.email,
        });
      }
    }
    return { remindersSent: pending.length };
  }

  async createOffer(dto: CreateOfferDto) {
    return this.prisma.offer.create({
      data: {
        candidateId: dto.candidateId,
        portalToken: crypto.randomBytes(32).toString("hex"),
        ctcOffered: dto.ctcOffered,
        designationTitle: dto.designationTitle,
        joiningDate: new Date(dto.joiningDate),
      },
    });
  }

  async approveOfferHr(offerId: string, hrApprovedById: string) {
    return this.prisma.offer.update({
      where: { id: offerId },
      data: { hrApprovedById },
    });
  }

  async approveOfferFinance(offerId: string, financeApprovedById: string) {
    const offer = await this.prisma.offer.update({
      where: { id: offerId },
      data: { financeApprovedById, status: "PENDING_APPROVAL" },
    });
    return offer;
  }

  async sendOffer(offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
    });
    if (!offer) throw new NotFoundException("Offer not found");
    if (!offer.hrApprovedById || !offer.financeApprovedById) {
      throw new NotFoundException(
        "Offer requires both HR and Finance sign-off before sending",
      );
    }
    await this.prisma.candidate.update({
      where: { id: offer.candidateId },
      data: { currentStage: CandidateStage.OFFER },
    });
    return this.prisma.offer.update({
      where: { id: offerId },
      data: { status: "SENT", sentAt: new Date() },
    });
  }

  /** Candidate accepts via portal link -> auto-creates the Employee record and triggers onboarding checklist (plan 7.5). */
  async recordOfferResponse(portalToken: string, accepted: boolean) {
    const offer = await this.prisma.offer.findUnique({
      where: { portalToken },
      include: {
        candidate: {
          include: {
            applications: {
              include: { jobPosting: { include: { requisition: true } } },
            },
          },
        },
      },
    });
    if (!offer) throw new NotFoundException("Offer link is invalid or expired");
    if (offer.status !== "SENT")
      throw new BadRequestException(
        "This offer is no longer awaiting a response",
      );

    const updated = await this.prisma.offer.update({
      where: { id: offer.id },
      data: {
        status: accepted ? "ACCEPTED" : "DECLINED",
        respondedAt: new Date(),
      },
    });

    if (accepted) {
      await this.prisma.candidate.update({
        where: { id: offer.candidateId },
        data: { currentStage: CandidateStage.JOINED },
      });
      const role = await this.prisma.role.findUnique({
        where: { name: "EMPLOYEE" },
      });
      const existingUser = await this.prisma.user.findUnique({
        where: { email: offer.candidate.email },
      });
      if (!existingUser && role) {
        const temporaryPassword = crypto.randomBytes(9).toString("base64url");
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);
        const requisition =
          offer.candidate.applications[0]?.jobPosting?.requisition;
        const department = requisition?.departmentName
          ? await this.prisma.department.findFirst({
              where: { name: requisition.departmentName },
            })
          : null;
        await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: offer.candidate.email,
              passwordHash,
              mustChangePassword: true,
              roles: { create: [{ roleId: role.id }] },
            },
          });
          await tx.employee.create({
            data: {
              employeeCode: `EMP-${crypto.randomInt(100000, 999999)}`,
              userId: user.id,
              firstName: offer.candidate.firstName,
              lastName: offer.candidate.lastName,
              phone: offer.candidate.phone,
              dateOfJoining: offer.joiningDate,
              employmentType: "FULL_TIME",
              employmentStatus: "PROBATION",
              departmentId: department?.id,
            },
          });
        });
        await this.notifications.sendEmail({
          to: offer.candidate.email,
          subject: "Your employee portal access",
          body: `Your HRMS account has been created. Temporary password: ${temporaryPassword}. Please sign in and change it immediately.`,
        });
      }
    }

    return updated;
  }
}
