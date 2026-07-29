-- Separate DailyScore rows by frequency so DAILY/WEEKLY/MONTHLY (and LEGACY) do not overwrite each other.
ALTER TABLE "DailyScore" ADD COLUMN IF NOT EXISTS "frequency" TEXT NOT NULL DEFAULT 'DAILY';

-- Null branch rows caused cross-branch hijacks; drop them.
DELETE FROM "DailyScore" WHERE "branchId" IS NULL;

DROP INDEX IF EXISTS "DailyScore_branchId_date_key";

CREATE UNIQUE INDEX IF NOT EXISTS "DailyScore_branchId_date_frequency_key"
  ON "DailyScore"("branchId", "date", "frequency");
