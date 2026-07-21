-- Create Position table
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameUz" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Position_code_key" ON "Position"("code");
CREATE INDEX "Position_active_sortOrder_idx" ON "Position"("active", "sortOrder");

-- Default positions (from former enum)
INSERT INTO "Position" ("id", "code", "nameUz", "nameRu", "active", "sortOrder", "updatedAt") VALUES
('pos-clinic', 'CLINIC', 'Klinika admini', 'Администратор клиники', true, 1, CURRENT_TIMESTAMP),
('pos-reception', 'RECEPTION', 'Retsepshn', 'Ресепшн', true, 2, CURRENT_TIMESTAMP),
('pos-smm', 'SMM', 'SMM / kontent', 'SMM / контент', true, 3, CURRENT_TIMESTAMP),
('pos-warehouse', 'WAREHOUSE', 'Ombor', 'Склад', true, 4, CURRENT_TIMESTAMP),
('pos-marketing', 'MARKETING', 'Marketing', 'Маркетинг', true, 5, CURRENT_TIMESTAMP),
('pos-management', 'MANAGEMENT', 'Menejment', 'Менеджмент', true, 6, CURRENT_TIMESTAMP),
('pos-other', 'OTHER', 'Boshqa', 'Другое', true, 99, CURRENT_TIMESTAMP);

-- User: enum -> positionId
ALTER TABLE "User" ADD COLUMN "positionId" TEXT;

UPDATE "User" SET "positionId" = CASE "position"::text
  WHEN 'CLINIC' THEN 'pos-clinic'
  WHEN 'RECEPTION' THEN 'pos-reception'
  WHEN 'SMM' THEN 'pos-smm'
  WHEN 'WAREHOUSE' THEN 'pos-warehouse'
  WHEN 'MARKETING' THEN 'pos-marketing'
  WHEN 'MANAGEMENT' THEN 'pos-management'
  WHEN 'OTHER' THEN 'pos-other'
  ELSE NULL
END WHERE "position" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN "position";
ALTER TABLE "User" ADD CONSTRAINT "User_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TaskTemplate: enum -> positionId
ALTER TABLE "TaskTemplate" ADD COLUMN "positionId" TEXT;

UPDATE "TaskTemplate" SET "positionId" = CASE "position"::text
  WHEN 'CLINIC' THEN 'pos-clinic'
  WHEN 'RECEPTION' THEN 'pos-reception'
  WHEN 'SMM' THEN 'pos-smm'
  WHEN 'WAREHOUSE' THEN 'pos-warehouse'
  WHEN 'MARKETING' THEN 'pos-marketing'
  WHEN 'MANAGEMENT' THEN 'pos-management'
  WHEN 'OTHER' THEN 'pos-other'
  ELSE 'pos-other'
END;

ALTER TABLE "TaskTemplate" ALTER COLUMN "positionId" SET NOT NULL;
ALTER TABLE "TaskTemplate" DROP COLUMN "position";
DROP INDEX IF EXISTS "TaskTemplate_position_active_idx";
CREATE INDEX "TaskTemplate_positionId_active_idx" ON "TaskTemplate"("positionId", "active");
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop enum
DROP TYPE "StaffPosition";
