-- Keep the attendance absence/check-in cutoff aligned with the 1:00 PM policy.
ALTER TABLE "Organization"
  ALTER COLUMN "attendanceAbsenceCutoffMinutes" SET DEFAULT 780;

UPDATE "Organization"
SET "attendanceAbsenceCutoffMinutes" = 780
WHERE "attendanceAbsenceCutoffMinutes" = 720;
