CREATE TYPE "TodoEodStatus" AS ENUM ('PENDING', 'COMPLETED', 'INCOMPLETE');

ALTER TABLE "Todo"
  ADD COLUMN "eodStatus" "TodoEodStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "incompleteReason" TEXT,
  ADD COLUMN "completionOutputSummary" TEXT,
  ADD COLUMN "completionProofStorageKey" TEXT,
  ADD COLUMN "completionProofFileName" TEXT,
  ADD COLUMN "completionProofMimeType" TEXT,
  ADD COLUMN "completionProofSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "aiCompletionPercent" DECIMAL(5,2),
  ADD COLUMN "aiCompletionAnalysis" JSONB,
  ADD COLUMN "aiAnalyzedAt" TIMESTAMP(3),
  ADD COLUMN "eodResolvedAt" TIMESTAMP(3);
CREATE INDEX "Todo_assigneeId_eodStatus_idx" ON "Todo"("assigneeId", "eodStatus");

ALTER TABLE "Candidate" ADD COLUMN "resumeText" TEXT;

CREATE TABLE "AtsScreeningResult" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "jobPostingId" TEXT NOT NULL,
  "atsScore" DECIMAL(5,2) NOT NULL,
  "skillsScore" DECIMAL(5,2) NOT NULL,
  "experienceScore" DECIMAL(5,2) NOT NULL,
  "educationScore" DECIMAL(5,2) NOT NULL,
  "matchedSkills" TEXT[] NOT NULL,
  "missingSkills" TEXT[] NOT NULL,
  "recommendation" TEXT NOT NULL,
  "resumeText" TEXT,
  "aiAnalysis" JSONB,
  "screenedById" TEXT,
  "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AtsScreeningResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AtsScreeningResult_candidateId_jobPostingId_key" ON "AtsScreeningResult"("candidateId", "jobPostingId");
CREATE INDEX "AtsScreeningResult_jobPostingId_atsScore_idx" ON "AtsScreeningResult"("jobPostingId", "atsScore");
CREATE INDEX "AtsScreeningResult_candidateId_idx" ON "AtsScreeningResult"("candidateId");
ALTER TABLE "AtsScreeningResult" ADD CONSTRAINT "AtsScreeningResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsScreeningResult" ADD CONSTRAINT "AtsScreeningResult_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsScreeningResult" ADD CONSTRAINT "AtsScreeningResult_screenedById_fkey" FOREIGN KEY ("screenedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
