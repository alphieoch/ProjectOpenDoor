import { and, desc, eq, inArray } from "drizzle-orm";
import { db, deployments, gpuSkus, premiumRentals } from "@opendoor/database";
import { PREMIUM_IMAGE_MODELS, discoverPrivateImageEndpoint } from "@opendoor/shared";

export function publicRental(
  row: typeof premiumRentals.$inferSelect,
  deployment?: typeof deployments.$inferSelect | null
) {
  return {
    id: row.id,
    object: "premium.rental",
    model: `premium:${row.id}`,
    custom_model: row.deploymentId ? `custom:${row.deploymentId}` : null,
    deployment_id: row.deploymentId,
    sku: row.sku,
    status: row.status,
    hourly_rate: Number(row.hourlyRate),
    hours: row.hours,
    model_id: row.modelId,
    weights_uri: row.weightsUri,
    started_at: row.startedAt,
    ended_at: row.endedAt,
    created_at: row.createdAt,
    catalog: PREMIUM_IMAGE_MODELS.find((m) => m.id === row.modelId) || null,
    deployment: deployment
      ? {
          id: deployment.id,
          name: deployment.name,
          target: deployment.target,
          gpu_type: deployment.gpuType,
          status: deployment.status,
          fqdn: deployment.fqdn,
        }
      : null,
  };
}

async function hourlyForSku(sku: string): Promise<number> {
  if (sku === "metal" || sku === "none") return 0;
  const row = await db.query.gpuSkus.findFirst({
    where: and(eq(gpuSkus.sku, sku), eq(gpuSkus.enabled, true)),
  });
  return row ? Number(row.hourlyUsd) : 0;
}

export async function resolvePremiumDeploymentId(
  modelId: string,
  organizationId: string
): Promise<string | null> {
  if (!modelId.startsWith("premium:")) return null;
  const rentalId = modelId.slice("premium:".length).split("/")[0];
  const row = await db.query.premiumRentals.findFirst({
    where: and(
      eq(premiumRentals.id, rentalId),
      eq(premiumRentals.organizationId, organizationId)
    ),
  });
  if (!row?.deploymentId) return null;
  if (row.status !== "active" && row.status !== "pending") return null;
  return row.deploymentId;
}

export async function resolvePremiumModel(
  modelId: string,
  organizationId?: string
): Promise<string | null> {
  if (!organizationId) return null;
  const deploymentId = await resolvePremiumDeploymentId(modelId, organizationId);
  return deploymentId ? `custom:${deploymentId}` : null;
}

export async function listPremiumRentals(organizationId: string) {
  const rows = await db.query.premiumRentals.findMany({
    where: eq(premiumRentals.organizationId, organizationId),
    orderBy: [desc(premiumRentals.createdAt)],
  });
  const ids = rows.map((r) => r.deploymentId).filter(Boolean) as string[];
  const deploys =
    ids.length > 0
      ? await db.query.deployments.findMany({ where: inArray(deployments.id, ids) })
      : [];
  const byId = new Map(deploys.map((d) => [d.id, d]));
  return rows.map((r) => publicRental(r, r.deploymentId ? byId.get(r.deploymentId) : null));
}

