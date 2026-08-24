-- AlterTable BranchEmployee: individual schedules (kelish/ketish, work days, Saturday)
ALTER TABLE "BranchEmployee" ADD COLUMN IF NOT EXISTS "position" TEXT;
ALTER TABLE "BranchEmployee" ADD COLUMN IF NOT EXISTS "expectedLeaveMin" INTEGER;
ALTER TABLE "BranchEmployee" ADD COLUMN IF NOT EXISTS "workDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6';
ALTER TABLE "BranchEmployee" ADD COLUMN IF NOT EXISTS "satArriveMin" INTEGER;
ALTER TABLE "BranchEmployee" ADD COLUMN IF NOT EXISTS "satLeaveMin" INTEGER;
