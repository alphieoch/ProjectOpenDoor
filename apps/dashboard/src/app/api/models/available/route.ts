import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { models, providers, deployments, pricingRules } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { hasDeviceInventoryConsent } from "@/lib/gpu/consent";
import { inferModelModality, type ModelModality } from "@/lib/models/modality";
import { isCatalogRowReady } from "@/lib/models/ready";
import { shouldAdvertiseServerlessModel } from "@opendoor/shared";

export type ModelLocation = "here" | "cloud";

export type AvailableModel = {
  id: string;
  label: string;
  provider: string;
  family: "open_weight" | "closed" | string;
  status: string;
  origin: string;
  source: string;
  location: ModelLocation;
  listedAt: string | null;
  isNew: boolean;
  pricePer1MInputUsd: number | null;
  pricePer1MOutputUsd: number | null;
  context: string;
  vision: boolean;
  tools: boolean;
  modality: ModelModality;
  ready: boolean;
  mine?: boolean;
};

function inferLocation(opts: {
  provider: string;
  label: string;
  source?: string | null;
  target?: string | null;
  mine?: boolean;
}): ModelLocation {
  if (opts.target === "local") return "here";
  if (opts.target === "gcp" || opts.target === "azure") return "cloud";
  const provider = opts.provider.toLowerCase();
  const label = opts.label.toLowerCase();
  if (provider.includes("local") || label.includes("this mac")) return "here";
  if (opts.mine && opts.source === "ollama") return "here";
  return "cloud";
}

const STATUS_RANK: Record<string, number> = {
  live: 0,
  dedicated: 1,
  warming: 2,
  available_on_request: 3,
  coming_soon: 4,
  unavailable: 5,
};

const MODALITY_RANK: Record<ModelModality, number> = {
  chat: 0,
  embedding: 1,
  rerank: 2,
  image: 3,
  video: 4,
};

function weekAgo(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = session.orgId as string;
  const db = getDb();
  const result: AvailableModel[] = [];
  const cutoff = weekAgo();

  try {
    const dbModels = await db
      .select({
        modelId: models.modelId,
        displayName: models.displayName,
        providerName: providers.name,
        providerSlug: providers.slug,
        deploymentStatus: models.deploymentStatus,
        family: models.family,
        source: models.source,
        listedAt: models.listedAt,
        createdAt: models.createdAt,
        contextWindow: models.contextWindow,
        supportsVision: models.supportsVision,
        supportsTools: models.supportsTools,
      })
      .from(models)
      .leftJoin(providers, eq(models.providerId, providers.id))
      .where(eq(models.enabled, true));

    const priceRows = await db
      .select({
        modelId: pricingRules.modelId,
        finalInput: pricingRules.finalInputCostPer1K,
        finalOutput: pricingRules.finalOutputCostPer1K,
      })
      .from(pricingRules);

    const priceMap = new Map(
      priceRows.map((p) => [
        p.modelId,
        {
          in: Number(p.finalInput) * 1000,
          out: Number(p.finalOutput) * 1000,
        },
      ])
    );

    for (const m of dbModels) {
      if (!m.modelId) continue;
      if (m.deploymentStatus === "coming_soon") continue;
      const listed = m.listedAt || m.createdAt;
      const price = priceMap.get(m.modelId);
      const provider = m.providerName || m.providerSlug || "Unknown";
      const label = m.displayName || m.modelId;
      result.push({
        id: m.modelId,
        label,
        provider,
        family: m.family || "closed",
        status:
          (m.providerSlug === "together" || m.providerSlug === "vertex") &&
          !shouldAdvertiseServerlessModel(m.modelId, { providerSlug: m.providerSlug || undefined })
            ? "unavailable"
            : m.deploymentStatus || "warming",
        origin: "global",
        source: m.source || "provider_api",
        location: inferLocation({
          provider,
          label,
          source: m.source,
        }),
        listedAt: listed ? new Date(listed).toISOString() : null,
        isNew: listed ? new Date(listed) >= cutoff : false,
        pricePer1MInputUsd: price?.in ?? null,
        pricePer1MOutputUsd: price?.out ?? null,
        context: m.contextWindow ? `${m.contextWindow >= 1000 ? `${Math.round(m.contextWindow / 1000)}K` : m.contextWindow}` : "—",
        vision: Boolean(m.supportsVision),
        tools: Boolean(m.supportsTools),
        modality: inferModelModality(m.modelId, m.displayName || ""),
        ready: isCatalogRowReady({
          providerSlug: m.providerSlug,
          source: m.source,
          family: m.family,
          id: m.modelId,
        }),
      });
    }
  } catch (err: any) {
    console.error("[models/available] Failed to fetch DB models:", err.message);
  }

  try {
    const orgDeployments = await db
      .select({
        id: deployments.id,
        name: deployments.name,
        status: deployments.status,
        target: deployments.target,
      })
      .from(deployments)
      .where(and(eq(deployments.organizationId, orgId), eq(deployments.status, "running")));

    for (const d of orgDeployments) {
      const provider = d.target === "local" ? "Local GPU" : d.target === "gcp" ? "GCP GPU" : "Custom";
      const location = inferLocation({
        provider,
        label: d.name,
        source: "ollama",
        target: d.target,
        mine: true,
      });
      result.push({
        id: `custom:${d.id}`,
        label: d.name,
        provider,
        family: "open_weight",
        status: "live",
        origin: "global",
        source: "ollama",
        location,
        listedAt: new Date().toISOString(),
        isNew: true,
        pricePer1MInputUsd: null,
        pricePer1MOutputUsd: null,
        context: "—",
        vision: false,
        tools: false,
        modality: inferModelModality(`custom:${d.id}`, d.name),
        ready: true,
        mine: true,
      });
    }

    const mayReadDevice = await hasDeviceInventoryConsent(session);
    try {
      if (!mayReadDevice) throw new Error("consent");
      const ollamaHost = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
      const ollamaRes = await fetch(`${ollamaHost}/api/tags`, {
        signal: AbortSignal.timeout(1500),
      });
      if (ollamaRes.ok) {
        const data = (await ollamaRes.json()) as { models?: Array<{ name?: string }> };
        for (const m of data.models || []) {
          if (!m.name) continue;
          result.push({
            id: m.name,
            label: `${m.name} (this Mac)`,
            provider: "Local GPU",
            family: "open_weight",
            status: "live",
            origin: "global",
            source: "ollama",
            location: "here",
            listedAt: null,
            isNew: false,
            pricePer1MInputUsd: null,
            pricePer1MOutputUsd: null,
            context: "—",
            vision: false,
            tools: false,
            modality: inferModelModality(m.name, m.name),
            ready: true,
            mine: true,
          });
        }
      }
    } catch {
      /* Ollama not running */
    }
  } catch (err: any) {
    console.error("[models/available] Failed to fetch deployments:", err.message);
  }

  const seen = new Set<string>();
  const deduped = result.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  // Ready chat models first so the playground default can actually run
  deduped.sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? -1 : 1;
    const aMod = MODALITY_RANK[a.modality] ?? 9;
    const bMod = MODALITY_RANK[b.modality] ?? 9;
    if (aMod !== bMod) return aMod - bMod;
    const aOpen = a.family === "open_weight" ? 0 : 1;
    const bOpen = b.family === "open_weight" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    const aRank = STATUS_RANK[a.status] ?? 9;
    const bRank = STATUS_RANK[b.status] ?? 9;
    if (aRank !== bRank) return aRank - bRank;
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return NextResponse.json({ models: deduped });
}
