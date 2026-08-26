import { Injectable } from "@nestjs/common";
import {
  ExternalCandidateRecord,
  IntegrationNotConfiguredError,
  JobBoardAdapter,
} from "./job-board-adapter.interface";

/**
 * Indeed applicants arrive via the "Indeed Apply" webhook once an employer account is set up —
 * see AtsController's `/webhooks/indeed-apply` endpoint. This adapter's `fetchNewApplicants`
 * is a pull-fallback for reconciliation and stays inert until INDEED_EMPLOYER_ID is configured.
 */
@Injectable()
export class IndeedAdapter implements JobBoardAdapter {
  readonly providerName = "INDEED";

  isConfigured(): boolean {
    return Boolean(process.env.INDEED_EMPLOYER_ID);
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
