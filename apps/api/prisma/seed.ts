import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { KPI_CATALOG_SEED } from './kpi-catalog.seed';
import { seedKpiCatalog } from './seed-catalog';

const prisma = new PrismaClient();

async function wipeAllData() {
  console.log('Tozalash...');
  await prisma.$transaction([
    prisma.kpiProof.deleteMany({}),
    prisma.kpiDayEntry.deleteMany({}),
    prisma.kpiAssignmentTemplate.deleteMany({}),
    prisma.kpiTaskAssignment.deleteMany({}),
    prisma.kpiCatalogNode.deleteMany({}),
    prisma.branchManager.deleteMany({}),
    prisma.taskProof.deleteMany({}),
    prisma.dailyTask.deleteMany({}),
    prisma.monthlyEmployeeScore.deleteMany({}),
    prisma.staffMonthlyReport.deleteMany({}),
    prisma.notification.deleteMany({}),
    prisma.auditLog.deleteMany({}),
    prisma.dailyScore.deleteMany({}),
    prisma.aiWeeklyReport.deleteMany({}),
    prisma.mysteryPatientTest.deleteMany({}),
    prisma.doctorReferral.deleteMany({}),
    prisma.doctorStory.deleteMany({}),
    prisma.bloggerEntry.deleteMany({}),
    prisma.flyerEntry.deleteMany({}),
    prisma.adsCheck.deleteMany({}),
    prisma.socialStats.deleteMany({}),
    prisma.seoCheck.deleteMany({}),
    prisma.review.deleteMany({}),
    prisma.callEntry.deleteMany({}),
    prisma.warehouseCheck.deleteMany({}),
    prisma.warehouseProduct.deleteMany({}),
    prisma.uniformCheck.deleteMany({}),
    prisma.receptionCheck.deleteMany({}),
    prisma.dailyClinicCheck.deleteMany({}),
    prisma.doctor.deleteMany({}),
    prisma.taskTemplate.deleteMany({}),
    prisma.holiday.deleteMany({}),
    prisma.appSetting.deleteMany({}),
    prisma.user.deleteMany({}),
    prisma.kpiWeight.deleteMany({}),
    prisma.position.deleteMany({}),
    prisma.branch.deleteMany({}),
  ]);
}

async function main() {
  const wipe = process.env.SEED_WIPE === 'true';
  const forceCatalog = process.env.SEED_CATALOG === 'true';

  if (wipe && process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== '1') {
    throw new Error('SEED_WIPE=true productionda SEED_FORCE=1 talab qiladi');
  }

  if (wipe) await wipeAllData();

  // Katalog: wipe/force da mavjud tugun matnini sync; oddiy seed — faqat yangi
  await seedKpiCatalog(prisma, { syncExisting: wipe || forceCatalog });
  console.log(`KPI katalog: ${KPI_CATALOG_SEED.length} tugun`);

  const existing = await prisma.user.count();
  if (existing > 0 && !wipe) {
    // Filial boʻlmasa yaratish
    let branch = await prisma.branch.findFirst();
    if (!branch) {
      branch = await prisma.branch.create({
        data: { name: 'Radeski Dermatologiya', address: 'Toshkent' },
      });
    }
    // Managerlarni avtomatik filialga bogʻlamaymiz — admin o‘zi tayinlaydi
    console.log(`Seed skip users (${existing}), katalog yangilandi`);
    return;
  }

  const branch = await prisma.branch.create({
    data: { name: 'Radeski Dermatologiya', address: 'Toshkent' },
  });

  const passwordHash = await bcrypt.hash('klinikpi123', 12);

  const admin = await prisma.user.create({
    data: {
      email: 'super@klinikpi.uz',
      name: 'Admin',
      role: Role.SUPER_ADMIN,
      passwordHash,
      branchId: branch.id,
      active: true,
    },
  });

  // Demo manager yaratilmaydi — admin o‘zi qo‘shadi

  await prisma.appSetting.create({
    data: { key: 'rest_weekdays', value: [0, 6] },
  });

  console.log('Seed OK:', admin.email, branch.name);
  void forceCatalog;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
