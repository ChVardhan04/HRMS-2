-- HR-controlled department policies, advanced leave rules and configurable KRA.
CREATE TYPE "LeaveDurationType" AS ENUM ('FULL_DAY', 'FIRST_HALF', 'SECOND_HALF');
CREATE TYPE "KraMeasurementType" AS ENUM ('NUMBER', 'PERCENTAGE', 'BOOLEAN', 'RATING', 'REVENUE', 'MANUAL', 'AUTOMATED');

ALTER TABLE "Holiday" ADD COLUMN "audienceNote" TEXT;

ALTER TABLE "Employee"
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "emergencyContact" TEXT,
  ADD COLUMN "emergencyAddress" TEXT;

ALTER TABLE "WorkDay"
  ADD COLUMN "lateCountInMonth" INTEGER,
  ADD COLUMN "latePenaltyDays" DECIMAL(4,2) NOT NULL DEFAULT 0,
  ADD COLUMN "absenceNotifiedAt" TIMESTAMP(3);

CREATE TABLE "DepartmentPolicy" (
  "id" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "mondayWorking" BOOLEAN NOT NULL DEFAULT true,
  "tuesdayWorking" BOOLEAN NOT NULL DEFAULT true,
  "wednesdayWorking" BOOLEAN NOT NULL DEFAULT true,
  "thursdayWorking" BOOLEAN NOT NULL DEFAULT true,
  "fridayWorking" BOOLEAN NOT NULL DEFAULT true,
  "saturdayWorking" BOOLEAN NOT NULL DEFAULT false,
  "sundayWorking" BOOLEAN NOT NULL DEFAULT false,
  "officeStartMinutes" INTEGER NOT NULL DEFAULT 570,
  "officeEndMinutes" INTEGER NOT NULL DEFAULT 1110,
  "lunchStartMinutes" INTEGER NOT NULL DEFAULT 810,
  "lunchEndMinutes" INTEGER NOT NULL DEFAULT 840,
  "checkInOpenMinutes" INTEGER NOT NULL DEFAULT 570,
  "lateAfterMinutes" INTEGER NOT NULL DEFAULT 600,
  "halfDayAfterMinutes" INTEGER NOT NULL DEFAULT 645,
  "checkInCutoffMinutes" INTEGER NOT NULL DEFAULT 780,
  "autoAbsentMinutes" INTEGER NOT NULL DEFAULT 780,
  "allowedLatesPerMonth" INTEGER NOT NULL DEFAULT 2,
  "firstLatePenaltyDays" DECIMAL(4,2) NOT NULL DEFAULT 0.25,
  "secondLatePenaltyDays" DECIMAL(4,2) NOT NULL DEFAULT 0.50,
  "thirdPlusLatePenaltyDays" DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  "sandwichLeaveEnabled" BOOLEAN NOT NULL DEFAULT true,
  "sandwichIncludesPreviousWorkingDay" BOOLEAN NOT NULL DEFAULT true,
  "probationMonthlyLeaveLimit" DECIMAL(4,1) NOT NULL DEFAULT 1,
  "probationMaxDaysPerRequest" DECIMAL(4,1) NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DepartmentPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DepartmentPolicy_departmentId_key" ON "DepartmentPolicy"("departmentId");
ALTER TABLE "DepartmentPolicy" ADD CONSTRAINT "DepartmentPolicy_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DepartmentLeavePolicy" (
  "id" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "annualEntitlement" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "monthlyEntitlement" DECIMAL(5,2),
  "requiresBalance" BOOLEAN NOT NULL DEFAULT true,
  "advanceNoticeWorkingDays" INTEGER NOT NULL DEFAULT 0,
  "allowPostApproval" BOOLEAN NOT NULL DEFAULT false,
  "medicalCertificateAfterDays" DECIMAL(4,1),
  "sandwichApplies" BOOLEAN NOT NULL DEFAULT true,
  "maxConsecutiveDays" DECIMAL(4,1),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DepartmentLeavePolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DepartmentLeavePolicy_departmentId_leaveTypeId_key" ON "DepartmentLeavePolicy"("departmentId", "leaveTypeId");
CREATE INDEX "DepartmentLeavePolicy_leaveTypeId_idx" ON "DepartmentLeavePolicy"("leaveTypeId");
ALTER TABLE "DepartmentLeavePolicy" ADD CONSTRAINT "DepartmentLeavePolicy_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentLeavePolicy" ADD CONSTRAINT "DepartmentLeavePolicy_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest"
  ALTER COLUMN "numberOfDays" TYPE DECIMAL(5,1),
  ADD COLUMN "appliedWorkingDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN "sandwichDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN "durationType" "LeaveDurationType" NOT NULL DEFAULT 'FULL_DAY',
  ADD COLUMN "emergencyContact" TEXT,
  ADD COLUMN "emergencyAddress" TEXT,
  ADD COLUMN "medicalCertificateFileName" TEXT,
  ADD COLUMN "medicalCertificateStorageKey" TEXT,
  ADD COLUMN "medicalCertificateMimeType" TEXT,
  ADD COLUMN "policySnapshot" JSONB;

ALTER TABLE "KRATemplate"
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "designationId" TEXT,
  ADD COLUMN "name" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "KRATemplate_departmentId_idx" ON "KRATemplate"("departmentId");
CREATE INDEX "KRATemplate_designationId_idx" ON "KRATemplate"("designationId");
ALTER TABLE "KRATemplate" ADD CONSTRAINT "KRATemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KRATemplate" ADD CONSTRAINT "KRATemplate_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "KRAItem"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "measurementType" "KraMeasurementType" NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN "targetValue" DECIMAL(14,2),
  ADD COLUMN "targetText" TEXT,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Existing generic KRA data remains valid. Department policies/templates are seeded separately.

ALTER TABLE "DepartmentPolicy" ADD COLUMN "saturdayWorkPattern" "SaturdayWorkPattern" NOT NULL DEFAULT 'FIRST_THIRD_WORKING';
