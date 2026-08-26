import { Inject, Injectable, Logger } from "@nestjs/common";
import { NotificationCategory } from "./notification-category.enum";
import { PrismaService } from "../prisma/prisma.service";
import {
  EMAIL_ADAPTER,
  SendEmailInput,
} from "../integrations/email/email-adapter.interface";
import type { EmailAdapter } from "../integrations/email/email-adapter.interface";
import { NotificationChannel } from "@prisma/client";

export interface NotifyInput {
  userId: string;
  title: string;
  body: string;
  category: NotificationCategory | string;
  channel?: NotificationChannel;
  metadata?: Record<string, unknown>;
  emailAlso?: boolean;
  recipientEmail?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(EMAIL_ADAPTER) private emailAdapter: EmailAdapter,
  ) {}

  async sendEmail(input: SendEmailInput) {
    try {
      await this.emailAdapter.send(input);
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${input.to}: ${(err as Error).message}`,
      );
    }
  }

  async notify(input: NotifyInput) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        body: input.body,
        category: input.category,
        channel: input.channel ?? NotificationChannel.IN_APP,
        metadata: input.metadata as any,
        status: "SENT",
        sentAt: new Date(),
      },
    });

    if (input.emailAlso && input.recipientEmail) {
      await this.sendEmail({
        to: input.recipientEmail,
        subject: input.title,
        body: input.body,
      });
    }

    return notification;
  }

  async listForUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async markRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date(), status: "READ" },
    });
  }
}
