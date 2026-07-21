/**
 * Dedupe before unique(date) migration, then push schema.
 * Run: npx ts-node --transpile-only prisma/dedupe.ts && npx prisma db push
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function dedupeTable(table: string, partition: string) {
  // Keep newest row per partition keys
  await prisma.$executeRawUnsafe(`
    DELETE FROM "${table}" a
    USING "${table}" b
    WHERE ${partition}
      AND a."updatedAt" < b."updatedAt"
  `);
}

async function main() {
  console.log('Deduping...');

  await prisma.$executeRawUnsafe(`
    DELETE FROM "DailyClinicCheck" a
    USING "DailyClinicCheck" b
    WHERE a.date = b.date AND a.id <> b.id AND a."updatedAt" < b."updatedAt"
  `);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "ReceptionCheck" a
    USING "ReceptionCheck" b
    WHERE a.date = b.date AND a.id <> b.id AND a."updatedAt" < b."updatedAt"
  `);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "UniformCheck" a
    USING "UniformCheck" b
    WHERE a.date = b.date AND a.id <> b.id AND a."updatedAt" < b."updatedAt"
  `);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "WarehouseCheck" a
    USING "WarehouseCheck" b
    WHERE a.date = b.date AND a.id <> b.id AND a."updatedAt" < b."updatedAt"
  `);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "CallEntry" a
    USING "CallEntry" b
    WHERE a.date = b.date AND a.type = b.type AND a.id <> b.id AND a."updatedAt" < b."updatedAt"
  `);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "SeoCheck" a
    USING "SeoCheck" b
    WHERE a.date = b.date AND a.id <> b.id AND a."updatedAt" < b."updatedAt"
  `);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "AdsCheck" a
    USING "AdsCheck" b
    WHERE a.date = b.date AND a.id <> b.id AND a."updatedAt" < b."updatedAt"
  `);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "MysteryPatientTest" a
    USING "MysteryPatientTest" b
    WHERE a.date = b.date AND a.id <> b.id AND a."createdAt" < b."createdAt"
  `);

  // Tie-break: if same updatedAt, delete higher id
  for (const table of [
    'DailyClinicCheck',
    'ReceptionCheck',
    'UniformCheck',
    'WarehouseCheck',
    'SeoCheck',
    'AdsCheck',
  ]) {
    await prisma.$executeRawUnsafe(`
      DELETE FROM "${table}" a
      USING "${table}" b
      WHERE a.date = b.date AND a.id <> b.id AND a.id > b.id
    `);
  }
  await prisma.$executeRawUnsafe(`
    DELETE FROM "CallEntry" a
    USING "CallEntry" b
    WHERE a.date = b.date AND a.type = b.type AND a.id <> b.id AND a.id > b.id
  `);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "MysteryPatientTest" a
    USING "MysteryPatientTest" b
    WHERE a.date = b.date AND a.id <> b.id AND a.id > b.id
  `);

  console.log('Dedupe done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
