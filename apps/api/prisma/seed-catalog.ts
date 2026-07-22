import { PrismaClient, KpiFrequency } from '@prisma/client';
import { KPI_CATALOG_SEED } from './kpi-catalog.seed';

export async function seedKpiCatalog(client: PrismaClient) {
  const keys = KPI_CATALOG_SEED.map((n) => n.key);

  for (const n of KPI_CATALOG_SEED) {
    const frequency = (n.frequency as KpiFrequency) || KpiFrequency.DAILY;
    await client.kpiCatalogNode.upsert({
      where: { key: n.key },
      create: {
        key: n.key,
        parentKey: n.parentKey ?? null,
        titleUz: n.titleUz,
        titleRu: n.titleRu,
        descriptionUz: n.descriptionUz,
        descriptionRu: n.descriptionRu,
        inputType: n.inputType,
        frequency,
        weight: n.weight ?? 0,
        sortOrder: n.sortOrder,
        proofRequired: n.proofRequired ?? false,
      },
      update: {
        parentKey: n.parentKey ?? null,
        titleUz: n.titleUz,
        titleRu: n.titleRu,
        descriptionUz: n.descriptionUz,
        descriptionRu: n.descriptionRu,
        inputType: n.inputType,
        frequency,
        weight: n.weight ?? 0,
        sortOrder: n.sortOrder,
        proofRequired: n.proofRequired ?? false,
        active: true,
      },
    });
  }

  if (keys.length) {
    await client.kpiCatalogNode.updateMany({
      where: { key: { notIn: keys } },
      data: { active: false },
    });
  }
}
