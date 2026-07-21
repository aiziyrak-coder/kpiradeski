-- Drop leftover unique-on-date index (Prisma created INDEX, not CONSTRAINT)
DROP INDEX IF EXISTS "DailyScore_date_key";
