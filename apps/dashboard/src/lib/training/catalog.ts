import { getDb } from "@/lib/db";
import { models, providers, trainingDatasets } from "@opendoor/database";
import { desc, eq } from "drizzle-orm";
import { inferModelModality } from "@/lib/models/modality";
import { isCatalogRowReady } from "@/lib/models/ready";
import {
  type CatalogModel,
  type DatasetSummary,
  isTrainableCatalogModel,
} from "./plan";

export async function loadTrainableCatalog(): Promise<CatalogModel[]> {
  const db = getDb();
  const rows = await db
    .select({
      modelId: models.modelId,
      displayName: models.displayName,
      family: models.family,
      source: models.source,
      providerName: providers.name,
      providerSlug: providers.slug,
      deploymentStatus: models.deploymentStatus,
    })
    .from(models)
    .leftJoin(providers, eq(models.providerId, providers.id))
    .where(eq(models.enabled, true));

  const catalog: CatalogModel[] = [];
  for (const row of rows) {
    if (!row.modelId) continue;
    if (row.deploymentStatus === "coming_soon") continue;
    const item: CatalogModel = {
      id: row.modelId,
      label: row.displayName || row.modelId,
      family: row.family || "closed",
      provider: row.providerName || row.providerSlug || "Unknown",
      modality: inferModelModality(row.modelId, row.displayName || ""),
      ready: isCatalogRowReady({
        providerSlug: row.providerSlug,
        source: row.source,
        family: row.family,
        id: row.modelId,
      }),
    };
    if (isTrainableCatalogModel(item)) catalog.push(item);
  }
  return catalog;
}

export async function loadOrgDatasets(orgId: string): Promise<DatasetSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: trainingDatasets.id,
      name: trainingDatasets.name,
      purpose: trainingDatasets.purpose,
      rowCount: trainingDatasets.rowCount,
      status: trainingDatasets.status,
      storageUri: trainingDatasets.storageUri,
      sample: trainingDatasets.sample,
    })
    .from(trainingDatasets)
    .where(eq(trainingDatasets.organizationId, orgId))
    .orderBy(desc(trainingDatasets.createdAt));
  return rows;
}
