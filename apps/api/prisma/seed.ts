import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/** Faqat tizim sozlamalari — mock vazifa/shablon/doctor/product YO'Q */
const DEFAULT_WEIGHTS = [
  { blockKey: 'clinic', blockName: "Klinika ko'rigi", weight: 20, frequency: 'daily' },
  { blockKey: 'reception', blockName: 'Retsepshn', weight: 15, frequency: 'daily' },
  { blockKey: 'calls', blockName: "Qo'ng'iroqlar", weight: 25, frequency: 'daily' },
  { blockKey: 'reviews', blockName: 'Sharhlar', weight: 10, frequency: 'daily' },
  { blockKey: 'uniform', blockName: 'Uniforma', weight: 10, frequency: 'daily' },
  { blockKey: 'smm', blockName: 'SMM va sayt', weight: 15, frequency: 'daily' },
  { blockKey: 'marketing', blockName: 'Reklama va marketing', weight: 5, frequency: 'daily' },
] as const;

const prisma = new PrismaClient();

async function wipeAllData() {
  console.log('Tozalash: barcha operatsion maʼlumotlar...');
  await prisma.$transaction([
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
    prisma.branch.deleteMany({}),
  ]);
  console.log('Tozalash tugadi.');
}

async function main() {
  const wipe = process.env.SEED_WIPE === 'true';
  const isProd = process.env.NODE_ENV === 'production';

  if (wipe && isProd) {
    throw new Error('SEED_WIPE=true productionda taqiqlangan');
  }

  if (wipe) {
    await wipeAllData();
  } else {
    const existing = await prisma.user.count();
    if (existing > 0) {
      console.log(`Seed skip: ${existing} foydalanuvchi mavjud`);
      return;
    }
  }

  console.log('Minimal production seed (mock yoʻq)...');

  const branch = await prisma.branch.create({
    data: { id: 'branch-main', name: 'Radeski Dermatologiya', address: 'Toshkent' },
  });

  const passwordHash = await bcrypt.hash('klinikpi123', 12);

  await prisma.user.createMany({
    data: [
      {
        email: 'super@klinikpi.uz',
        name: 'IT Super Admin',
        role: Role.SUPER_ADMIN,
        passwordHash,
        branchId: branch.id,
        active: true,
      },
      {
        email: 'manager@klinikpi.uz',
        name: 'Menejer',
        role: Role.MANAGER,
        passwordHash,
        branchId: branch.id,
        active: true,
      },
    ],
  });

  for (const w of DEFAULT_WEIGHTS) {
    await prisma.kpiWeight.create({ data: { ...w } });
  }

  await prisma.appSetting.create({
    data: { key: 'rest_weekdays', value: [0, 6] },
  });

  console.log('Tayyor: 2 admin, KPI ogʻirliklar, dam olish kunlari.');
  console.log('Vazifalar, xodimlar, shifokorlar — UI orqali qoʻshiladi.');
  console.log('Kirish: super@klinikpi.uz / manager@klinikpi.uz · parol: klinikpi123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
