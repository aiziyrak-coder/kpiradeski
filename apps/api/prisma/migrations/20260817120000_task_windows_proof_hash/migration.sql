-- Time windows for tasks + proof content hash to block reused photos
ALTER TABLE "KpiCatalogNode" ADD COLUMN IF NOT EXISTS "windowStartMin" INTEGER;
ALTER TABLE "KpiCatalogNode" ADD COLUMN IF NOT EXISTS "windowEndMin" INTEGER;

ALTER TABLE "KpiProof" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
ALTER TABLE "KpiProof" ADD COLUMN IF NOT EXISTS "phash" TEXT;

CREATE INDEX IF NOT EXISTS "KpiProof_contentHash_idx" ON "KpiProof"("contentHash");
CREATE INDEX IF NOT EXISTS "KpiProof_phash_idx" ON "KpiProof"("phash");

-- Ertalabki ishlar: 08:00–10:00 (Toshkent)
UPDATE "KpiCatalogNode"
SET "windowStartMin" = 480, "windowEndMin" = 600
WHERE "inputType" <> 'GROUP'
  AND (
    "key" LIKE 'reception.morning.%'
    OR "key" LIKE '%.morning.%'
    OR "key" IN ('clinic.atmosphere.light', 'clinic.atmosphere.tv', 'clinic.atmosphere.music')
  );

-- Kechki ishlar: 18:00–21:00 (Toshkent)
UPDATE "KpiCatalogNode"
SET "windowStartMin" = 1080, "windowEndMin" = 1260
WHERE "inputType" <> 'GROUP'
  AND (
    "key" LIKE 'reception.evening.%'
    OR "key" LIKE '%.evening.%'
  );
