import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { CandidatesService } from "./candidates/candidates.service";
import { CandidateSource } from "@prisma/client";

/**
 * Real webhook endpoints for Phase 2+ job-board integrations. They accept payloads only once the
 * corresponding provider is actually configured (see integrations/job-boards/*.adapter.ts) —
 * otherwise they reject with 400 rather than silently accepting and fabricating candidate data.
 */
@Controller("webhooks")
export class WebhooksController {
  constructor(private candidatesService: CandidatesService) {}

  @Public()
  @Post("indeed-apply")
  async indeedApply(@Body() payload: any) {
    if (!process.env.INDEED_EMPLOYER_ID) {
      throw new BadRequestException(
        "Indeed integration is not configured on this environment",
      );
    }
    return this.candidatesService.create(
      {
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        source: CandidateSource.INDEED,
      },
      undefined,
    );
  }

  @Public()
  @Post("naukri-applicant")
  async naukriApplicant(@Body() payload: any) {
    if (!process.env.NAUKRI_API_KEY) {
      throw new BadRequestException(
        "Naukri integration is not configured on this environment",
      );
    }
    return this.candidatesService.create(
      {
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        source: CandidateSource.NAUKRI,
      },
      undefined,
    );
  }

  @Public()
  @Post("email-application")
  async emailApplication(
    @Headers("x-email-webhook-secret") secret: string,
    @Body()
    payload: {
      from?: string;
      subject?: string;
      text?: string;
      jobSlug?: string;
    },
  ) {
    if (
      !process.env.EMAIL_INBOUND_WEBHOOK_SECRET ||
      secret !== process.env.EMAIL_INBOUND_WEBHOOK_SECRET
    )
      throw new BadRequestException("Invalid inbound email webhook secret");
    const email = payload.from?.match(/<([^>]+)>/)?.[1] ?? payload.from;
    if (!email || !email.includes("@"))
      throw new BadRequestException("Inbound email sender is missing");
    const text = payload.text ?? "";
    const line = (label: string) =>
      text.match(new RegExp(`${label}\s*[:\-]\s*(.+)`, "i"))?.[1]?.trim();
    const fullName =
      line("Name") ?? email.split("@")[0].replace(/[._-]+/g, " ");
    const [firstName, ...rest] = fullName.split(/\s+/);
    const phone = line("Phone") ?? line("Mobile");
    const jobPostingId = payload.jobSlug
      ? await this.candidatesService.findPostingIdBySlug(payload.jobSlug)
      : undefined;
    return this.candidatesService.create(
      {
        firstName,
        lastName: rest.join(" ") || "Applicant",
        email,
        phone,
        source: CandidateSource.EMAIL_INBOUND,
        jobPostingId,
      },
      undefined,
    );
  }

  @Public()
  @Post("calendar-event")
  async calendarEvent(@Body() payload: any) {
    if (!process.env.GOOGLE_CALENDAR_CLIENT_ID) {
      throw new BadRequestException(
        "Google Calendar integration is not configured on this environment",
      );
    }
    return { received: true, payload };
  }
}
