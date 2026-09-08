CREATE TYPE "KRACommitmentStatus" AS ENUM ('ACTIVE', 'SUBMITTED', 'COMPLETED', 'PARTIAL', 'CANCELLED');

CREATE TABLE "KRACommitment" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "periodMonth" INTEGER NOT NULL,
  "periodYear" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "targetValue" DECIMAL(14,2),
  "targetUnit" TEXT,
  "dueDate" TIMESTAMP(3),
  "completionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "status" "KRACommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "employeeNote" TEXT,
  "evidence" TEXT,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KRACommitment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KRACommitment_employeeId_periodYear_periodMonth_idx" ON "KRACommitment"("employeeId", "periodYear", "periodMonth");
CREATE INDEX "KRACommitment_templateId_periodYear_periodMonth_idx" ON "KRACommitment"("templateId", "periodYear", "periodMonth");
ALTER TABLE "KRACommitment" ADD CONSTRAINT "KRACommitment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KRACommitment" ADD CONSTRAINT "KRACommitment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KRATemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
