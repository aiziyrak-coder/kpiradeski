-- Expand AI reports for flexible periods
ALTER TABLE "AiWeeklyReport" ADD COLUMN IF NOT EXISTS "periodEnd" DATE;
ALTER TABLE "AiWeeklyReport" ADD COLUMN IF NOT EXISTS "period" TEXT NOT NULL DEFAULT 'WEEK';

DROP INDEX IF EXISTS "AiWeeklyReport_weekStart_type_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AiWeeklyReport_weekStart_type_period_key"
  ON "AiWeeklyReport"("weekStart", "type", "period");
CREATE INDEX IF NOT EXISTS "AiWeeklyReport_period_weekStart_idx"
  ON "AiWeeklyReport"("period", "weekStart");