export async function createPremiumRental(
  organizationId: string,
  body: {
    target?: string;
    deployment_id?: string;
    deploymentId?: string;
    hours?: number | null;
    model_id?: string;
    modelId?: string;
    weights_uri?: string;
    weightsUri?: string;
    name?: string;
  }
) {
  const target = body.target === "attach" ? "attach" : "local";
  const deploymentId = body.deployment_id || body.deploymentId;
  if (target === "attach" && !deploymentId) {
    return {
      error: "deployment_id is required when attaching an existing dedicated GPU",
      status: 400 as const,
    };
  }

  if (target === "local" && !deploymentId) {
    const modelId = String(body.model_id || body.modelId || "flux-1-schnell").slice(0, 255);
    const catalog = PREMIUM_IMAGE_MODELS.find((m) => m.id === modelId);
    const weightsUri =
      String(body.weights_uri || body.weightsUri || catalog?.weightsUri || "") || null;
    const hours =
      body.hours == null || body.hours === 0 ? null : Math.max(1, Math.floor(Number(body.hours)));
    const image = await discoverPrivateImageEndpoint();
    const [deployment] = await db
      .insert(deployments)
      .values({
        organizationId,
        name: (body.name || `Premium · ${modelId}`).slice(0, 100),
        sourceType: "image",
        sourceValue: weightsUri || modelId,
        target: "local",
        gpuType: "metal",
        gpuCount: 1,
        reserved: true,
        scaleToZero: false,
        minReplicas: 1,
        regionLocked: false,
        weightsUri,
        runtimeModel: modelId,
        fqdn: image?.url || null,
        status: image ? "running" : "pending",
        statusMessage: image
          ? `Private image gen on ${image.url} (${image.kind})`
          : "Waiting for a private image server (PRIVATE_IMAGE_GEN_URL)",
        startedAt: image ? new Date() : null,
      })
      .returning();
    const now = new Date();
    const [row] = await db
      .insert(premiumRentals)
      .values({
        organizationId,
        deploymentId: deployment.id,
        sku: "metal",
        status: image ? "active" : "pending",
        hourlyRate: "0",
        hours,
        modelId,
        weightsUri,
        ownsDeployment: true,
        startedAt: image ? now : null,
      })
      .returning();
    return { rental: publicRental(row, deployment) };
  }
  if (!deploymentId) {
    return { error: "deployment_id is required", status: 400 as const };
  }
  const deployment = await db.query.deployments.findFirst({
    where: and(
      eq(deployments.id, deploymentId),
      eq(deployments.organizationId, organizationId)
    ),
  });
  if (!deployment) return { error: "Deployment not found", status: 404 as const };

  const modelId = String(body.model_id || body.modelId || "flux-1-schnell").slice(0, 255);
  const catalog = PREMIUM_IMAGE_MODELS.find((m) => m.id === modelId);
  const weightsUri = String(body.weights_uri || body.weightsUri || catalog?.weightsUri || "") || null;
  const hours =
    body.hours == null || body.hours === 0 ? null : Math.max(1, Math.floor(Number(body.hours)));
  const sku = deployment.gpuType || "metal";
  const hourlyRate = await hourlyForSku(sku);
  const now = new Date();
  const [row] = await db
    .insert(premiumRentals)
    .values({
      organizationId,
      deploymentId: deployment.id,
      sku,
      status: deployment.status === "running" ? "active" : "pending",
      hourlyRate: hourlyRate.toFixed(4),
      hours,
      modelId,
      weightsUri,
      ownsDeployment: false,
      startedAt: deployment.status === "running" ? now : null,
    })
    .returning();
  return { rental: publicRental(row, deployment) };
}

export async function stopPremiumRental(organizationId: string, id: string) {
  const row = await db.query.premiumRentals.findFirst({
    where: and(eq(premiumRentals.id, id), eq(premiumRentals.organizationId, organizationId)),
  });
  if (!row) return null;
  if (row.status === "stopped") return publicRental(row);
  const [updated] = await db
    .update(premiumRentals)
    .set({ status: "stopped", endedAt: new Date(), updatedAt: new Date() })
    .where(eq(premiumRentals.id, id))
    .returning();
  return publicRental(updated);
}

export async function getPremiumRental(organizationId: string, id: string) {
  const row = await db.query.premiumRentals.findFirst({
    where: and(eq(premiumRentals.id, id), eq(premiumRentals.organizationId, organizationId)),
  });
  if (!row) return null;
  const deployment = row.deploymentId
    ? await db.query.deployments.findFirst({
        where: and(
          eq(deployments.id, row.deploymentId),
          eq(deployments.organizationId, organizationId)
        ),
      })
    : null;
  return publicRental(row, deployment);
}
