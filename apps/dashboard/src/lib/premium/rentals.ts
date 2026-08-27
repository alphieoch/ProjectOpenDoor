import { and, desc, eq, inArray } from "drizzle-orm";
import {
  deployments,
  gpuHostShares,
  gpuSkus,
  organizations,
  premiumRentals,
} from "@opendoor/database";
import {
  ACTIVE_DEPLOYMENT_STATUSES,
  GPU_RATES,
  PREMIUM_IMAGE_MODELS,
  discoverPrivateImageEndpoint,
  gcpStartCreditCents,
  getPlan,
  splitCreditBuckets,
} from "@opendoor/shared";
import { getDb } from "@/lib/db";
import { assertOrgCanSpend, expireWelcomeIfNeeded, spendableFromWaterfall } from "@/lib/credits";
import { logAuditEvent } from "@/lib/audit";
import { startLocalGpuModel, stopLocalGpuModel } from "@/lib/gpu/local-runner";
import { deleteGcpGpuService, deployGpuToGcp } from "@/lib/gcp/deployer";
import {
  listMarketplaceHosts,
  loadHostSharePage,
  settleOpenShareEarnings,
  settleRentalById,
} from "@/lib/premium/host-listings";
import { ensurePremiumGpuSchema, premiumPageError, withEnsuredSchema } from "@/lib/premium/schema";

export type CreateRentalInput = {
  target?: "local" | "gcp" | "attach" | "shared";
  deploymentId?: string;
  hostShareId?: string;
  sku?: string;
  hours?: number | null;
  modelId?: string;
  weightsUri?: string;
  name?: string;
  reserved?: boolean;
  scaleToZero?: boolean;
  isSiteAdmin?: boolean;
};

export type PremiumSku = {
  sku: string;
  displayName: string;
  hourlyUsd: number;
  target: "local" | "gcp";
  regionMultiplier: number;
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
    hostShareId: row.hostShareId,
    earningsCents: row.earningsCents ?? 0,
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
          statusMessage: deployment.statusMessage,
          fqdn: deployment.fqdn,
          runtimeModel: deployment.runtimeModel,
          reserved: deployment.reserved,
          scaleToZero: deployment.scaleToZero,
          regionLocked: deployment.regionLocked,
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
  if (row) return Number(row.hourlyUsd);
  const listed = GPU_RATES[sku as keyof typeof GPU_RATES];
  return listed ? listed.listHourlyUsd : 0;
}

export async function listPremiumSkus(): Promise<PremiumSku[]> {
  const metal: PremiumSku = {
    sku: "metal",
    displayName: "Use this Mac (Metal)",
    hourlyUsd: 0,
    target: "local",
    regionMultiplier: 1,
  };
  let cloud: PremiumSku[] = [];
  try {
    const db = getDb();
    const found = await db.query.gpuSkus.findMany({
      where: eq(gpuSkus.enabled, true),
    });
    cloud = found
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((row) => ({
        sku: row.sku,
        displayName: row.displayName,
        hourlyUsd: Number(row.hourlyUsd),
        target: "gcp" as const,
        regionMultiplier: Number(row.regionMultiplier || 1),
      }));
  } catch {
    cloud = [];
  }
  const listed = new Set(cloud.map((row) => row.sku));
  for (const g of Object.values(GPU_RATES)) {
    if (listed.has(g.sku)) continue;
    cloud.push({
      sku: g.sku,
      displayName: g.displayName,
      hourlyUsd: g.listHourlyUsd,
      target: "gcp",
      regionMultiplier: g.regionMultiplier,
    });
  }
  cloud.sort((a, b) => {
    const orderA = GPU_RATES[a.sku as keyof typeof GPU_RATES]?.sortOrder ?? 100;
    const orderB = GPU_RATES[b.sku as keyof typeof GPU_RATES]?.sortOrder ?? 100;
    return orderA - orderB;
  });
  return [metal, ...cloud];
}

