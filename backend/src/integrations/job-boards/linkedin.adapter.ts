import { Injectable } from "@nestjs/common";
import {
  ExternalCandidateRecord,
  IntegrationNotConfiguredError,
  JobBoardAdapter,
} from "./job-board-adapter.interface";

/** Requires a licensed LinkedIn Recruiter System Connect (RSC) integration. Inert until configured. */
@Injectable()
export class LinkedInAdapter implements JobBoardAdapter {
  readonly providerName = "LINKEDIN";

  isConfigured(): boolean {
    return Boolean(
      process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET,
    );
  }

  async fetchNewApplicants(
    _sinceIso?: string,
  ): Promise<ExternalCandidateRecord[]> {
    if (!this.isConfigured()) {
      throw new IntegrationNotConfiguredError(this.providerName);
    }
    throw new IntegrationNotConfiguredError(this.providerName);
  }
}
