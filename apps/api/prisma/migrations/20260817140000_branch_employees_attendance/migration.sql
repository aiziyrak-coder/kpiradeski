-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AttendanceStatus" AS ENUM ('PENDING', 'ON_TIME', 'LATE', 'ABSENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BranchEmployee" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "photoPath" TEXT NOT NULL,
    "expectedArriveMin" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchEmployee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmployeeAttendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "arrivedAt" TIMESTAMP(3),
    "expectedMin" INTEGER NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PENDING',
    "scanPath" TEXT,
    "livenessOk" BOOLEAN NOT NULL DEFAULT false,
    "matchScore" INTEGER,
    "scannedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAttendance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BranchEmployee_branchId_active_idx" ON "BranchEmployee"("branchId", "active");
CREATE INDEX IF NOT EXISTS "BranchEmployee_lastName_firstName_idx" ON "BranchEmployee"("lastName", "firstName");
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeAttendance_employeeId_date_key" ON "EmployeeAttendance"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "EmployeeAttendance_branchId_date_idx" ON "EmployeeAttendance"("branchId", "date");
CREATE INDEX IF NOT EXISTS "EmployeeAttendance_status_date_idx" ON "EmployeeAttendance"("status", "date");

ALTER TABLE "BranchEmployee" DROP CONSTRAINT IF EXISTS "BranchEmployee_branchId_fkey";
ALTER TABLE "BranchEmployee"
  ADD CONSTRAINT "BranchEmployee_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeAttendance" DROP CONSTRAINT IF EXISTS "EmployeeAttendance_employeeId_fkey";
ALTER TABLE "EmployeeAttendance"
  ADD CONSTRAINT "EmployeeAttendance_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "BranchEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeAttendance" DROP CONSTRAINT IF EXISTS "EmployeeAttendance_branchId_fkey";
ALTER TABLE "EmployeeAttendance"
  ADD CONSTRAINT "EmployeeAttendance_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeAttendance" DROP CONSTRAINT IF EXISTS "EmployeeAttendance_scannedById_fkey";
ALTER TABLE "EmployeeAttendance"
  ADD CONSTRAINT "EmployeeAttendance_scannedById_fkey"
  FOREIGN KEY ("scannedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