async function expireIfNeeded(row: typeof premiumRentals.$inferSelect) {
  if (!row.hours || !row.startedAt || row.status !== "active") return row;
  const ends = new Date(row.startedAt).getTime() + row.hours * 3600_000;
  if (Date.now() < ends) return row;
  return (await stopRental(row.organizationId, row.id)) || row;
}

export async function listRentals(orgId: string) {
  try {
    await settleOpenShareEarnings();
  } catch (err) {
    console.error("[premium] settleOpenShareEarnings", err);
  }
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

export async function listPremiumPage(orgId: string, opts?: { studioLive?: boolean }) {
  const skus = await listPremiumSkus();
  let warning: string | null = null;
  let rentals: Awaited<ReturnType<typeof listRentals>> = [];
  try {
    rentals = await withEnsuredSchema(() => listRentals(orgId));
  } catch (err) {
    console.error("[premium] listRentals", err);
    warning = premiumPageError(err);
  }

  let runningDeploys: Array<{
    id: string;
    name: string;
    target: string;
    gpuType: string | null;
    status: string;
    fqdn: string | null;
    reserved: boolean | null;
    scaleToZero: boolean | null;
  }> = [];
  try {
    const db = getDb();
    const deploys = await db.query.deployments.findMany({
      where: and(eq(deployments.organizationId, orgId), eq(deployments.status, "running")),
    });
    runningDeploys = deploys.map((d) => ({
      id: d.id,
      name: d.name,
      target: d.target,
      gpuType: d.gpuType,
      status: d.status,
      fqdn: d.fqdn,
      reserved: d.reserved,
      scaleToZero: d.scaleToZero,
    }));
  } catch (err) {
    console.error("[premium] list deployments", err);
  }

  let availableHosts: Awaited<ReturnType<typeof listMarketplaceHosts>> = [];
  let host: Awaited<ReturnType<typeof loadHostSharePage>> | {
    eligibility: null;
    capabilities: null;
    listing: null;
    inbound: [];
  } = { eligibility: null, capabilities: null, listing: null, inbound: [] };
  try {
    const [hosts, page] = await Promise.all([
      withEnsuredSchema(() => listMarketplaceHosts(orgId)),
      withEnsuredSchema(() => loadHostSharePage(orgId, Boolean(opts?.studioLive))),
    ]);
    availableHosts = hosts;
    host = page;
  } catch (err) {
    console.error("[premium] host marketplace", err);
  }

  return {
    rentals,
    skus,
    availableHosts,
    host,
    deployments: runningDeploys,
    warning,
  };
}

async function findRentalForOrg(orgId: string, id: string) {
  const db = getDb();
  const asRenter = await db.query.premiumRentals.findFirst({
    where: and(eq(premiumRentals.id, id), eq(premiumRentals.organizationId, orgId)),
  });
  if (asRenter) return asRenter;
  const row = await db.query.premiumRentals.findFirst({
    where: eq(premiumRentals.id, id),
  });
  if (!row?.hostShareId) return null;
  const listing = await db.query.gpuHostShares.findFirst({
    where: and(eq(gpuHostShares.id, row.hostShareId), eq(gpuHostShares.organizationId, orgId)),
  });
  return listing ? row : null;
}

export async function getRental(orgId: string, id: string) {
  await settleRentalById(id);
  const db = getDb();
  const row = await findRentalForOrg(orgId, id);
  if (!row) return null;
  const current = await expireIfNeeded(row);
  const deployment = current.deploymentId
    ? await db.query.deployments.findFirst({
        where: eq(deployments.id, current.deploymentId),
      })
    : null;
  return publicRental(current, deployment);
}

export async function createRental(
  orgId: string,
  userId: string,
  input: CreateRentalInput
) {
  await ensurePremiumGpuSchema();
  const db = getDb();
  const requestedSku = (input.sku || "metal").slice(0, 50);
  const target =
    input.target === "shared" || input.hostShareId
      ? "shared"
      : input.target === "attach"
        ? "attach"
        : input.target === "gcp" || (requestedSku !== "metal" && requestedSku !== "none")
          ? "gcp"
          : "local";
  if (target === "shared") {
    return createSharedRental(orgId, userId, input);
  }
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

  const sku = target === "gcp" ? requestedSku || "nvidia-l4" : "metal";
  const reserved = input.reserved !== false && input.scaleToZero !== true;
  const scaleToZero = reserved ? false : input.scaleToZero !== false;
  if (target === "gcp") {
    const allowed = await listPremiumSkus();
    if (!allowed.some((s) => s.sku === sku && s.target === "gcp")) {
      return { error: `Unknown GCP SKU: ${sku}`, status: 400 as const };
    }
    const need = gcpStartCreditCents(reserved);
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
        error: `GCP GPUs need at least $${(need / 100).toFixed(0)} prepaid credit. Use this Mac is $0.`,
        status: 402 as const,
        requiredCents: need,
      };
    }
  }

  const name = (input.name || `Premium · ${modelId}`).slice(0, 100);

  if (target === "gcp") {
    const hourlyRate = await hourlyForSku(sku);
    const [deployment] = await db
      .insert(deployments)
      .values({
        organizationId: orgId,
        name,
        sourceType: "catalog",
        sourceValue: weightsUri || modelId,
        target: "gcp",
        gpuType: sku,
        gpuCount: 1,
        reserved,
        scaleToZero,
        minReplicas: reserved ? 1 : 0,
        maxReplicas: 1,
        regionLocked: false,
        weightsUri,
        status: "pending",
        statusMessage: "Provisioning GCP Cloud Run GPU…",
        runtimeModel: modelId,
      })
      .returning();
    const [row] = await db
      .insert(premiumRentals)
      .values({
        organizationId: orgId,
        deploymentId: deployment.id,
        sku,
        status: "pending",
        hourlyRate: hourlyRate.toFixed(4),
        hours,
        modelId,
        weightsUri,
        ownsDeployment: true,
      })
      .returning();
    await logAuditEvent({
      organizationId: orgId,
      userId,
      action: "premium.rental.created",
      entityType: "premium_rental",
      entityId: row.id,
      metadata: { target: "gcp", deploymentId: deployment.id, sku, modelId },
    });
    void runGcpPremiumDeploy({
      rentalId: row.id,
      deploymentId: deployment.id,
      name,
      huggingFaceRepo: weightsUri || modelId,
      sku,
      reserved,
      scaleToZero,
    });
    return { rental: publicRental(row, deployment) };
  }

  const image = await discoverPrivateImageEndpoint();
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

