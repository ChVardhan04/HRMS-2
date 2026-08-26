export interface ExternalCandidateRecord {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  resumeUrl?: string;
  skills?: string[];
  experienceYears?: number;
  sourceJobTitle?: string;
  externalId?: string;
}

export class IntegrationNotConfiguredError extends Error {
  constructor(provider: string) {
    super(
      `${provider} integration is not configured. Provide the required API credentials in ` +
        `environment variables to enable it; until then this adapter intentionally does not ` +
        `simulate a working connection.`,
    );
    this.name = "IntegrationNotConfiguredError";
  }
}

/**
 * Common contract every job-board integration implements, so the ATS never needs to know
 * whether applicants arrived via a real API, a webhook, or a manual CSV/Excel import.
 * New boards are added by implementing this interface — the ATS pipeline code doesn't change.
 */
export interface JobBoardAdapter {
  readonly providerName: string;
  isConfigured(): boolean;
  /** Pull new applicants since the given timestamp. Throws IntegrationNotConfiguredError if unavailable. */
  fetchNewApplicants(sinceIso?: string): Promise<ExternalCandidateRecord[]>;
  /** Push a job posting to the external board, if the provider supports it. */
  publishJob?(
    jobTitle: string,
    jobDescription: string,
  ): Promise<{ externalPostingId: string }>;
}
