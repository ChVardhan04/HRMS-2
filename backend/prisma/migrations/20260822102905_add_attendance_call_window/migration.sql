-- DropForeignKey
ALTER TABLE "CandidateActivity" DROP CONSTRAINT "CandidateActivity_performedById_fkey";

-- DropIndex
DROP INDEX "Employee_skipLevelManagerId_idx";

-- AlterTable
ALTER TABLE "JobRequisition" ADD COLUMN     "financeApprovedById" TEXT,
ADD COLUMN     "hrApprovedById" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "attendanceCallEndMinutes" INTEGER NOT NULL DEFAULT 570,
ADD COLUMN     "attendanceCallStartMinutes" INTEGER NOT NULL DEFAULT 555;

-- AlterTable
ALTER TABLE "PolicyAcknowledgement" ALTER COLUMN "policyVersion" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "CandidateActivity" ADD CONSTRAINT "CandidateActivity_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
