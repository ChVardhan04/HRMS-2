import { Injectable } from "@nestjs/common";
import {
  ExternalCandidateRecord,
  IntegrationNotConfiguredError,
  JobBoardAdapter,
} from "./job-board-adapter.interface";

/**
 * Naukri does not expose a general-purpose bidirectional ATS API for SMBs — access requires a
 * Naukri Recruiter subscription with API entitlement. This adapter is real and ready to wire up,
 * but stays inert (never fabricates applicant data) until NAUKRI_API_KEY / NAUKRI_API_BASE_URL
 * are supplied, per the plan's "do not create fake functionality" rule.
 */
@Injectable()
export class NaukriAdapter implements JobBoardAdapter {
  readonly providerName = "NAUKRI";

  isConfigured(): boolean {
    return Boolean(
      process.env.NAUKRI_API_KEY && process.env.NAUKRI_API_BASE_URL,
    );
  }

  async fetchNewApplicants(
    _sinceIso?: string,
  ): Promise<ExternalCandidateRecord[]> {
    if (!this.isConfigured()) {
      throw new IntegrationNotConfiguredError(this.providerName);
    }
    // TODO(integration): call `${NAUKRI_API_BASE_URL}/applicants` with NAUKRI_API_KEY once the
    // company has an active Naukri Recruiter API subscription. Left unimplemented intentionally —
    // wiring a real endpoint without valid credentials cannot be verified and would be fake.
    throw new IntegrationNotConfiguredError(this.providerName);
  }
}
