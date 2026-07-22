-- CreateTable
CREATE TABLE "KpiTaskAssignment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "frequency" "KpiFrequency" NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "assignedById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiTaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KpiTaskAssignment_branchId_date_frequency_idx" ON "KpiTaskAssignment"("branchId", "date", "frequency");

-- CreateIndex
CREATE INDEX "KpiTaskAssignment_assignedById_idx" ON "KpiTaskAssignment"("assignedById");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTaskAssignment_branchId_date_nodeKey_key" ON "KpiTaskAssignment"("branchId", "date", "nodeKey");

-- AddForeignKey
ALTER TABLE "KpiTaskAssignment" ADD CONSTRAINT "KpiTaskAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTaskAssignment" ADD CONSTRAINT "KpiTaskAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
