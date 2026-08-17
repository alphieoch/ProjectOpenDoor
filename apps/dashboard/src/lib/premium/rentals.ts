import { and, desc, eq, inArray } from "drizzle-orm";
import {
  deployments,
  gpuSkus,
  organizations,
  premiumRentals,
} from "@opendoor/database";
import {
  ACTIVE_DEPLOYMENT_STATUSES,
  PREMIUM_IMAGE_MODELS,
  discoverPrivateImageEndpoint,
  gcpStartCreditCents,
  getPlan,
  splitCreditBuckets,
} from "@opendoor/shared";
import { getDb } from "@/lib/db";
import { expireWelcomeIfNeeded } from "@/lib/credits";
import { logAuditEvent } from "@/lib/audit";
import { startLocalGpuModel, stopLocalGpuModel } from "@/lib/gpu/local-runner";

export type CreateRentalInput = {
  target?: "local" | "attach";
  deploymentId?: string;
  sku?: string;
  hours?: number | null;
  modelId?: string;
  weightsUri?: string;
  name?: string;
};

export function publicRental(
  row: typeof premiumRentals.$inferSelect,
  deployment?: typeof deployments.$inferSelect | null
) {
  return {
    id: row.id,
    model: `premium:${row.id}`,
    customModel: row.deploymentId ? `custom:${row.deploymentId}` : null,
    deploymentId: row.deploymentId,
    sku: row.sku,
    status: row.status,
    hourlyRate: Number(row.hourlyRate),
    hours: row.hours,
    modelId: row.modelId,
    weightsUri: row.weightsUri,
    ownsDeployment: row.ownsDeployment,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    catalog: PREMIUM_IMAGE_MODELS.find((m) => m.id === row.modelId) || null,
    deployment: deployment
      ? {
          id: deployment.id,
          name: deployment.name,
          target: deployment.target,
          gpuType: deployment.gpuType,
          status: deployment.status,
          fqdn: deployment.fqdn,
          runtimeModel: deployment.runtimeModel,
        }
      : null,
  };
}

async function hourlyForSku(sku: string): Promise<number> {
  if (sku === "metal" || sku === "none") return 0;
  const db = getDb();
  const row = await db.query.gpuSkus.findFirst({
    where: and(eq(gpuSkus.sku, sku), eq(gpuSkus.enabled, true)),
  });
  return row ? Number(row.hourlyUsd) : 0;
}

async function expireIfNeeded(row: typeof premiumRentals.$inferSelect) {
  if (!row.hours || !row.startedAt || row.status !== "active") return row;
  const ends = new Date(row.startedAt).getTime() + row.hours * 3600_000;
  if (Date.now() < ends) return row;
  return (await stopRental(row.organizationId, row.id)) || row;
}

export async function listRentals(orgId: string) {
  const db = getDb();
  const rows = await db.query.premiumRentals.findMany({
    where: eq(premiumRentals.organizationId, orgId),
    orderBy: [desc(premiumRentals.createdAt)],
  });
  const expired = await Promise.all(rows.map((r) => expireIfNeeded(r)));
  const ids = expired.map((r) => r.deploymentId).filter(Boolean) as string[];
  const deploys =
    ids.length > 0
      ? await db.query.deployments.findMany({
          where: inArray(deployments.id, ids),
        })
      : [];
  const byId = new Map(deploys.map((d) => [d.id, d]));
  return expired.map((r) => publicRental(r, r.deploymentId ? byId.get(r.deploymentId) : null));
}

export async function getRental(orgId: string, id: string) {
  const db = getDb();
  const row = await db.query.premiumRentals.findFirst({
    where: and(eq(premiumRentals.id, id), eq(premiumRentals.organizationId, orgId)),
  });
  if (!row) return null;
  const current = await expireIfNeeded(row);
  const deployment = current.deploymentId
    ? await db.query.deployments.findFirst({
        where: and(
          eq(deployments.id, current.deploymentId),
          eq(deployments.organizationId, orgId)
        ),
      })
    : null;
  return publicRental(current, deployment);
}

