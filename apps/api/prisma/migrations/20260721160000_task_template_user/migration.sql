-- AlterTable
ALTER TABLE "TaskTemplate" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "TaskTemplate_userId_active_idx" ON "TaskTemplate"("userId", "active");

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
