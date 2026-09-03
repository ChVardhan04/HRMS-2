-- Default 2026 holiday calendar supplied by HR.
-- Optional religious-group holidays remain selectable/configurable by HR.
INSERT INTO "Holiday" ("id", "organizationId", "name", "date", "isOptional")
SELECT md5(o."id" || v."name" || v."date"), o."id", v."name", v."date"::date, v."isOptional"
FROM "Organization" o
CROSS JOIN (
  VALUES
    ('NEW YEAR', '2026-01-01', false),
    ('REPUBLIC DAY', '2026-01-26', false),
    ('HOLI', '2026-03-03', false),
    ('BAKRID (TO VALID RELIGIOUS GROUP)', '2026-05-27', true),
    ('INDEPENDENCE DAY', '2026-08-15', false),
    ('RAKSHA BANDHAN', '2026-08-28', false),
    ('MAHATMA GANDHI JAYANTI', '2026-10-02', false),
    ('VIJAYA DASHAMI/DUSSEHRA (TO VALID RELIGIOUS GROUP)', '2026-10-20', true),
    ('DEEPAWALI', '2026-11-08', false),
    ('CHRISTMAS', '2026-12-25', false)
) AS v("name", "date", "isOptional")
ON CONFLICT ("organizationId", "date", "name") DO NOTHING;