async function createSharedRental(
  orgId: string,
  userId: string,
  input: CreateRentalInput
) {
  await ensurePremiumGpuSchema();
  const db = getDb();
  const hostShareId = String(input.hostShareId || "").trim();
  if (!hostShareId) {
    return { error: "hostShareId is required to rent a listed host", status: 400 as const };
  }
  const listing = await db.query.gpuHostShares.findFirst({
    where: eq(gpuHostShares.id, hostShareId),
  });
  if (!listing || listing.status !== "listed") {
    return { error: "That host is not listed.", status: 404 as const };
  }

  const busy = await db.query.premiumRentals.findFirst({
    where: and(
      eq(premiumRentals.hostShareId, listing.id),
      inArray(premiumRentals.status, ["active", "pending"])
    ),
  });
  if (busy) {
    return { error: "This host is already in use. Stop that rental first.", status: 409 as const };
  }

  const modelId = (input.modelId || "flux-1-schnell").slice(0, 255);
  const catalog = PREMIUM_IMAGE_MODELS.find((m) => m.id === modelId);
  const weightsUri =
    typeof input.weightsUri === "string" && input.weightsUri.trim()
      ? input.weightsUri.trim()
      : catalog?.weightsUri || null;
  const hours =
    input.hours == null || input.hours === 0 ? null : Math.max(1, Math.floor(Number(input.hours)));
  const hourlyRate = Number(listing.hourlyUsd);
  const preview = listing.organizationId === orgId;

  if (!preview) {
    const needCents = Math.max(1, Math.ceil((hours ?? 1) * hourlyRate * 100));
    const afford = await assertOrgCanSpend(orgId, "closed", { isSiteAdmin: input.isSiteAdmin });
    if (!afford.ok) {
      return { error: afford.detail, status: 402 as const, requiredCents: needCents };
    }
    if (!afford.unlimited && spendableFromWaterfall(afford.waterfall, "closed") < needCents) {
      return {
        error: `Need at least $${(needCents / 100).toFixed(2)} prepaid to start this listed host.`,
        status: 402 as const,
        requiredCents: needCents,
      };
    }
  }

  const image = await discoverPrivateImageEndpoint();
  const now = new Date();
  const name = (input.name || `Shared · ${listing.displayName}`).slice(0, 100);
  let deployment: typeof deployments.$inferSelect | null = null;

  if (image) {
    const [created] = await db
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
        status: "running",
        statusMessage: preview
          ? "Preview rental on this listed Mac"
          : `Running on listed host · ${listing.displayName}`,
        fqdn: image.url,
        localRuntime: image.kind,
        runtimeModel: modelId,
        startedAt: now,
      })
      .returning();
    deployment = created;
  }

  const [row] = await db
    .insert(premiumRentals)
    .values({
      organizationId: orgId,
      deploymentId: deployment?.id ?? null,
      hostShareId: listing.id,
      sku: listing.sku || "metal",
      status: "active",
      hourlyRate: hourlyRate.toFixed(4),
      hours,
      modelId,
      weightsUri,
      ownsDeployment: Boolean(deployment),
      earningsCents: 0,
      startedAt: now,
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId,
    action: "premium.rental.created",
    entityType: "premium_rental",
    entityId: row.id,
    metadata: {
      target: "shared",
      hostShareId: listing.id,
      preview,
      modelId,
      hourlyUsd: hourlyRate,
    },
  });

  return { rental: publicRental(row, deployment) };
}