export async function createRental(
  orgId: string,
  userId: string,
  input: CreateRentalInput
) {
  const db = getDb();
  const target = input.target === "attach" ? "attach" : "local";
  const modelId = (input.modelId || "flux-1-schnell").slice(0, 255);
  const catalog = PREMIUM_IMAGE_MODELS.find((m) => m.id === modelId);
  const weightsUri =
    typeof input.weightsUri === "string" && input.weightsUri.trim()
      ? input.weightsUri.trim()
      : catalog?.weightsUri || null;
  const hours =
    input.hours == null || input.hours === 0 ? null : Math.max(1, Math.floor(Number(input.hours)));

  if (target === "attach") {
    if (!input.deploymentId) {
      return { error: "deploymentId is required to attach a dedicated GPU", status: 400 as const };
    }
    const deployment = await db.query.deployments.findFirst({
      where: and(
        eq(deployments.id, input.deploymentId),
        eq(deployments.organizationId, orgId)
      ),
    });
    if (!deployment) {
      return { error: "Deployment not found", status: 404 as const };
    }
    const sku = deployment.gpuType || "metal";
    const hourlyRate = await hourlyForSku(sku);
    const now = new Date();
    const [row] = await db
      .insert(premiumRentals)
      .values({
        organizationId: orgId,
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
    await logAuditEvent({
      organizationId: orgId,
      userId,
      action: "premium.rental.created",
      entityType: "premium_rental",
      entityId: row.id,
      metadata: { target, deploymentId: deployment.id, sku, modelId },
    });
    return { rental: publicRental(row, deployment) };
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { plan: true },
  });
  const limits = getPlan(org?.plan);
  const active = await db.query.deployments.findMany({
    where: and(
      eq(deployments.organizationId, orgId),
      inArray(deployments.status, [...ACTIVE_DEPLOYMENT_STATUSES])
    ),
    columns: { id: true },
  });
  if (active.length >= limits.maxActiveDeployments) {
    return {
      error: `${limits.name} includes ${limits.maxActiveDeployments} concurrent dedicated deployments. Stop one first.`,
      status: 402 as const,
    };
  }

  const sku = input.sku === "metal" || !input.sku ? "metal" : input.sku;
  if (sku !== "metal") {
    const need = gcpStartCreditCents(true);
    const orgCredits = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        id: true,
        creditsUsdCents: true,
        welcomeCreditsUsdCents: true,
        welcomeExpiresAt: true,
      },
    });
    const buckets = orgCredits
      ? await expireWelcomeIfNeeded(orgCredits)
      : splitCreditBuckets({});
    if (buckets.paidCents < need) {
      return {
        error: `This SKU needs at least $${(need / 100).toFixed(0)} prepaid credit. Local Metal is $0.`,
        status: 402 as const,
        requiredCents: need,
      };
    }
  }

  const image = await discoverPrivateImageEndpoint();
  const name = (input.name || `Premium · ${modelId}`).slice(0, 100);
  const [deployment] = await db
    .insert(deployments)
    .values({
      organizationId: orgId,
      name,
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
      status: image ? "running" : "pending",
      statusMessage: image
        ? "Studio is live (private GPU)"
        : "Studio is offline — go to Studio when the private GPU is ready",
      fqdn: image?.url || null,
      localRuntime: image ? image.kind : null,
      runtimeModel: modelId,
      startedAt: image ? new Date() : null,
    })
    .returning();

  if (!image) {
    const chatHint = weightsUri || modelId;
    const looksLikeChat =
      /llama|qwen|mistral|gemma|deepseek|phi|ollama:/i.test(chatHint) &&
      !/flux|minimax-h3|sdxl|stable-diffusion/i.test(chatHint);
    if (looksLikeChat) {
      try {
        const local = await startLocalGpuModel({ modelId: chatHint });
        await db
          .update(deployments)
          .set({
            status: "running",
            fqdn: local.fqdn,
            localRuntime: local.localRuntime,
            runtimeModel: local.runtimeModel,
            gpuType: local.gpuType,
            statusMessage: `Ollama on this Mac · ${local.runtimeModel}. Go to Studio for image generation.`,
            startedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(deployments.id, deployment.id));
        deployment.status = "running";
        deployment.fqdn = local.fqdn;
        deployment.runtimeModel = local.runtimeModel;
      } catch {
        /* user starts Ollama or an OpenAI-compatible image worker */
      }
    }
  }

  const hourlyRate = await hourlyForSku("metal");
  const now = new Date();
  const [row] = await db
    .insert(premiumRentals)
    .values({
      organizationId: orgId,
      deploymentId: deployment.id,
      sku: "metal",
      status: deployment.status === "running" ? "active" : "pending",
      hourlyRate: hourlyRate.toFixed(4),
      hours,
      modelId,
      weightsUri,
      ownsDeployment: true,
      startedAt: deployment.status === "running" ? now : null,
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId,
    action: "premium.rental.created",
    entityType: "premium_rental",
    entityId: row.id,
    metadata: { target: "local", deploymentId: deployment.id, modelId },
  });

  const fresh = await db.query.deployments.findFirst({
    where: eq(deployments.id, deployment.id),
  });
  return { rental: publicRental(row, fresh || deployment) };
}

export async function stopRental(orgId: string, id: string) {
  const db = getDb();
  const row = await db.query.premiumRentals.findFirst({
    where: and(eq(premiumRentals.id, id), eq(premiumRentals.organizationId, orgId)),
  });
  if (!row) return row;
  if (row.status === "stopped") return row;

  if (row.ownsDeployment && row.deploymentId) {
    const deployment = await db.query.deployments.findFirst({
      where: and(eq(deployments.id, row.deploymentId), eq(deployments.organizationId, orgId)),
    });
    if (deployment) {
      if (deployment.target === "local") {
        await stopLocalGpuModel(deployment.runtimeModel);
      }
      await db
        .update(deployments)
        .set({
          status: "stopped",
          stoppedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(deployments.id, deployment.id));
    }
  }

  const [updated] = await db
    .update(premiumRentals)
    .set({
      status: "stopped",
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(premiumRentals.id, id))
    .returning();
  return updated;
}
