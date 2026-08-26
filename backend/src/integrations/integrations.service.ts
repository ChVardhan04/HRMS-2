import { Injectable } from "@nestjs/common";
import { JobBoardRegistry } from "./job-boards/job-board-registry";

@Injectable()
export class IntegrationsService {
  constructor(private jobBoards: JobBoardRegistry) {}

  status() {
    return {
      jobBoards: this.jobBoards.list(),
      calendar: {
        provider: "GOOGLE_CALENDAR",
        configured: Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID),
      },
      email: {
        provider: process.env.EMAIL_PROVIDER ?? "smtp",
        configured: Boolean(
          process.env.SMTP_HOST || process.env.SENDGRID_API_KEY,
        ),
      },
      storage: {
        provider: process.env.STORAGE_PROVIDER ?? "s3",
        configured: Boolean(process.env.STORAGE_ACCESS_KEY_ID),
      },
    };
  }
}
