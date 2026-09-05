-- Align existing employee records with department-aware calendars.
-- Do not overwrite employees who already have an explicit department.

UPDATE "Employee" e
SET "departmentId" = d.id
FROM "User" u
JOIN "Department" d ON d."name" = 'Webisdom' AND d."deletedAt" IS NULL
WHERE e."userId" = u.id
  AND e."deletedAt" IS NULL
  AND e."departmentId" IS NULL
  AND lower(u.email) LIKE '%@webisdom.ai';

UPDATE "Employee" e
SET "departmentId" = d.id,
    "designationId" = COALESCE(e."designationId", des.id)
FROM "User" u
JOIN "UserRole" ur ON ur."userId" = u.id
JOIN "Role" r ON r.id = ur."roleId" AND r.name = 'HR_ADMIN'
JOIN "Department" d ON d."name" = 'Human Resources' AND d."deletedAt" IS NULL
LEFT JOIN "Designation" des ON des."departmentId" = d.id AND des."title" = 'HR Manager' AND des."deletedAt" IS NULL
WHERE e."userId" = u.id
  AND e."deletedAt" IS NULL
  AND (e."departmentId" IS NULL OR e."designationId" IS NULL);

-- Keep the standard Webisdom working calendar explicit: 1st and 3rd Saturdays work.
UPDATE "DepartmentPolicy" p
SET "saturdayWorkPattern" = 'FIRST_THIRD_WORKING'
FROM "Department" d
WHERE p."departmentId" = d.id
  AND d."name" = 'Webisdom'
  AND d."deletedAt" IS NULL;
