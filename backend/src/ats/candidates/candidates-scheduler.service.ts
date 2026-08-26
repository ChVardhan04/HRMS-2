import { Injectable, Logger } from "@nestjs/common";
import { CandidateStage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { NotificationCategory } from "../../notifications/notification-category.enum";
import { CandidatesService } from "./candidates.service";

const ACTIVE_STAGES: CandidateStage[] = [
  CandidateStage.SOURCED,
  CandidateStage.APPLIED,
  CandidateStage.RESUME_SCREEN,
  CandidateStage.HR_SCREEN,
  CandidateStage.TECHNICAL_ROUND,
  CandidateStage.MANAGER_ROUND,
  CandidateStage.OFFER,
];

/** "Stale candidate check — daily 9 AM" from plan section 12.2/19: no activity beyond threshold -> flagged + recruiter notified. */
@Injectable()
export class CandidatesSchedulerService {
  private readonly logger = new Logger(CandidatesSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async runStaleCandidateSweep() {
    const threshold = new Date(
      Date.now() - CandidatesService.staleDaysThreshold * 24 * 60 * 60 * 1000,
    );

    const stale = await this.prisma.candidate.findMany({
      where: {
        currentStage: { in: ACTIVE_STAGES },
        isStale: false,
        OR: [
          { lastContactedAt: { lt: threshold } },
          { lastContactedAt: null, createdAt: { lt: threshold } },
        ],
      },
      include: { recruiter: { include: { user: true } } },
    });

    for (const candidate of stale) {
      await this.prisma.candidate.update({
        where: { id: candidate.id },
        data: { isStale: true },
      });
      await this.prisma.candidateActivity.create({
        data: {
          candidateId: candidate.id,
          performedById: candidate.recruiterId ?? undefined,
          type: "FOLLOW_UP_TASK",
          body: `Auto follow-up: no activity in ${CandidatesService.staleDaysThreshold}+ days`,
          followUpDueAt: new Date(),
        },
      });

      if (candidate.recruiter?.user) {
        await this.notifications.notify({
          userId: candidate.recruiter.userId!,
          title: "Stale candidate needs follow-up",
          body: `${candidate.firstName} ${candidate.lastName} has had no activity for ${CandidatesService.staleDaysThreshold}+ days.`,
          category: NotificationCategory.STALE_CANDIDATE,
          emailAlso: true,
          recipientEmail: candidate.recruiter.user.email,
        });
      }
    }

    this.logger.log(
      `Stale candidate sweep flagged ${stale.length} candidate(s).`,
    );
    return { flagged: stale.length };
  }
}
