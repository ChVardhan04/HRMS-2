ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS "officeStartMinutes" INTEGER NOT NULL DEFAULT 570,
  ADD COLUMN IF NOT EXISTS "officeEndMinutes" INTEGER NOT NULL DEFAULT 1140,
  ADD COLUMN IF NOT EXISTS "lunchStartMinutes" INTEGER NOT NULL DEFAULT 810,
  ADD COLUMN IF NOT EXISTS "lunchEndMinutes" INTEGER NOT NULL DEFAULT 840,
  ADD COLUMN IF NOT EXISTS "lateGraceMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "attendanceCallStartMinutes" INTEGER NOT NULL DEFAULT 555,
  ADD COLUMN IF NOT EXISTS "attendanceCallEndMinutes" INTEGER NOT NULL DEFAULT 570,
  ADD COLUMN IF NOT EXISTS "attendanceAbsenceCutoffMinutes" INTEGER NOT NULL DEFAULT 780,
  ADD COLUMN IF NOT EXISTS "dprSlaMinutes" INTEGER NOT NULL DEFAULT 1320,
  ADD COLUMN IF NOT EXISTS "dprReminder1Minutes" INTEGER NOT NULL DEFAULT 1080,
  ADD COLUMN IF NOT EXISTS "dprReminder2Minutes" INTEGER NOT NULL DEFAULT 1200,
  ADD COLUMN IF NOT EXISTS "kraStrikeThresholdScore" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS "kraRollingWindowMonths" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS "kraStrikesToEscalate" INTEGER NOT NULL DEFAULT 3;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SaturdayWorkPattern') THEN
    CREATE TYPE "SaturdayWorkPattern" AS ENUM ('FIRST_THIRD_WORKING', 'ALL_SATURDAYS_WORKING', 'ALL_SATURDAYS_OFF', 'SECOND_FOURTH_WORKING');
  END IF;
END $$;

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "saturdayWorkPattern" "SaturdayWorkPattern" NOT NULL DEFAULT 'FIRST_THIRD_WORKING';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='AttendanceStatus' AND e.enumlabel='WORK_FROM_HOME') THEN
    ALTER TYPE "AttendanceStatus" ADD VALUE 'WORK_FROM_HOME';
  END IF;
END $$;

ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "skipLevelManagerId" TEXT,
  ADD COLUMN IF NOT EXISTS "monthlySalary" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "salaryCurrency" TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS "payrollEligible" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "Employee_skipLevelManagerId_idx" ON "Employee"("skipLevelManagerId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Employee_skipLevelManagerId_fkey') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_skipLevelManagerId_fkey" FOREIGN KEY ("skipLevelManagerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KRACommitmentStatus') THEN
    CREATE TYPE "KRACommitmentStatus" AS ENUM ('ACTIVE', 'SUBMITTED', 'COMPLETED', 'PARTIAL', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "KRACommitment" (
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

CREATE INDEX IF NOT EXISTS "KRACommitment_employeeId_periodYear_periodMonth_idx" ON "KRACommitment"("employeeId", "periodYear", "periodMonth");
CREATE INDEX IF NOT EXISTS "KRACommitment_templateId_periodYear_periodMonth_idx" ON "KRACommitment"("templateId", "periodYear", "periodMonth");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='KRACommitment_employeeId_fkey') THEN
    ALTER TABLE "KRACommitment" ADD CONSTRAINT "KRACommitment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='KRACommitment_templateId_fkey') THEN
    ALTER TABLE "KRACommitment" ADD CONSTRAINT "KRACommitment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KRATemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
