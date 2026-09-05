-- Normalize legacy human-readable designation IDs introduced by the 2026-09-03
-- designation seed migration. The Prisma model defines Designation.id as a UUID,
-- while the earlier seed used values such as seed-desig-web-seo-onpage.
-- Primary-key updates cascade to Employee and KRATemplate references.

DO $$
DECLARE
  designation_record RECORD;
  new_id TEXT;
BEGIN
  FOR designation_record IN
    SELECT id
    FROM "Designation"
    WHERE id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  LOOP
    new_id := substr(md5(designation_record.id), 1, 8) || '-' ||
              substr(md5(designation_record.id), 9, 4) || '-' ||
              '4' || substr(md5(designation_record.id), 14, 3) || '-' ||
              '8' || substr(md5(designation_record.id), 18, 3) || '-' ||
              substr(md5(designation_record.id), 21, 12);
    UPDATE "Designation"
    SET id = new_id
    WHERE id = designation_record.id;
  END LOOP;
END $$;
