import type { Context } from "hono";
import Redis from "ioredis";
import { db } from "@opendoor/database";
import { AzureFoundryProvider } from "../providers/azure-foundry.js";
import { getProvider, listProviders } from "../providers/index.js";
import { getAllHealthMetrics, type HealthMetrics } from "../lib/health-tracker.js";

const PROVIDER_LABELS: Record<string, string> = {
  "azure-foundry": "Azure AI Foundry",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  cohere: "Cohere",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  custom: "Custom deployment",
  ollama: "Local GPU (Ollama)",
  vertex: "Vertex AI (Model Garden)",
  together: "Together (serverless)",
  groq: "Groq",
  xai: "xAI",
};

const PROVIDER_ORDER = [
  "azure-foundry",
  "openai",
  "anthropic",
  "google",
  "cohere",
  "mistral",
  "deepseek",
  "qwen",
  "custom",
  "ollama",
  "vertex",
  "together",
  "groq",
  "xai",
] as const;

export async function getStatusData() {
  const timestamp = new Date().toISOString();

  let database: { status: "up" | "down"; latencyMs: number | null } = {
    status: "down",
    latencyMs: null,
  };
  const dbStart = Date.now();
  try {
    await db.query.organizations.findFirst({ columns: { id: true } });
    database = { status: "up", latencyMs: Date.now() - dbStart };
  } catch {
    database = { status: "down", latencyMs: null };
  }

  let redis: { status: "up" | "down"; latencyMs: number | null } = {
    status: "down",
    latencyMs: null,
  };
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const rStart = Date.now();
  let client: InstanceType<typeof Redis> | null = null;
  try {
    // lazyConnect + connect() so ping is not rejected before the TCP session exists
    // (enableOfflineQueue:false otherwise fails in milliseconds on a cold client).
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      commandTimeout: 5000,
      lazyConnect: true,
      family: 4,
    });
    await client.connect();
    await client.ping();
    redis = { status: "up", latencyMs: Date.now() - rStart };
  } catch {
    redis = { status: "down", latencyMs: null };
  } finally {
    try {
      client?.disconnect();
    } catch {
      /* noop */
    }
  }

  const registered = new Map(listProviders().map((p) => [p.slug, p.name]));
  const configuredSlugs = PROVIDER_ORDER.filter((slug) => registered.has(slug));
  const healthMap = await getAllHealthMetrics(configuredSlugs);

  const providers = PROVIDER_ORDER.map((slug) => {
    const health = healthMap.get(slug);
    return {
      slug,
      name: registered.get(slug) ?? PROVIDER_LABELS[slug] ?? slug,
      configured: registered.has(slug),
      health: health
        ? {
            successRate: Math.round(health.successRate * 100) / 100,
            avgLatencyMs: health.avgLatencyMs,
            successCount: health.successCount,
            errorCount: health.errorCount,
            totalCalls: health.totalCalls,
            lastSeenAt: health.lastSeenAt,
          }
        : null,
    };
  });

  const azureConfigured = registered.has("azure-foundry");
  let azureHost: string | null = null;
  const rawEp = process.env.AZURE_AI_FOUNDRY_ENDPOINT;
  if (rawEp) {
    try {
      azureHost = new URL(rawEp.replace(/\/$/, "")).hostname;
    } catch {
      azureHost = null;
    }
  }

  let azureDeployments: { id: string; model: string; status: string }[] = [];
  let azureDeploymentTotal = 0;
  let azureFetchError: string | null = null;
  if (azureConfigured) {
    const azure = getProvider("azure-foundry");
    if (azure instanceof AzureFoundryProvider) {
      try {
        const all = await azure.getLiveDeployments();
        azureDeploymentTotal = all.length;
        azureDeployments = all.slice(0, 200);
      } catch (e) {
        azureFetchError = e instanceof Error ? e.message : "azure_list_failed";
      }
    }
  }

  const infraUp = database.status === "up" && redis.status === "up";
  const overall =
    infraUp && providers.some((p) => p.configured)
      ? "operational"
      : infraUp
        ? "degraded"
        : "degraded";

  return {
    timestamp,
    status: overall,
    service: "opendoor-gateway",
    version: "1.0.0",
    region: process.env.AZURE_REGION || "unknown",
    database,
    redis,
    providers,
    azure: {
      configured: azureConfigured,
      host: azureHost,
      deploymentCount: azureDeploymentTotal,
      deployments: azureDeployments,
      fetchError: azureFetchError,
    },
  };
}

export async function statusHandler(c: Context) {
  const data = await getStatusData();
  return c.json(data);
}
