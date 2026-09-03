-- Repair migration: some databases recorded the configurable-policy migration
-- without physically adding the DepartmentPolicy Saturday pattern column.
ALTER TABLE "DepartmentPolicy"
  ADD COLUMN IF NOT EXISTS "saturdayWorkPattern" "SaturdayWorkPattern" NOT NULL DEFAULT 'FIRST_THIRD_WORKING';
