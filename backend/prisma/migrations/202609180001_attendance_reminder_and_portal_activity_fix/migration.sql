-- Separate morning attendance reminder from the later auto-absence cutoff.
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "attendanceReminderMinutes" INTEGER NOT NULL DEFAULT 571;

-- Prevent duplicate morning reminders for the same employee/day.
ALTER TABLE "WorkDay"
  ADD COLUMN IF NOT EXISTS "attendanceReminderSentAt" TIMESTAMP(3);

-- Existing production department/organization policies previously had no separate
-- reminder setting. Keep the existing auto-absence/check-in cutoff unchanged and
-- initialize the new reminder to 09:31 Asia/Kolkata (571 minutes).
UPDATE "Organization"
SET "attendanceReminderMinutes" = 571
WHERE "attendanceReminderMinutes" IS NULL OR "attendanceReminderMinutes" < 0 OR "attendanceReminderMinutes" > 1439;


-- Repair legacy department policies that could trigger the old absence email at midnight.
-- The 09:31 reminder is now separate; auto-absence remains at 13:00 by default.
UPDATE "DepartmentPolicy"
SET "autoAbsentMinutes" = 780
WHERE "autoAbsentMinutes" < "officeStartMinutes";

UPDATE "DepartmentPolicy"
SET "checkInCutoffMinutes" = 780
WHERE "checkInCutoffMinutes" < "officeStartMinutes";
