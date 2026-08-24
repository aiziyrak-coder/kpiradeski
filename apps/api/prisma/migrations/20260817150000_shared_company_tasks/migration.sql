-- Company-wide KPI tasks (SEO/SMM/site) complete once for all branches
ALTER TABLE "KpiCatalogNode" ADD COLUMN IF NOT EXISTS "sharedAcrossBranches" BOOLEAN NOT NULL DEFAULT false;

UPDATE "KpiCatalogNode"
SET "sharedAcrossBranches" = true
WHERE "inputType" <> 'GROUP'
  AND (
    "key" LIKE 'smm.%'
    OR "key" LIKE 'smm_w.%'
    OR "key" LIKE 'smm_m.%'
    OR "key" LIKE 'marketing_w.%'
    OR "key" LIKE 'marketing_m.%'
  );
