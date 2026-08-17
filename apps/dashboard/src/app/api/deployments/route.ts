import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deployments, modelCatalog, organizations } from "@opendoor/database";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
  ACTIVE_DEPLOYMENT_STATUSES,
  GPU_RATES,
  gcpStartCreditCents,
  getPlan,
  splitCreditBuckets,
} from "@opendoor/shared";
import { expireWelcomeIfNeeded } from "@/lib/credits";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { startLocalGpuModel } from "@/lib/gpu/local-runner";
import { deployGpuToGcp } from "@/lib/gcp/deployer";
import { createContainerApp } from "@/lib/azure/deployer";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  const items = await db.query.deployments.findMany({
    where: eq(deployments.organizationId, orgId),
    orderBy: [desc(deployments.createdAt)],
  });

  return NextResponse.json({ deployments: items });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  const {
    name,
    sourceType,
    sourceValue,
    cpu,
    memoryGb,
    replicas,
    target = "gcp",
    gpuRequested = true,
    minReplicas,
    maxReplicas,
    scaleToZero = true,
    precision = "fp16",
    weightsUri,
    regionLocked = false,
    reserved = false,
  } = body;

  if (!name || !sourceType || !sourceValue) {
    return NextResponse.json(
      { error: "name, sourceType, and sourceValue are required" },
      { status: 400 }
    );
  }

  if (!["local", "gcp", "azure"].includes(target)) {
    return NextResponse.json({ error: "target must be local, gcp, or azure" }, { status: 400 });
  }

  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      id: true,
      plan: true,
      creditsUsdCents: true,
      welcomeCreditsUsdCents: true,
      welcomeExpiresAt: true,
    },
  });
  const limits = getPlan(org?.plan);
  const active = await db.query.deployments.findMany({
    where: and(
      eq(deployments.organizationId, orgId),
      inArray(deployments.status, [...ACTIVE_DEPLOYMENT_STATUSES])
    ),
    columns: { id: true },
  });
  if (target === "gcp" && gpuRequested) {
    const need = gcpStartCreditCents(Boolean(reserved) || scaleToZero === false);
    const buckets = org
      ? await expireWelcomeIfNeeded(org)
      : splitCreditBuckets({});
    if (buckets.paidCents < need) {
      const hourly = GPU_RATES["nvidia-l4"].listHourlyUsd;
      return NextResponse.json(
        {
          error: buckets.welcomeCents > 0
            ? `Welcome credit cannot start a cloud GPU. Add at least $${(need / 100).toFixed(0)} prepaid credit, or run on this Mac for $0.`
            : `GCP GPUs need at least $${(need / 100).toFixed(0)} prepaid credit. L4 is $${hourly.toFixed(2)}/hr while warm; scale-to-zero is $0 idle. Add credit on Billing, or run on this Mac for $0.`,
          requiredCents: need,
          creditsUsdCents: buckets.totalCents,
          paidCreditsUsdCents: buckets.paidCents,
          welcomeCreditsUsdCents: buckets.welcomeCents,
          hourlyUsd: hourly,
        },
        { status: 402 }
      );
    }
  }

  if (active.length >= limits.maxActiveDeployments) {
    return NextResponse.json(
      {
        error: `${limits.name} includes ${limits.maxActiveDeployments} concurrent dedicated deployments. Stop one or upgrade. GPU time is always billed per second.`,
        limit: limits.maxActiveDeployments,
      },
      { status: 402 }
    );
  }

  let imageUrl = sourceValue;
  let envVars: Record<string, string> = {};
  let catalogItem: typeof modelCatalog.$inferSelect | undefined;

  if (sourceType === "catalog") {
    catalogItem = await db.query.modelCatalog.findFirst({
      where: eq(modelCatalog.id, sourceValue),
    });
    if (!catalogItem) {
      return NextResponse.json({ error: "Catalog model not found" }, { status: 404 });
    }
    imageUrl = "vllm/vllm-openai:latest";
    envVars = {
      MODEL_ID: catalogItem.huggingFaceRepo || catalogItem.modelId,
      PORT: "8000",
    };
  }

  if (sourceType === "huggingface") {
    const repo = String(sourceValue).replace(/^https?:\/\/(www\.)?huggingface\.co\//i, "");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      return NextResponse.json({ error: "sourceValue must be an org/repo Hugging Face id" }, { status: 400 });
    }
    imageUrl = "vllm/vllm-openai:latest";
    envVars = { MODEL_ID: repo, PORT: "8000" };
    catalogItem = {
      modelId: repo.split("/").pop()!.toLowerCase(),
      huggingFaceRepo: repo,
      ollamaTag: `hf.co/${repo}`,
    } as typeof modelCatalog.$inferSelect;
  }

  const resolvedMin = reserved
    ? Math.max(1, typeof minReplicas === "number" ? minReplicas : 1)
    : typeof minReplicas === "number"
      ? minReplicas
      : scaleToZero
        ? 0
        : 1;
  const resolvedMax = typeof maxReplicas === "number" ? maxReplicas : Math.max(replicas || 1, 1);

  const [deployment] = await db
    .insert(deployments)
    .values({
      organizationId: orgId,
      name: name.slice(0, 100),
      sourceType,
      sourceValue,
      cpu: cpu || "0.5",
      memoryGb: memoryGb || "1.0",
      replicas: replicas || 1,
      target,
      gpuType: gpuRequested ? (target === "local" ? "metal" : "nvidia-l4") : "none",
      gpuCount: gpuRequested ? 1 : 0,
      minReplicas: resolvedMin,
      maxReplicas: resolvedMax,
      scaleToZero: reserved ? false : Boolean(scaleToZero),
      autoscalingEnabled: true,
      precision: typeof precision === "string" ? precision.slice(0, 20) : "fp16",
      weightsUri: typeof weightsUri === "string" ? weightsUri : null,
      regionLocked: Boolean(regionLocked),
      reserved: Boolean(reserved),
      status: "pending",
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "deployment.created",
    entityType: "deployment",
    entityId: deployment.id,
    metadata: {
      name,
      sourceType,
      sourceValue,
      target,
      gpuRequested,
      minReplicas: resolvedMin,
      maxReplicas: resolvedMax,
      scaleToZero,
      precision,
    },
  });

  runDeployment(deployment.id, {
    name,
    imageUrl,
    envVars,
    target,
    gpuRequested,
    catalogItem,
    compute: {
      cpu: cpu || "0.5",
      memoryGb: memoryGb || "1.0",
      replicas: replicas || 1,
    },
    scaling: {
      minReplicas: resolvedMin,
      maxReplicas: resolvedMax,
      scaleToZero: Boolean(scaleToZero),
      precision: typeof precision === "string" ? precision : "fp16",
      weightsUri: typeof weightsUri === "string" ? weightsUri : undefined,
    },
  }).catch((err) => {
    console.error("Deployment failed:", err);
  });

  return NextResponse.json({ deployment });
}

