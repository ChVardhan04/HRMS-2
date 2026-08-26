import { Injectable } from "@nestjs/common";
import { JobBoardAdapter } from "./job-board-adapter.interface";
import { NaukriAdapter } from "./naukri.adapter";
import { IndeedAdapter } from "./indeed.adapter";
import { LinkedInAdapter } from "./linkedin.adapter";

/** Central place the ATS asks "which adapters exist / are configured" — new boards register here. */
@Injectable()
export class JobBoardRegistry {
  private adapters: JobBoardAdapter[];

  constructor(
    naukri: NaukriAdapter,
    indeed: IndeedAdapter,
    linkedIn: LinkedInAdapter,
  ) {
    this.adapters = [naukri, indeed, linkedIn];
  }

  list() {
    return this.adapters.map((a) => ({
      provider: a.providerName,
      configured: a.isConfigured(),
    }));
  }

  get(providerName: string): JobBoardAdapter | undefined {
    return this.adapters.find((a) => a.providerName === providerName);
  }
}
