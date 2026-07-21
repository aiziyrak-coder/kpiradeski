import { PrismaClient } from '@prisma/client';
import { KPI_CATALOG_SEED } from './kpi-catalog.seed';

export async function seedKpiCatalog(client: PrismaClient) {
  for (const n of KPI_CATALOG_SEED) {
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
        weight: n.weight ?? 0,
        sortOrder: n.sortOrder,
        proofRequired: n.proofRequired ?? false,
        active: true,
      },
    });
  }
}
