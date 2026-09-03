-- AI-driven daily KRA snapshots, designation library, and HR profile calendar alignment.

CREATE TABLE "KRADailyScore" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "breakdown" JSONB NOT NULL,
  "evidence" JSONB,
  "finalScore" DECIMAL(5,2) NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KRADailyScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KRADailyScore_employeeId_date_key" ON "KRADailyScore"("employeeId", "date");
CREATE INDEX "KRADailyScore_templateId_date_idx" ON "KRADailyScore"("templateId", "date");
ALTER TABLE "KRADailyScore" ADD CONSTRAINT "KRADailyScore_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KRADailyScore" ADD CONSTRAINT "KRADailyScore_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KRATemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed practical designation choices without overwriting HR-created designations.
-- These are department-scoped, so the same title can exist in different departments.
INSERT INTO "Designation" ("id", "title", "departmentId")
SELECT v.id, v.title, d.id
FROM (VALUES
  ('seed-desig-hr-manager', 'HR Manager', 'Human Resources'),
  ('seed-desig-hr-executive', 'HR Executive', 'Human Resources'),
  ('seed-desig-web-digital-leadgen', 'Digital Analyst & Lead Generation Intern', 'Webisdom'),
  ('seed-desig-web-digital-qc', 'Digital Quality Check Team', 'Webisdom'),
  ('seed-desig-web-seo-onpage', 'SEO Onpage', 'Webisdom'),
  ('seed-desig-web-seo-offpage', 'SEO Off Page', 'Webisdom'),
  ('seed-desig-web-seo-offpage-lead', 'SEO Off Page Team Lead', 'Webisdom'),
  ('seed-desig-web-seo-analyst', 'SEO Analyst', 'Webisdom'),
  ('seed-desig-web-social-media', 'Social Media', 'Webisdom'),
  ('seed-desig-web-digital-intern', 'Digital Analyst Intern', 'Webisdom'),
  ('seed-desig-web-designer', 'Designer', 'Webisdom'),
  ('seed-desig-web-client-servicing', 'Client Servicing & Project Handling', 'Webisdom'),
  ('seed-desig-web-bd-team', 'BD Team', 'Webisdom'),
  ('seed-desig-nam-general', 'General Employee', 'Namandarshan'),
  ('seed-desig-training-general', 'General Employee', 'Traininglobe'),
  ('seed-desig-dentedge-general', 'General Employee', 'Dentedge'),
  ('seed-desig-perfecto-general', 'General Employee', 'Perfecto')
) AS v(id, title, department_name)
JOIN "Department" d ON d."name" = v.department_name AND d."deletedAt" IS NULL
ON CONFLICT ("departmentId", "title") DO NOTHING;

-- Attach the HR profile to its department so the calendar is department-aware.
UPDATE "Employee" e
SET "departmentId" = d.id,
    "designationId" = des.id
FROM "User" u
JOIN "UserRole" ur ON ur."userId" = u.id
JOIN "Role" r ON r.id = ur."roleId" AND r.name = 'HR_ADMIN'
JOIN "Department" d ON d."name" = 'Human Resources' AND d."deletedAt" IS NULL
JOIN "Designation" des ON des."departmentId" = d.id AND des."title" = 'HR Manager'
WHERE e."userId" = u.id AND e."deletedAt" IS NULL;

-- Existing KRA templates supplied by HR are designation-specific for Webisdom.
UPDATE "KRATemplate" t
SET "departmentId" = d.id,
    "designationId" = des.id
FROM "Department" d
JOIN "Designation" des ON des."departmentId" = d.id
WHERE d."name" = 'Webisdom'
  AND des."title" = t."roleName"
  AND t."roleName" IN (
    'Digital Analyst & Lead Generation Intern',
    'Digital Quality Check Team',
    'SEO Onpage',
    'SEO Off Page',
    'SEO Off Page Team Lead',
    'SEO Analyst',
    'Social Media',
    'Digital Analyst Intern',
    'Designer',
    'Client Servicing & Project Handling',
    'BD Team'
  );


-- The current HR attendance rule is: late only after 10:30 AM, with the first
-- two lates allowed and one monthly day deduction once the employee reaches
-- three or more lates. Existing default department policies are aligned here.
UPDATE "DepartmentPolicy" SET "lateAfterMinutes" = 630 WHERE "lateAfterMinutes" = 600;
ALTER TABLE "DepartmentPolicy" ALTER COLUMN "lateAfterMinutes" SET DEFAULT 630;
ALTER TABLE "DepartmentPolicy" ALTER COLUMN "firstLatePenaltyDays" SET DEFAULT 0;
ALTER TABLE "DepartmentPolicy" ALTER COLUMN "secondLatePenaltyDays" SET DEFAULT 0;
ALTER TABLE "Organization" ALTER COLUMN "lateGraceMinutes" SET DEFAULT 60;
UPDATE "Organization" SET "lateGraceMinutes" = 60 WHERE "lateGraceMinutes" = 30;

UPDATE "DepartmentPolicy" SET "firstLatePenaltyDays" = 0, "secondLatePenaltyDays" = 0, "thirdPlusLatePenaltyDays" = 1 WHERE "allowedLatesPerMonth" = 2;

-- Reconcile existing attendance rows with the new 10:30 AM late threshold.
UPDATE "WorkDay"
SET "isLate" = false,
    "lateCountInMonth" = NULL,
    "latePenaltyDays" = 0,
    "attendanceStatus" = 'PRESENT'
WHERE "isLate" = true
  AND "checkInAt" IS NOT NULL
  AND (("checkInAt" + INTERVAL '5 hours 30 minutes')::time <= TIME '10:30');
