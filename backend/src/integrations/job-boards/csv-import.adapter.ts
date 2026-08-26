import { Injectable } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { ExternalCandidateRecord } from "./job-board-adapter.interface";

/**
 * Tier-1 integration from the plan: works today with zero external dependency. HR exports a
 * candidate list from Naukri/Indeed/LinkedIn and uploads the CSV/Excel(csv) here.
 * Expected header row: firstName,lastName,email,phone,resumeUrl,skills,experienceYears,jobTitle
 */
@Injectable()
export class CsvImportAdapter {
  readonly providerName = "CSV_IMPORT";

  parse(fileBuffer: Buffer): ExternalCandidateRecord[] {
    const rows: Record<string, string>[] = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return rows.map((row) => ({
      firstName: row.firstName ?? row.first_name ?? "",
      lastName: row.lastName ?? row.last_name ?? "",
      email: row.email,
      phone: row.phone,
      resumeUrl: row.resumeUrl ?? row.resume_url,
      skills: row.skills
        ? row.skills
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      experienceYears: row.experienceYears
        ? Number(row.experienceYears)
        : undefined,
      sourceJobTitle: row.jobTitle ?? row.job_title,
    }));
  }
}
