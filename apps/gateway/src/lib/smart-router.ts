// @ts-nocheck
import { getProvider, getFallbackChain, resolveProvider } from "../providers/index.js";
import { getAllHealthMetrics, type HealthMetrics } from "./health-tracker.js";
import { calculateCost, type BillingPlan, type ModelFamily } from "../utils/pricing.js";

export interface RankOptions {
  promptTokens: number;
  completionTokens: number;
  plan: BillingPlan;
  family: ModelFamily;
  region: string;
}

export interface RankedProvider {
  slug: string;
  score: number;
  health: HealthMetrics;
  estimatedCostUsd: number;
  canServe: boolean;
}

const HEALTH_WEIGHT = parseFloat(process.env.ROUTER_HEALTH_WEIGHT || "60");
const LATENCY_WEIGHT = parseFloat(process.env.ROUTER_LATENCY_WEIGHT || "30");
const COST_WEIGHT = parseFloat(process.env.ROUTER_COST_WEIGHT || "10");
const MAX_LATENCY_MS = parseFloat(process.env.ROUTER_MAX_LATENCY_MS || "10000");
const MAX_COST_USD = parseFloat(process.env.ROUTER_MAX_COST_USD || "0.5");
const MIN_HEALTH_THRESHOLD = parseFloat(process.env.ROUTER_MIN_HEALTH || "0.2");
const SMART_ROUTER_ENABLED = process.env.SMART_ROUTER_ENABLED !== "false";

const priceCache = new Map<string, { cost: number; cachedAt: number }>();
const PRICE_CACHE_TTL_MS = 30000;

async function getCachedCost(
  slug: string,
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  region: string,
  plan: BillingPlan,
  family: ModelFamily
): Promise<number> {
  const key = `${slug}:${modelId}:${region}:${plan}:${family}:${promptTokens}:${completionTokens}`;
  const cached = priceCache.get(key);
  if (cached && Date.now() - cached.cachedAt < PRICE_CACHE_TTL_MS) {
    return cached.cost;
  }
  try {
    const cost = await calculateCost({
      providerSlug: slug,
      modelId,
      promptTokens,
      completionTokens,
      region,
      plan,
      family,
    });
    priceCache.set(key, { cost: cost.totalCost, cachedAt: Date.now() });
    return cost.totalCost;
  } catch {
    priceCache.set(key, { cost: MAX_COST_USD, cachedAt: Date.now() });
    return MAX_COST_USD;
  }
}

function computeScore(health: HealthMetrics, costUsd: number): number {
  const healthComponent = (1 - health.successRate) * HEALTH_WEIGHT;
  const latencyComponent = Math.min(health.avgLatencyMs / MAX_LATENCY_MS, 1) * LATENCY_WEIGHT;
  const costComponent = Math.min(costUsd / MAX_COST_USD, 1) * COST_WEIGHT;
  return healthComponent + latencyComponent + costComponent;
}

export async function getRankedProviders(
  modelId: string,
  options: RankOptions
): Promise<RankedProvider[]> {
  const resolved = await resolveProvider(modelId);
  const fallbackSlugs = getFallbackChain(modelId);

  const candidateSlugs: string[] = [];
  if (resolved) candidateSlugs.push(resolved.provider.slug);
  for (const slug of fallbackSlugs) {
    if (!candidateSlugs.includes(slug)) candidateSlugs.push(slug);
  }

  if (candidateSlugs.length === 0) return [];

  // If smart router is disabled, return static chain with neutral scores
  if (!SMART_ROUTER_ENABLED) {
    return candidateSlugs.map((slug) => ({
      slug,
      score: candidateSlugs.indexOf(slug),
      health: {
        slug,
        successRate: 1,
        avgLatencyMs: 0,
        successCount: 0,
        errorCount: 0,
        totalCalls: 0,
        lastSeenAt: null,
      },
      estimatedCostUsd: 0,
      canServe: true,
    }));
  }

  const healthMap = await getAllHealthMetrics(candidateSlugs);
  const ranked: RankedProvider[] = [];

  for (const slug of candidateSlugs) {
    const provider = getProvider(slug);
    if (!provider) continue;

    const health = healthMap.get(slug)!;
    const estimatedCostUsd = await getCachedCost(
      slug,
      modelId,
      options.promptTokens,
      options.completionTokens,
      options.region,
      options.plan,
      options.family
    );

    const score = computeScore(health, estimatedCostUsd);

    ranked.push({
      slug,
      score,
      health,
      estimatedCostUsd,
      canServe: health.successRate >= MIN_HEALTH_THRESHOLD,
    });
  }

  ranked.sort((a, b) => a.score - b.score);
  return ranked;
}

export function getBestProviderSlug(ranked: RankedProvider[]): string | null {
  const best = ranked.find((p) => p.health.successRate >= MIN_HEALTH_THRESHOLD);
  return best?.slug || ranked[0]?.slug || null;
}