async function runGcpPremiumDeploy(opts: {
  rentalId: string;
  deploymentId: string;
  name: string;
  huggingFaceRepo: string;
  sku: string;
  reserved: boolean;
  scaleToZero: boolean;
}) {
  const db = getDb();
  try {
    const result = await deployGpuToGcp({
      deploymentId: opts.deploymentId,
      name: opts.name,
      huggingFaceRepo: opts.huggingFaceRepo,
      minReplicas: opts.reserved ? 1 : 0,
      maxReplicas: 1,
      scaleToZero: opts.scaleToZero,
      gpuType: opts.sku,
    });
    const now = new Date();
    await db
      .update(deployments)
      .set({
        status: "running",
        fqdn: result.fqdn,
        gcpResourceId: result.gcpResourceId,
        runtimeModel: result.runtimeModel,
        gpuType: result.gpuType,
        statusMessage: `Running on GCP Cloud Run GPU (${result.gpuType})`,
        startedAt: now,
        updatedAt: now,
      })
      .where(eq(deployments.id, opts.deploymentId));
    await db
      .update(premiumRentals)
      .set({ status: "active", startedAt: now, updatedAt: now })
      .where(eq(premiumRentals.id, opts.rentalId));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "GCP deploy failed";
    await db
      .update(deployments)
      .set({ status: "failed", statusMessage: message, updatedAt: new Date() })
      .where(eq(deployments.id, opts.deploymentId));
    await db
      .update(premiumRentals)
      .set({ status: "stopped", endedAt: new Date(), updatedAt: new Date() })
      .where(eq(premiumRentals.id, opts.rentalId));
  }
}

export async function stopRental(orgId: string, id: string) {
  const db = getDb();
  const row = await findRentalForOrg(orgId, id);
  if (!row) return row;
  if (row.status === "stopped") return row;

  if (row.ownsDeployment && row.deploymentId) {
    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, row.deploymentId),
    });
    if (deployment) {
      if (deployment.target === "local") {
        await stopLocalGpuModel(deployment.runtimeModel);
      }
      if (deployment.target === "gcp") {
        await deleteGcpGpuService(deployment.gcpResourceId);
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
  if (updated?.hostShareId) await settleRentalById(updated.id);
  return updated;
}
