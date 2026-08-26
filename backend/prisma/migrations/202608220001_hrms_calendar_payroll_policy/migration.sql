-- HRMS real-world calendar, pay-attendance reporting, WFH and policy support.
CREATE TYPE "SaturdayWorkPattern" AS ENUM ('FIRST_THIRD_WORKING', 'ALL_SATURDAYS_WORKING', 'ALL_SATURDAYS_OFF', 'SECOND_FOURTH_WORKING');
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'WORK_FROM_HOME';

ALTER TABLE "Organization"
  ADD COLUMN "officeStartMinutes" INTEGER NOT NULL DEFAULT 570,
  ADD COLUMN "officeEndMinutes" INTEGER NOT NULL DEFAULT 1140,
  ADD COLUMN "lunchStartMinutes" INTEGER NOT NULL DEFAULT 810,
  ADD COLUMN "lunchEndMinutes" INTEGER NOT NULL DEFAULT 840,
  ADD COLUMN "lateGraceMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "saturdayWorkPattern" "SaturdayWorkPattern" NOT NULL DEFAULT 'FIRST_THIRD_WORKING';

ALTER TABLE "Organization" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Kolkata';

ALTER TABLE "Employee"
  ADD COLUMN "skipLevelManagerId" TEXT,
  ADD COLUMN "monthlySalary" DECIMAL(12,2),
  ADD COLUMN "salaryCurrency" TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN "payrollEligible" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "Policy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "documentId" TEXT,
  "fileName" TEXT,
  "storageKey" TEXT,
  "effectiveFrom" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Policy_organizationId_isActive_idx" ON "Policy"("organizationId", "isActive");
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PolicyAcknowledgement" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  CONSTRAINT "PolicyAcknowledgement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PolicyAcknowledgement_policyId_employeeId_key" ON "PolicyAcknowledgement"("policyId", "employeeId");
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_skipLevelManagerId_fkey" FOREIGN KEY ("skipLevelManagerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Employee_skipLevelManagerId_idx" ON "Employee"("skipLevelManagerId");
