-- Production hardening: centralized absence/DPR policy settings, tenant-owned leave types,
-- and nullable system actor for ATS activity logs.
ALTER TABLE "Organization"
  ADD COLUMN "attendanceAbsenceCutoffMinutes" INTEGER NOT NULL DEFAULT 720,
  ADD COLUMN "dprSlaMinutes" INTEGER NOT NULL DEFAULT 1320,
  ADD COLUMN "dprReminder1Minutes" INTEGER NOT NULL DEFAULT 1080,
  ADD COLUMN "dprReminder2Minutes" INTEGER NOT NULL DEFAULT 1200,
  ADD COLUMN "kraStrikeThresholdScore" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN "kraRollingWindowMonths" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "kraStrikesToEscalate" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "LeaveType" ADD COLUMN "organizationId" TEXT;
UPDATE "LeaveType" lt
SET "organizationId" = (SELECT id FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "organizationId" IS NULL;
ALTER TABLE "LeaveType" ALTER COLUMN "organizationId" SET NOT NULL;
CREATE INDEX "LeaveType_organizationId_idx" ON "LeaveType"("organizationId");
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateActivity" ALTER COLUMN "performedById" DROP NOT NULL;

ALTER TABLE "PolicyAcknowledgement" ADD COLUMN "policyVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Offer" ADD COLUMN "portalToken" TEXT;
UPDATE "Offer" SET "portalToken" = md5(random()::text || clock_timestamp()::text) WHERE "portalToken" IS NULL;
ALTER TABLE "Offer" ALTER COLUMN "portalToken" SET NOT NULL;
CREATE UNIQUE INDEX "Offer_portalToken_key" ON "Offer"("portalToken");

ALTER TABLE "LeaveBalance" ADD COLUMN "lastAccruedAt" TIMESTAMP(3);

-- HR and Finance approval columns already exist in the baseline migration.
ALTER TABLE "JobRequisition" ADD COLUMN "leadershipApprovedById" TEXT;
