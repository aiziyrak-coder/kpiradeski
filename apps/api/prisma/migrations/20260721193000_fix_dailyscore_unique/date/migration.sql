-- Drop leftover unique-on-date index (Prisma created INDEX, not CONSTRAINT)
DROP INDEX IF EXISTS "DailyScore_date_key";

-- Attach orphan scores to main branch when possible
UPDATE "DailyScore" ds
SET "branchId" = b.id
FROM "Branch" b
WHERE ds."branchId" IS NULL
  AND b.id = 'branch-main';

UPDATE "DailyScore" ds
SET "branchId" = b.id
FROM (
  SELECT id FROM "Branch" WHERE active = true ORDER BY "createdAt" ASC LIMIT 1
) b
WHERE ds."branchId" IS NULL;
