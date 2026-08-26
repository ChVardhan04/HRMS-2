import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CandidateSource, CandidateStage, RoleName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_ADAPTER, StorageAdapter } from "../integrations/storage/storage-adapter.interface";
import { Inject } from "@nestjs/common";
import { randomUUID } from "crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

@Injectable()
export class AtsScreeningService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private storage: StorageAdapter,
  ) {}

  async screenResume(
    jobPostingId: string,
    file: Express.Multer.File,
    actor: { employeeId?: string; roles: string[] },
    fields: { firstName?: string; lastName?: string; email?: string; phone?: string; source?: string },
  ) {
    if (!actor.roles.includes(RoleName.HR_ADMIN) && !actor.roles.includes(RoleName.SUPER_ADMIN)) {
      throw new BadRequestException("Only HR can screen resumes");
    }
    if (!file) throw new BadRequestException("Resume file is required");
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException("Resume must be PDF, DOC or DOCX");
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException("Resume must be 5 MB or smaller");

    const posting = await this.prisma.jobPosting.findUnique({
      where: { id: jobPostingId },
      include: { requisition: true },
    });
    if (!posting) throw new NotFoundException("Job posting not found");
    if (!posting.isPublished && posting.requisition.status !== "OPEN") {
      throw new BadRequestException("Select an open job before screening a resume");
    }

    const resumeText = await this.extractText(file);
    const parsed = this.parseResume(resumeText);
    const email = (fields.email || parsed.email || "").trim().toLowerCase();
    if (!email) throw new BadRequestException("Could not find an email in the resume. Enter the candidate email manually.");

    const firstName = fields.firstName?.trim() || parsed.firstName || "Candidate";
    const lastName = fields.lastName?.trim() || parsed.lastName || "Applicant";
    const phone = fields.phone?.trim() || parsed.phone;
    const skills = this.detectSkills(resumeText, posting.requisition.skillsRequired || []);
    const experienceYears = parsed.experienceYears;

    const existing = await this.prisma.candidate.findFirst({ where: { email } });
    const candidate = existing
      ? existing
      : await this.prisma.candidate.create({
          data: {
            firstName,
            lastName,
            email,
            phone,
            skills,
            experienceYears,
            source: (fields.source as CandidateSource) || CandidateSource.OTHER,
            currentStage: CandidateStage.RESUME_SCREEN,
            recruiterId: actor.employeeId,
          },
        });

    const resumeKey = `candidates/${candidate.id}/resume/${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const uploaded = await this.storage.upload({ key: resumeKey, body: file.buffer, contentType: file.mimetype });

    const screening = this.calculateScore({
      resumeText,
      candidateSkills: skills,
      experienceYears,
      jobDescription: posting.requisition.jobDescription || "",
      requiredSkills: posting.requisition.skillsRequired || [],
      seniority: posting.requisition.seniority || "",
    });

    const updatedCandidate = await this.prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        firstName,
        lastName,
        phone,
        skills,
        experienceYears,
        resumeStorageKey: uploaded.key,
        resumeText,
        currentStage: CandidateStage.RESUME_SCREEN,
        recruiterId: actor.employeeId || candidate.recruiterId,
      },
    });

    await this.prisma.jobApplication.upsert({
      where: { candidateId_jobPostingId: { candidateId: candidate.id, jobPostingId: posting.id } },
      create: { candidateId: candidate.id, jobPostingId: posting.id },
      update: {},
    });

    const result = await this.prisma.atsScreeningResult.upsert({
      where: { candidateId_jobPostingId: { candidateId: candidate.id, jobPostingId: posting.id } },
      create: {
        candidateId: candidate.id,
        jobPostingId: posting.id,
        atsScore: screening.atsScore,
        skillsScore: screening.skillsScore,
        experienceScore: screening.experienceScore,
        educationScore: screening.educationScore,
        matchedSkills: screening.matchedSkills,
        missingSkills: screening.missingSkills,
        recommendation: screening.recommendation,
        resumeText,
        aiAnalysis: { engine: "deterministic-jd-match-v1", rationale: screening.rationale },
        screenedById: actor.employeeId,
      },
      update: {
        atsScore: screening.atsScore,
        skillsScore: screening.skillsScore,
        experienceScore: screening.experienceScore,
        educationScore: screening.educationScore,
        matchedSkills: screening.matchedSkills,
        missingSkills: screening.missingSkills,
        recommendation: screening.recommendation,
        resumeText,
        aiAnalysis: { engine: "deterministic-jd-match-v1", rationale: screening.rationale },
        screenedById: actor.employeeId,
        screenedAt: new Date(),
      },
    });

    await this.prisma.candidateActivity.create({
      data: {
        candidateId: candidate.id,
        performedById: actor.employeeId,
        type: "RESUME_SCREENED",
        body: `ATS score ${screening.atsScore}% for ${posting.requisition.title}. ${screening.recommendation}`,
      },
    });

    return {
      candidate: updatedCandidate,
      application: { jobPostingId: posting.id, title: posting.requisition.title },
      screening: result,
    };
  }

  private async extractText(file: Express.Multer.File) {
    try {
      if (file.mimetype === "application/pdf") {
        const parsed = await pdfParse(file.buffer);
        return parsed.text.replace(/\s+/g, " ").trim();
      }
      if (file.mimetype.includes("wordprocessingml.document")) {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value.replace(/\s+/g, " ").trim();
      }
      return file.buffer.toString("utf8").replace(/\s+/g, " ").trim();
    } catch {
      throw new BadRequestException("Unable to read the resume. Please upload a valid PDF or DOCX file.");
    }
  }

  private parseResume(text: string) {
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    const phone = text.match(/(?:\+91[-\s]?)?[6-9]\d{9}\b/)?.[0];
    const experienceMatch = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs)/i);
    const experienceYears = experienceMatch ? Number(experienceMatch[1]) : undefined;
    const firstLine = text.split(/\n|\.|,/).map((x) => x.trim()).find((x) => x.length > 2 && x.length < 60) || "Candidate Applicant";
    const parts = firstLine.split(/\s+/).filter(Boolean);
    return { email, phone, experienceYears, firstName: parts[0], lastName: parts.slice(1).join(" ") || "Applicant" };
  }

  private detectSkills(text: string, requiredSkills: string[]) {
    const lower = text.toLowerCase();
    const common = ["java", "spring boot", "spring", "react", "react.js", "typescript", "javascript", "python", "sql", "postgresql", "mysql", "mongodb", "node.js", "node", "aws", "azure", "gcp", "docker", "kubernetes", "git", "rest", "rest api", "html", "css", "next.js", "nestjs", "prisma", "redis", "kafka", "microservices", "machine learning", "tensorflow", "pytorch"];
    return [...new Set([...requiredSkills, ...common].filter((skill) => lower.includes(skill.toLowerCase())))];
  }

  private calculateScore(input: { resumeText: string; candidateSkills: string[]; jobDescription: string; requiredSkills: string[]; experienceYears?: number; seniority: string }) {
    const text = input.resumeText.toLowerCase();
    const required = [...new Set(input.requiredSkills.map((s) => s.trim()).filter(Boolean))];
    const matchedSkills = required.filter((skill) => text.includes(skill.toLowerCase()));
    const missingSkills = required.filter((skill) => !text.includes(skill.toLowerCase()));
    const skillsScore = required.length ? (matchedSkills.length / required.length) * 100 : 70;

    const expRequirement = `${input.seniority} ${input.jobDescription}`.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years|yrs)/i);
    let experienceScore = 75;
    if (expRequirement && input.experienceYears != null) {
      const min = Number(expRequirement[1]);
      const max = Number(expRequirement[2]);
      experienceScore = input.experienceYears >= min ? (input.experienceYears > max ? 100 : 90) : Math.max(0, (input.experienceYears / min) * 80);
    } else if (input.experienceYears != null) {
      experienceScore = Math.min(100, 60 + input.experienceYears * 10);
    }

    const educationTerms = ["b.tech", "btech", "b.e", "be ", "b.sc", "bsc", "m.tech", "mtech", "mca", "bca", "bachelor", "master", "computer science", "engineering"];
    const jdEducation = educationTerms.filter((x) => `${input.jobDescription} ${input.seniority}`.toLowerCase().includes(x));
    const educationScore = jdEducation.length ? (jdEducation.some((x) => text.includes(x.trim())) ? 100 : 30) : 75;

    const atsScore = Number((skillsScore * 0.55 + experienceScore * 0.30 + educationScore * 0.15).toFixed(2));
    const recommendation = atsScore >= 80 ? "Strong match — shortlist for HR review" : atsScore >= 65 ? "Moderate match — review resume manually" : "Low match — review gaps before progressing";
    return {
      atsScore,
      skillsScore: Number(skillsScore.toFixed(2)),
      experienceScore: Number(experienceScore.toFixed(2)),
      educationScore: Number(educationScore.toFixed(2)),
      matchedSkills,
      missingSkills,
      recommendation,
      rationale: { weights: { skills: 55, experience: 30, education: 15 }, matchedSkills, missingSkills },
    };
  }
}
