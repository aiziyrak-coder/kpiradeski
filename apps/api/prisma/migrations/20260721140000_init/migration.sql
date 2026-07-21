-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'DIRECTOR', 'SUPER_ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "StaffPosition" AS ENUM ('CLINIC', 'RECEPTION', 'SMM', 'WAREHOUSE', 'MARKETING', 'MANAGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskFrequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewQuality" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('QR', 'WEBSITE', 'INSTAGRAM', 'VERBAL', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REMINDER', 'ALERT', 'AI_REPORT', 'STOCK', 'SCORE', 'MYSTERY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AiReportType" AS ENUM ('SERVICES', 'CALLS');

-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('NEW', 'REPEAT', 'MISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "position" "StaffPosition",
    "phone" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "telegramId" TEXT,
    "branchId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyClinicCheck" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "items" JSONB NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyClinicCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceptionCheck" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "items" JSONB NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceptionCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniformCheck" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "items" JSONB NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniformCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseCheck" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "items" JSONB NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "minStockFlag" BOOLEAN NOT NULL DEFAULT false,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "minStock" INTEGER NOT NULL DEFAULT 10,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "expiryDate" DATE,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallEntry" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "CallType" NOT NULL,
    "callsCount" INTEGER NOT NULL DEFAULT 0,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "recalledCount" INTEGER DEFAULT 0,
    "conversion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "source" "ReviewSource" NOT NULL DEFAULT 'QR',
    "quality" "ReviewQuality" NOT NULL DEFAULT 'POSITIVE',
    "note" TEXT,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoCheck" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "newArticle" BOOLEAN NOT NULL DEFAULT false,
    "newVideo" BOOLEAN NOT NULL DEFAULT false,
    "newReviews" BOOLEAN NOT NULL DEFAULT false,
    "pageUpdated" BOOLEAN NOT NULL DEFAULT false,
    "seoOk" BOOLEAN NOT NULL DEFAULT false,
    "pagespeedScore" DOUBLE PRECISION,
    "note" TEXT,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialStats" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "platform" TEXT NOT NULL,
    "posts" INTEGER NOT NULL DEFAULT 0,
    "stories" INTEGER NOT NULL DEFAULT 0,
    "reels" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "newFollowers" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdsCheck" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "aired" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT,
    "timeSlot" TEXT,
    "note" TEXT,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdsCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlyerEntry" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlyerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloggerEntry" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "followers" INTEGER NOT NULL,
    "niche" TEXT,
    "contact" TEXT,
    "note" TEXT,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BloggerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorStory" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "doctorId" TEXT NOT NULL,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorReferral" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientsCount" INTEGER NOT NULL DEFAULT 0,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysteryPatientTest" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "booked" BOOLEAN NOT NULL,
    "note" TEXT,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MysteryPatientTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiWeeklyReport" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "type" "AiReportType" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiWeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiWeight" (
    "id" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "blockName" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyScore" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "blockScores" JSONB NOT NULL,
    "completion" JSONB,
    "colorStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "position" "StaffPosition" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proofRequired" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "frequency" "TaskFrequency" NOT NULL DEFAULT 'DAILY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proofRequired" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "employeeNote" TEXT,
    "reviewerNote" TEXT,
    "reviewedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskProof" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyEmployeeScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB NOT NULL,
    "aiSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyEmployeeScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMonthlyReport" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMonthlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "DailyClinicCheck_date_idx" ON "DailyClinicCheck"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyClinicCheck_date_key" ON "DailyClinicCheck"("date");

-- CreateIndex
CREATE INDEX "ReceptionCheck_date_idx" ON "ReceptionCheck"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ReceptionCheck_date_key" ON "ReceptionCheck"("date");

-- CreateIndex
CREATE INDEX "UniformCheck_date_idx" ON "UniformCheck"("date");

-- CreateIndex
CREATE UNIQUE INDEX "UniformCheck_date_key" ON "UniformCheck"("date");

-- CreateIndex
CREATE INDEX "WarehouseCheck_date_idx" ON "WarehouseCheck"("date");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseCheck_date_key" ON "WarehouseCheck"("date");

-- CreateIndex
CREATE INDEX "CallEntry_date_idx" ON "CallEntry"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CallEntry_date_type_key" ON "CallEntry"("date", "type");

-- CreateIndex
CREATE INDEX "Review_date_idx" ON "Review"("date");

-- CreateIndex
CREATE INDEX "SeoCheck_date_idx" ON "SeoCheck"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SeoCheck_date_key" ON "SeoCheck"("date");

-- CreateIndex
CREATE INDEX "SocialStats_date_idx" ON "SocialStats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SocialStats_date_platform_key" ON "SocialStats"("date", "platform");

-- CreateIndex
CREATE INDEX "AdsCheck_date_idx" ON "AdsCheck"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AdsCheck_date_key" ON "AdsCheck"("date");

-- CreateIndex
CREATE INDEX "FlyerEntry_date_idx" ON "FlyerEntry"("date");

-- CreateIndex
CREATE INDEX "BloggerEntry_weekStart_idx" ON "BloggerEntry"("weekStart");

-- CreateIndex
CREATE INDEX "DoctorStory_date_idx" ON "DoctorStory"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorStory_date_doctorId_key" ON "DoctorStory"("date", "doctorId");

-- CreateIndex
CREATE INDEX "DoctorReferral_weekStart_idx" ON "DoctorReferral"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorReferral_weekStart_doctorId_key" ON "DoctorReferral"("weekStart", "doctorId");

-- CreateIndex
CREATE INDEX "MysteryPatientTest_date_idx" ON "MysteryPatientTest"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MysteryPatientTest_date_key" ON "MysteryPatientTest"("date");

-- CreateIndex
CREATE INDEX "AiWeeklyReport_weekStart_idx" ON "AiWeeklyReport"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "AiWeeklyReport_weekStart_type_key" ON "AiWeeklyReport"("weekStart", "type");

-- CreateIndex
CREATE UNIQUE INDEX "KpiWeight_blockKey_key" ON "KpiWeight"("blockKey");

-- CreateIndex
CREATE UNIQUE INDEX "DailyScore_date_key" ON "DailyScore"("date");

-- CreateIndex
CREATE INDEX "DailyScore_date_idx" ON "DailyScore"("date");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "TaskTemplate_position_active_idx" ON "TaskTemplate"("position", "active");

-- CreateIndex
CREATE INDEX "DailyTask_date_status_idx" ON "DailyTask"("date", "status");

-- CreateIndex
CREATE INDEX "DailyTask_userId_date_idx" ON "DailyTask"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTask_userId_date_templateId_key" ON "DailyTask"("userId", "date", "templateId");

-- CreateIndex
CREATE INDEX "TaskProof_taskId_idx" ON "TaskProof"("taskId");

-- CreateIndex
CREATE INDEX "MonthlyEmployeeScore_year_month_idx" ON "MonthlyEmployeeScore"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyEmployeeScore_userId_year_month_key" ON "MonthlyEmployeeScore"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMonthlyReport_year_month_key" ON "StaffMonthlyReport"("year", "month");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyClinicCheck" ADD CONSTRAINT "DailyClinicCheck_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceptionCheck" ADD CONSTRAINT "ReceptionCheck_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformCheck" ADD CONSTRAINT "UniformCheck_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseCheck" ADD CONSTRAINT "WarehouseCheck_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseProduct" ADD CONSTRAINT "WarehouseProduct_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallEntry" ADD CONSTRAINT "CallEntry_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoCheck" ADD CONSTRAINT "SeoCheck_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdsCheck" ADD CONSTRAINT "AdsCheck_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerEntry" ADD CONSTRAINT "FlyerEntry_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloggerEntry" ADD CONSTRAINT "BloggerEntry_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorStory" ADD CONSTRAINT "DoctorStory_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorStory" ADD CONSTRAINT "DoctorStory_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorReferral" ADD CONSTRAINT "DoctorReferral_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorReferral" ADD CONSTRAINT "DoctorReferral_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryPatientTest" ADD CONSTRAINT "MysteryPatientTest_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProof" ADD CONSTRAINT "TaskProof_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyEmployeeScore" ADD CONSTRAINT "MonthlyEmployeeScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