async function runDeployment(
  deploymentId: string,
  opts: {
    name: string;
    imageUrl: string;
    envVars: Record<string, string>;
    target: "local" | "gcp" | "azure";
    gpuRequested: boolean;
    catalogItem?: typeof modelCatalog.$inferSelect;
    compute: { cpu: string; memoryGb: string; replicas: number };
    scaling: {
      minReplicas: number;
      maxReplicas: number;
      scaleToZero: boolean;
      precision: string;
      weightsUri?: string;
    };
  }
) {
  const db = getDb();

  try {
    await db
      .update(deployments)
      .set({ status: "building", statusMessage: "Provisioning GPU…", updatedAt: new Date() })
      .where(eq(deployments.id, deploymentId));

    if (opts.target === "local") {
      const modelId = opts.catalogItem?.modelId || opts.envVars.MODEL_ID || opts.name;
      const result = await startLocalGpuModel({
        modelId,
        ollamaTag: opts.catalogItem?.ollamaTag,
      });

      await db
        .update(deployments)
        .set({
          status: "running",
          fqdn: result.fqdn,
          localRuntime: result.localRuntime,
          runtimeModel: result.runtimeModel,
          gpuType: result.gpuType,
          gpuCount: 1,
          statusMessage: `Running on this Mac (Metal) via Ollama · ${result.runtimeModel}`,
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(deployments.id, deploymentId));
      return;
    }

    if (opts.target === "gcp") {
      const hf =
        opts.scaling.weightsUri ||
        opts.catalogItem?.huggingFaceRepo ||
        opts.envVars.MODEL_ID ||
        opts.imageUrl;
      const result = await deployGpuToGcp({
        deploymentId,
        name: opts.name,
        huggingFaceRepo: hf,
        minReplicas: opts.scaling.minReplicas,
        maxReplicas: opts.scaling.maxReplicas,
        scaleToZero: opts.scaling.scaleToZero,
        precision: opts.scaling.precision,
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
          statusMessage: `Running on GCP Cloud Run GPU (${result.gpuType}) · min=${opts.scaling.minReplicas} max=${opts.scaling.maxReplicas}`,
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(deployments.id, deploymentId));
      return;
    }

    const { fqdn, resourceId } = await createContainerApp(
      `opendoor-${deploymentId.slice(0, 8)}`,
      opts.imageUrl,
      opts.envVars,
      opts.compute
    );

    await db
      .update(deployments)
      .set({
        status: "running",
        fqdn,
        azureResourceId: resourceId,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));
  } catch (error: any) {
    await db
      .update(deployments)
      .set({
        status: "failed",
        statusMessage: error.message,
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));
  }
}
