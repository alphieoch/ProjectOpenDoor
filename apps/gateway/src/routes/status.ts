import type { Context } from "hono";
import Redis from "ioredis";
import { db } from "@opendoor/database";
import { AzureFoundryProvider } from "../providers/azure-foundry.js";
import { getProvider, listProviders } from "../providers/index.js";

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
] as const;

export async function statusHandler(c: Context) {
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
    client = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
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
  const providers = PROVIDER_ORDER.map((slug) => ({
    slug,
    name: registered.get(slug) ?? PROVIDER_LABELS[slug] ?? slug,
    configured: registered.has(slug),
  }));

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

  return c.json({
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
  });
}
