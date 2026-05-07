import type { Context } from "hono";
import { getComponents, updateComponent, CachetStatus } from "../lib/cachet.js";
import { getStatusData } from "./status.js";

const COMPONENT_NAME_MAP: Record<string, string> = {
  gateway: "OpenDoor Gateway",
  database: "PostgreSQL",
  redis: "Redis",
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

function mapStatusToCachet(
  status: "up" | "down" | "unknown" | "not_configured"
): number {
  switch (status) {
    case "up":
      return CachetStatus.Operational;
    case "down":
      return CachetStatus.MajorOutage;
    case "unknown":
      return CachetStatus.PartialOutage;
    case "not_configured":
      return CachetStatus.Operational;
    default:
      return CachetStatus.Operational;
  }
}

function mapOverallStatus(overall: string): number {
  switch (overall) {
    case "operational":
      return CachetStatus.Operational;
    case "degraded":
      return CachetStatus.PerformanceIssues;
    default:
      return CachetStatus.Operational;
  }
}

/**
 * Sync OpenDoor health data to Cachet components and metrics.
 * Can be triggered by a cron job or called manually.
 */
export async function cachetSyncHandler(c: Context) {
  const internalKey = process.env.INTERNAL_API_KEY;
  const authHeader = c.req.header("x-internal-api-key");
  if (internalKey && authHeader !== internalKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const cachetEnabled = process.env.CACHET_ENABLED === "true" || !!process.env.CACHET_API_KEY;
  if (!cachetEnabled) {
    return c.json({ error: "Cachet integration disabled" }, 503);
  }

  // Fetch current health data from our own status endpoint logic
  const body = await getStatusData();

  // Get existing Cachet components
  const components = await getComponents();
  const componentMap = new Map(components.map((c) => [c.name, c.id]));

  const results: { component: string; id: number | undefined; updated: boolean }[] = [];

  // Map gateway overall status
  const gatewayName = COMPONENT_NAME_MAP.gateway;
  const gatewayId = componentMap.get(gatewayName);
  if (gatewayId != null) {
    const updated = await updateComponent(gatewayId, mapOverallStatus(body.status));
    results.push({ component: gatewayName, id: gatewayId, updated });
  }

  // Map database status
  const dbName = COMPONENT_NAME_MAP.database;
  const dbId = componentMap.get(dbName);
  if (dbId != null && body.database) {
    const updated = await updateComponent(dbId, mapStatusToCachet(body.database.status));
    results.push({ component: dbName, id: dbId, updated });
  }

  // Map redis status
  const redisName = COMPONENT_NAME_MAP.redis;
  const redisId = componentMap.get(redisName);
  if (redisId != null && body.redis) {
    const updated = await updateComponent(redisId, mapStatusToCachet(body.redis.status));
    results.push({ component: redisName, id: redisId, updated });
  }

  // Map provider statuses
  if (Array.isArray(body.providers)) {
    for (const provider of body.providers) {
      const name = COMPONENT_NAME_MAP[provider.slug] || provider.name || provider.slug;
      const id = componentMap.get(name);
      if (id != null) {
        const status = provider.configured
          ? CachetStatus.Operational
          : CachetStatus.Operational; // not_configured is still OK
        const updated = await updateComponent(id, status);
        results.push({ component: name, id, updated });
      }
    }
  }

  return c.json({
    synced: results.filter((r) => r.updated).length,
    total: results.length,
    details: results,
  });
}
