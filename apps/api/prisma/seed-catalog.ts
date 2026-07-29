import { PrismaClient, KpiFrequency } from '@prisma/client';
import { KPI_CATALOG_SEED } from './kpi-catalog.seed';

/**
 * @param syncExisting - true: seed may overwrite structural seed fields (wipe/manual seed).
 *   false (API boot): create missing + sync parentKey/sort (daraxt tekislash), weight/proof/active saqlanadi.
 */
export async function seedKpiCatalog(
  client: PrismaClient,
  opts: { syncExisting?: boolean } = {},
) {
  const syncExisting = opts.syncExisting === true;
  const seedKeys = new Set(KPI_CATALOG_SEED.map((n) => n.key));

  for (const n of KPI_CATALOG_SEED) {
    const frequency = (n.frequency as KpiFrequency) || KpiFrequency.DAILY;
    const existing = await client.kpiCatalogNode.findUnique({
      where: { key: n.key },
      select: { key: true },
    });

    if (!existing) {
      await client.kpiCatalogNode.create({
        data: {
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
      });
      continue;
    }

    if (syncExisting) {
      await client.kpiCatalogNode.update({
        where: { key: n.key },
        data: {
          parentKey: n.parentKey ?? null,
          titleUz: n.titleUz,
          titleRu: n.titleRu,
          descriptionUz: n.descriptionUz,
          descriptionRu: n.descriptionRu,
          inputType: n.inputType,
          frequency,
          sortOrder: n.sortOrder,
        },
      });
    } else {
      // Daraxt tuzilmasi + root ogʻirliklar (ball 100% ga mos)
      const isRoot = n.parentKey == null;
      await client.kpiCatalogNode.update({
        where: { key: n.key },
        data: {
          parentKey: n.parentKey ?? null,
          sortOrder: n.sortOrder,
          inputType: n.inputType,
          frequency,
          active: true,
          ...(isRoot && typeof n.weight === 'number' ? { weight: n.weight } : {}),
        },
      });
    }
  }

  // Seeddan chiqarilgan eski «Pollar» guruhini yashirish
  if (!seedKeys.has('clinic.clean.floors')) {
    await client.kpiCatalogNode.updateMany({
      where: { key: 'clinic.clean.floors' },
      data: { active: false },
    });
  }

  // Orphan qoʻngʻiroqlar (calls root yoʻq) — ball tizimiga kirmasin
  await client.kpiCatalogNode.updateMany({
    where: {
      OR: [
        { key: { startsWith: 'calls.' } },
        { key: 'calls' },
        { key: { startsWith: 'calls_w' } },
        { key: { startsWith: 'calls_m' } },
      ],
    },
    data: { active: false },
  });
}
