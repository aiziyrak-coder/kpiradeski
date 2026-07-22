-- CreateTable
CREATE TABLE "KpiAssignmentTemplate" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "frequency" "KpiFrequency" NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "assignedById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiAssignmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KpiAssignmentTemplate_branchId_frequency_active_idx" ON "KpiAssignmentTemplate"("branchId", "frequency", "active");

-- CreateIndex
CREATE INDEX "KpiAssignmentTemplate_assignedById_idx" ON "KpiAssignmentTemplate"("assignedById");

-- CreateIndex
CREATE UNIQUE INDEX "KpiAssignmentTemplate_branchId_frequency_nodeKey_key" ON "KpiAssignmentTemplate"("branchId", "frequency", "nodeKey");

-- AddForeignKey
ALTER TABLE "KpiAssignmentTemplate" ADD CONSTRAINT "KpiAssignmentTemplate_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiAssignmentTemplate" ADD CONSTRAINT "KpiAssignmentTemplate_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate existing date-based assignments into permanent templates
INSERT INTO "KpiAssignmentTemplate" ("id", "branchId", "frequency", "nodeKey", "assignedById", "active", "createdAt", "updatedAt")
SELECT DISTINCT ON ("branchId", "frequency", "nodeKey")
  gen_random_uuid()::text,
  "branchId",
  "frequency",
  "nodeKey",
  "assignedById",
  true,
  NOW(),
  NOW()
FROM "KpiTaskAssignment"
WHERE active = true
ORDER BY "branchId", "frequency", "nodeKey", "updatedAt" DESC
ON CONFLICT ("branchId", "frequency", "nodeKey") DO UPDATE SET active = true, "updatedAt" = NOW();
