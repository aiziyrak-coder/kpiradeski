-- AI hisobot: filial va tur boʻyicha alohida saqlansin (oldin bir-birini ustidan yozardi)
ALTER TABLE "AiWeeklyReport" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AiWeeklyReport" ADD COLUMN IF NOT EXISTS "branchId" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "AiWeeklyReport_weekStart_type_period_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AiWeeklyReport_weekStart_type_period_kind_branchId_key"
  ON "AiWeeklyReport"("weekStart", "type", "period", "kind", "branchId");
