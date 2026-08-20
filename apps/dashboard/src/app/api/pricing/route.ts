import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { pricingRules, providers, models, gpuSkus, deployments, requests } from "@opendoor/database";
import { eq, and, lte, isNull, asc, gte, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { hasDeviceInventoryConsent } from "@/lib/gpu/consent";
import { detectGpuStatus } from "@/lib/gpu/detect";
import { inferModelModality } from "@/lib/models/modality";
import { resolveModelRuntime } from "@/lib/models/runtime";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region") || "global";

    const db = getDb();
    const now = new Date();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rules = await db
      .select({
        id: pricingRules.id,
        modelId: pricingRules.modelId,
        region: pricingRules.region,
        inputCostPer1K: pricingRules.inputCostPer1K,
        outputCostPer1K: pricingRules.outputCostPer1K,
        markupPercent: pricingRules.markupPercent,
        finalInputCostPer1K: pricingRules.finalInputCostPer1K,
        finalOutputCostPer1K: pricingRules.finalOutputCostPer1K,
        providerName: providers.name,
        providerSlug: providers.slug,
        family: models.family,
        status: models.deploymentStatus,
        displayName: models.displayName,
      })
      .from(pricingRules)
      .innerJoin(providers, eq(pricingRules.providerId, providers.id))
      .leftJoin(
        models,
        and(eq(models.modelId, pricingRules.modelId), eq(models.providerId, providers.id)),
      )
      .where(
        and(
          eq(pricingRules.region, region),
          lte(pricingRules.effectiveFrom, now),
          isNull(pricingRules.effectiveTo),
        ),
      )
      .orderBy(pricingRules.modelId);

  let skuRows: Array<{
    sku: string;
    displayName: string;
    hourlyUsd: string;
    regionMultiplier: string | null;
    enabled: boolean;
    sortOrder: number;
  }> = [];
  try {
    skuRows = await db
      .select({
        sku: gpuSkus.sku,
        displayName: gpuSkus.displayName,
        hourlyUsd: gpuSkus.hourlyUsd,
        regionMultiplier: gpuSkus.regionMultiplier,
        enabled: gpuSkus.enabled,
        sortOrder: gpuSkus.sortOrder,
      })
      .from(gpuSkus)
      .where(eq(gpuSkus.enabled, true))
      .orderBy(asc(gpuSkus.sortOrder));
  } catch {
    skuRows = [];
  }

  const mayReadDevice = await hasDeviceInventoryConsent(session);
  const live = mayReadDevice
    ? await detectGpuStatus()
    : {
        local: {
          appleSilicon: false,
          ollamaInstalled: false,
          ollamaRunning: false,
          models: [] as string[],
          hardware: { chip: null, memoryGb: null, gpuName: null, gpuMemoryGb: null, usableMemoryGb: null },
        },
        gcp: { authenticated: false, account: null, project: null, region: "", runApiLikely: false },
      };
  const gcpReady = Boolean(live.gcp.runApiLikely);
  const metalReady = Boolean(live.local.appleSilicon);
  const localModels = live.local.models || [];

  const catalog = await db
    .select({
      modelId: models.modelId,
      displayName: models.displayName,
      family: models.family,
      source: models.source,
      status: models.deploymentStatus,
      contextWindow: models.contextWindow,
      supportsVision: models.supportsVision,
      supportsTools: models.supportsTools,
      ollamaTag: models.ollamaTag,
      providerName: providers.name,
      providerSlug: providers.slug,
    })
    .from(models)
    .leftJoin(providers, eq(models.providerId, providers.id))
    .where(eq(models.enabled, true));

  let orgDeploys: Array<{
    runtimeModel: string | null;
    gpuType: string;
    name: string;
    status: string;
  }> = [];
  try {
    orgDeploys = await db
      .select({
        runtimeModel: deployments.runtimeModel,
        gpuType: deployments.gpuType,
        name: deployments.name,
        status: deployments.status,
      })
      .from(deployments)
      .where(and(eq(deployments.organizationId, session.orgId), eq(deployments.status, "running")));
  } catch {
    orgDeploys = [];
  }

  const deployGpu = new Map<string, string>();
  for (const d of orgDeploys) {
    if (d.runtimeModel) deployGpu.set(d.runtimeModel, d.gpuType);
  }

  let latencyRows: Array<{ modelId: string; avgMs: number; calls: number }> = [];
  try {
    latencyRows = await db
      .select({
        modelId: requests.modelId,
        avgMs: sql<number>`COALESCE(AVG(${requests.latencyMs}), 0)`,
        calls: sql<number>`COUNT(*)`,
      })
      .from(requests)
      .where(and(eq(requests.organizationId, session.orgId), gte(requests.createdAt, since)))
      .groupBy(requests.modelId);
  } catch {
    latencyRows = [];
  }
  const livePerf = new Map(latencyRows.map((r) => [r.modelId, { avgMs: Number(r.avgMs), calls: Number(r.calls) }]));

  const seen = new Set<string>();
  const availableModels: Array<Record<string, unknown>> = [];

  const pushModel = (row: {
    modelId: string;
    label: string;
    providerName: string;
    providerSlug?: string | null;
    family?: string | null;
    source?: string | null;
    status?: string | null;
    contextWindow?: number | null;
    vision?: boolean;
    tools?: boolean;
    ollamaTag?: string | null;
    mine?: boolean;
  }) => {
    if (!row.modelId || seen.has(row.modelId)) return;
    seen.add(row.modelId);
    const runtime = resolveModelRuntime({
      modelId: row.modelId,
      label: row.label,
      family: row.family,
      source: row.source,
      providerSlug: row.providerSlug,
      ollamaTag: row.ollamaTag,
      deploymentGpu: deployGpu.get(row.modelId) || null,
      localModels,
      metalReady,
      ollamaRunning: live.local.ollamaRunning,
      gcpReady,
    });
    const liveRow = livePerf.get(row.modelId);
    const ctx = row.contextWindow
      ? row.contextWindow >= 1000
        ? `${Math.round(row.contextWindow / 1000)}K`
        : String(row.contextWindow)
      : "—";
    availableModels.push({
      id: row.modelId,
      label: row.label,
      provider: row.providerName,
      family: row.family || "closed",
      modality: inferModelModality(row.modelId, row.label),
      status: row.status || "live",
      available: runtime.available || Boolean(row.mine),
      mine: Boolean(row.mine),
      gpu: {
        sku: runtime.sku,
        label: runtime.gpuLabel,
        available: runtime.available,
        reason: runtime.reason,
      },
      performance: {
        context: ctx,
        paramB: runtime.paramB,
        tokPerSec: runtime.tokPerSec,
        ttftMs: runtime.ttftMs,
        liveLatencyMs: liveRow && liveRow.calls > 0 ? Math.round(liveRow.avgMs) : null,
        liveRequests: liveRow?.calls || 0,
        class: runtime.perfClass,
        vision: Boolean(row.vision),
        tools: Boolean(row.tools),
      },
    });
  };

  for (const m of catalog) {
    if (m.status === "coming_soon") continue;
    pushModel({
      modelId: m.modelId,
      label: m.displayName || m.modelId,
      providerName: m.providerName || m.providerSlug || "Unknown",
      providerSlug: m.providerSlug,
      family: m.family,
      source: m.source,
      status: m.status,
      contextWindow: m.contextWindow,
      vision: Boolean(m.supportsVision),
      tools: Boolean(m.supportsTools),
      ollamaTag: m.ollamaTag,
    });
  }

  for (const tag of localModels) {
    pushModel({
      modelId: tag,
      label: `${tag} (this Mac)`,
      providerName: "Local GPU",
      providerSlug: "ollama",
      family: "open_weight",
      source: "ollama",
      status: "live",
      ollamaTag: tag,
      mine: true,
    });
  }

  for (const d of orgDeploys) {
    if (!d.runtimeModel) continue;
    pushModel({
      modelId: d.runtimeModel,
      label: d.name,
      providerName: d.gpuType === "metal" ? "Local GPU" : "GCP GPU",
      providerSlug: d.gpuType === "metal" ? "ollama" : "custom",
      family: "open_weight",
      source: d.gpuType === "metal" ? "ollama" : "huggingface",
      status: "live",
      mine: true,
    });
  }

  availableModels.sort((a, b) => {
    const av = Number(Boolean(a.available));
    const bv = Number(Boolean(b.available));
    if (av !== bv) return bv - av;
    return String(a.label).localeCompare(String(b.label));
  });

  const gpus = [
    {
      sku: "metal",
      displayName: "This Mac (Apple Silicon)",
      hourlyUsd: 0,
      regionMultiplier: 1,
      available: metalReady,
      availability: metalReady
        ? live.local.ollamaRunning
          ? `Ready · Ollama${localModels.length ? ` · ${localModels.length} local models` : ""}`
          : "Apple Silicon · start Ollama to serve locally"
        : "Not this machine",
      kind: "local" as const,
    },
    ...skuRows.map((g) => {
      const l4 = g.sku === "nvidia-l4";
      const available = l4 ? gcpReady : false;
      return {
        sku: g.sku,
        displayName: g.displayName,
        hourlyUsd: Number(g.hourlyUsd),
        regionMultiplier: Number(g.regionMultiplier || 1),
        available,
        availability: available
          ? `Ready on GCP · ${live.gcp.project || "project"} · ${live.gcp.region}`
          : l4
            ? "Sign in with gcloud to provision on Cloud Run"
            : "On request — reserved capacity",
        kind: "cloud" as const,
      };
    }),
  ];

  return NextResponse.json({
    markupDefault: 15,
    markupMin: 10,
    markupMax: 20,
    rules: rules.map((r) => ({
      id: r.id,
      modelId: r.modelId,
      label: r.displayName || r.modelId,
      providerName: r.providerName,
      providerSlug: r.providerSlug,
      family: r.family || "closed",
      status: r.status || "live",
      modality: inferModelModality(r.modelId, r.displayName || ""),
      available: (r.status || "live") === "live" || (r.status || "") === "dedicated",
      inputCostPer1K: r.inputCostPer1K,
      outputCostPer1K: r.outputCostPer1K,
      markupPercent: r.markupPercent,
      finalInputCostPer1K: r.finalInputCostPer1K,
      finalOutputCostPer1K: r.finalOutputCostPer1K,
    })),
    availableModels,
    gpus,
    gpuLive: {
      local: live.local,
      gcp: live.gcp,
    },
  });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load pricing";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      {
        error: message,
        markupDefault: 15,
        markupMin: 10,
        markupMax: 20,
        rules: [],
        availableModels: [],
        gpus: [],
        gpuLive: {
          local: { hasGpu: false, ollamaRunning: false, activeModels: [] },
          gcp: { ready: false, activeDeployments: [] },
        },
      },
      { status: 500 },
    );
  }
}
