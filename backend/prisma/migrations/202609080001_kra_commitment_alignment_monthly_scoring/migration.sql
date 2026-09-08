ALTER TABLE "KRACommitment"
  ADD COLUMN IF NOT EXISTS "metricId" TEXT,
  ADD COLUMN IF NOT EXISTS "alignmentStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
  ADD COLUMN IF NOT EXISTS "alignmentScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "alignmentReason" TEXT,
  ADD COLUMN IF NOT EXISTS "alignmentCheckedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "KRACommitment_metricId_idx" ON "KRACommitment"("metricId");
CREATE INDEX IF NOT EXISTS "KRACommitment_alignmentStatus_idx" ON "KRACommitment"("alignmentStatus");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KRACommitment_metricId_fkey') THEN
    ALTER TABLE "KRACommitment"
      ADD CONSTRAINT "KRACommitment_metricId_fkey"
      FOREIGN KEY ("metricId") REFERENCES "KRAItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- The old application seeded a generic/default KRA that was not designation-specific.
-- New deployments must start with an empty KRA library so HR explicitly configures
-- result-driven metrics for every designation. Only known seed template IDs are removed.
DELETE FROM "KRAItem"
WHERE "templateId" IN (
  SELECT "id" FROM "KRATemplate"
  WHERE "id" IN (
    'seed-default-template','kra-digital-leadgen','kra-digital-qc','kra-seo-onpage',
    'kra-seo-offpage','kra-seo-offpage-lead','kra-seo-analyst','kra-social-media',
    'kra-digital-analyst-intern','kra-designer','kra-client-servicing','kra-bd-team'
  )
);
DELETE FROM "KRACommitment"
WHERE "templateId" IN (
  SELECT "id" FROM "KRATemplate"
  WHERE "id" IN (
    'seed-default-template','kra-digital-leadgen','kra-digital-qc','kra-seo-onpage',
    'kra-seo-offpage','kra-seo-offpage-lead','kra-seo-analyst','kra-social-media',
    'kra-digital-analyst-intern','kra-designer','kra-client-servicing','kra-bd-team'
  )
);
DELETE FROM "Strike"
WHERE "kraScoreId" IN (
  SELECT "id" FROM "KRAScore" WHERE "templateId" IN (
    SELECT "id" FROM "KRATemplate" WHERE "id" IN (
      'seed-default-template','kra-digital-leadgen','kra-digital-qc','kra-seo-onpage',
      'kra-seo-offpage','kra-seo-offpage-lead','kra-seo-analyst','kra-social-media',
      'kra-digital-analyst-intern','kra-designer','kra-client-servicing','kra-bd-team'
    )
  )
);

DELETE FROM "KRAScore"
WHERE "templateId" IN (
  SELECT "id" FROM "KRATemplate"
  WHERE "id" IN (
    'seed-default-template','kra-digital-leadgen','kra-digital-qc','kra-seo-onpage',
    'kra-seo-offpage','kra-seo-offpage-lead','kra-seo-analyst','kra-social-media',
    'kra-digital-analyst-intern','kra-designer','kra-client-servicing','kra-bd-team'
  )
);
DELETE FROM "KRADailyScore"
WHERE "templateId" IN (
  SELECT "id" FROM "KRATemplate"
  WHERE "id" IN (
    'seed-default-template','kra-digital-leadgen','kra-digital-qc','kra-seo-onpage',
    'kra-seo-offpage','kra-seo-offpage-lead','kra-seo-analyst','kra-social-media',
    'kra-digital-analyst-intern','kra-designer','kra-client-servicing','kra-bd-team'
  )
);
DELETE FROM "KRATemplate"
WHERE "id" IN (
  'seed-default-template','kra-digital-leadgen','kra-digital-qc','kra-seo-onpage',
  'kra-seo-offpage','kra-seo-offpage-lead','kra-seo-analyst','kra-social-media',
  'kra-digital-analyst-intern','kra-designer','kra-client-servicing','kra-bd-team'
);
