import { getDb } from "@/lib/db";
import { deployments, modelCatalog, models } from "@opendoor/database";
import { and, eq, inArray, or } from "drizzle-orm";
import { deployGpuToGcp } from "@/lib/gcp/deployer";
import { isClosedApiModel, resolveHfRepo } from "@/lib/gcp/hf-repo";
import { inferModelModality } from "@/lib/models/modality";

export type GcpEnsureResult = {
  model: string;
  deploymentId: string;
  status: string;
  statusMessage: string | null;
  hfRepo: string;
  reused: boolean;
};

const ACTIVE = ["pending", "building", "running"] as const;

export async function ensureGcpModel(opts: {
  orgId: string;
  modelId: string;
}): Promise<GcpEnsureResult> {
  if (opts.modelId.startsWith("custom:")) {
    const deploymentId = opts.modelId.slice("custom:".length).split("/")[0];
    const db = getDb();
    const existing = await db.query.deployments.findFirst({
      where: and(eq(deployments.id, deploymentId), eq(deployments.organizationId, opts.orgId)),
    });
    if (!existing) throw new Error("Deployment not found");
    return {
      model: `custom:${existing.id}`,
      deploymentId: existing.id,
      status: existing.status,
      statusMessage: existing.statusMessage,
      hfRepo: existing.weightsUri || existing.sourceValue,
      reused: true,
    };
  }

  if (isClosedApiModel(opts.modelId)) {
    throw new Error(`${opts.modelId} is a hosted API model. It does not deploy to Cloud Run GPU.`);
  }
  if (inferModelModality(opts.modelId) !== "chat") {
    throw new Error(`${opts.modelId} is not a chat model.`);
  }

  const db = getDb();
  const [catalogRow, modelRow] = await Promise.all([
    db.query.modelCatalog.findFirst({
      where: or(eq(modelCatalog.modelId, opts.modelId), eq(modelCatalog.ollamaTag, opts.modelId)),
    }),
    db.query.models.findFirst({
      where: eq(models.modelId, opts.modelId),
    }),
  ]);

  const hfRepo = resolveHfRepo(
    opts.modelId,
    catalogRow?.huggingFaceRepo || modelRow?.huggingFaceRepo || null,
  );
  if (!hfRepo) {
    throw new Error(`No Hugging Face repo mapped for ${opts.modelId}, so it cannot start on Google Cloud.`);
  }

  const existing = await db.query.deployments.findFirst({
    where: and(
      eq(deployments.organizationId, opts.orgId),
      eq(deployments.target, "gcp"),
      inArray(deployments.status, [...ACTIVE]),
      or(
        eq(deployments.weightsUri, hfRepo),
        eq(deployments.sourceValue, hfRepo),
        eq(deployments.sourceValue, opts.modelId),
        eq(deployments.runtimeModel, opts.modelId),
        catalogRow ? eq(deployments.sourceValue, catalogRow.id) : eq(deployments.sourceValue, hfRepo),
      ),
    ),
  });

  if (existing) {
    return {
      model: `custom:${existing.id}`,
      deploymentId: existing.id,
      status: existing.status,
      statusMessage: existing.statusMessage,
      hfRepo,
      reused: true,
    };
  }

  const [created] = await db
    .insert(deployments)
    .values({
      organizationId: opts.orgId,
      name: `${opts.modelId} (GCP)`.slice(0, 100),
      sourceType: "huggingface",
      sourceValue: hfRepo,
      cpu: "4.0",
      memoryGb: "16.0",
      replicas: 1,
      target: "gcp",
      gpuType: "nvidia-l4",
      gpuCount: 1,
      minReplicas: 0,
      maxReplicas: 1,
      scaleToZero: true,
      precision: "fp16",
      weightsUri: hfRepo,
      status: "pending",
      statusMessage: "Queuing Google Cloud GPU…",
    })
    .returning();

  void runGcpDeploy(created.id, hfRepo).catch((err) => {
    console.error("[ensure-gcp]", err);
  });

  return {
    model: `custom:${created.id}`,
    deploymentId: created.id,
    status: created.status,
    statusMessage: created.statusMessage,
    hfRepo,
    reused: false,
  };
}

async function runGcpDeploy(deploymentId: string, hfRepo: string) {
  const db = getDb();
  try {
    await db
      .update(deployments)
      .set({ status: "building", statusMessage: `Pulling ${hfRepo} onto Cloud Run GPU…`, updatedAt: new Date() })
      .where(eq(deployments.id, deploymentId));

    const result = await deployGpuToGcp({
      deploymentId,
      name: hfRepo,
      huggingFaceRepo: hfRepo,
      minReplicas: 0,
      maxReplicas: 1,
      scaleToZero: true,
      precision: "fp16",
    });

    await db
      .update(deployments)
      .set({
        status: "running",
        fqdn: result.fqdn,
        gcpResourceId: result.gcpResourceId,
        runtimeModel: result.runtimeModel,
        gpuType: result.gpuType,
        gpuCount: 1,
        statusMessage: `Running on GCP Cloud Run GPU (${result.gpuType}) · ${hfRepo}`,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));
  } catch (error: any) {
    await db
      .update(deployments)
      .set({
        status: "failed",
        statusMessage: error?.message || "GCP deploy failed",
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));
  }
}
