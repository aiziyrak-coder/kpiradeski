-- CreateEnum
CREATE TYPE "KpiInputType" AS ENUM ('GROUP', 'CHECKBOX', 'RATIO', 'NUMBER', 'NOTE_CHECK');

-- CreateEnum
CREATE TYPE "AiProofStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable Branch
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable BranchManager
CREATE TABLE "BranchManager" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BranchManager_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchManager_branchId_userId_key" ON "BranchManager"("branchId", "userId");
CREATE INDEX "BranchManager_userId_idx" ON "BranchManager"("userId");

ALTER TABLE "BranchManager" ADD CONSTRAINT "BranchManager_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchManager" ADD CONSTRAINT "BranchManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable KpiCatalogNode
CREATE TABLE "KpiCatalogNode" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "parentKey" TEXT,
    "titleUz" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "descriptionUz" TEXT,
    "descriptionRu" TEXT,
    "inputType" "KpiInputType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "proofRequired" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KpiCatalogNode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KpiCatalogNode_key_key" ON "KpiCatalogNode"("key");
CREATE INDEX "KpiCatalogNode_parentKey_sortOrder_idx" ON "KpiCatalogNode"("parentKey", "sortOrder");
CREATE INDEX "KpiCatalogNode_active_sortOrder_idx" ON "KpiCatalogNode"("active", "sortOrder");

-- CreateTable KpiDayEntry
CREATE TABLE "KpiDayEntry" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "value" JSONB,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KpiDayEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KpiDayEntry_branchId_date_nodeKey_key" ON "KpiDayEntry"("branchId", "date", "nodeKey");
CREATE INDEX "KpiDayEntry_branchId_date_idx" ON "KpiDayEntry"("branchId", "date");
CREATE INDEX "KpiDayEntry_nodeKey_idx" ON "KpiDayEntry"("nodeKey");

ALTER TABLE "KpiDayEntry" ADD CONSTRAINT "KpiDayEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KpiDayEntry" ADD CONSTRAINT "KpiDayEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable KpiProof
CREATE TABLE "KpiProof" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "aiStatus" "AiProofStatus" NOT NULL DEFAULT 'PENDING',
    "aiNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KpiProof_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KpiProof_entryId_aiStatus_idx" ON "KpiProof"("entryId", "aiStatus");

ALTER TABLE "KpiProof" ADD CONSTRAINT "KpiProof_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "KpiDayEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KpiProof" ADD CONSTRAINT "KpiProof_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Alter DailyScore: drop unique date, add branchId
ALTER TABLE "DailyScore" DROP CONSTRAINT IF EXISTS "DailyScore_date_key";
ALTER TABLE "DailyScore" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

ALTER TABLE "DailyScore" ADD CONSTRAINT "DailyScore_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "DailyScore_branchId_date_key" ON "DailyScore"("branchId", "date");
CREATE INDEX IF NOT EXISTS "DailyScore_branchId_date_idx" ON "DailyScore"("branchId", "date");
