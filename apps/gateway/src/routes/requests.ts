import { Hono } from "hono";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, apiKeys, providers, requests } from "@opendoor/database";
import { requireTenant } from "../lib/platform.js";

const requestsRouter = new Hono();

requestsRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 50)));
  const status = c.req.query("status");
  const q = (c.req.query("q") || "").trim().replace(/[%_]/g, "");
  const filters = [eq(requests.organizationId, tenant.organization.id)];
  if (status === "success" || status === "error" || status === "cached") {
    filters.push(eq(requests.status, status));
  }
  if (q) {
    filters.push(or(ilike(requests.modelId, `%${q}%`), ilike(requests.region, `%${q}%`))!);
  }
  const rows = await db
    .select({
      id: requests.id,
      model_id: requests.modelId,
      request_type: requests.requestType,
      prompt_tokens: requests.promptTokens,
      completion_tokens: requests.completionTokens,
      total_tokens: requests.totalTokens,
      latency_ms: requests.latencyMs,
      cost_usd: requests.costUsd,
      status: requests.status,
      error_message: requests.errorMessage,
      region: requests.region,
      created_at: requests.createdAt,
      provider: providers.slug,
      api_key_name: apiKeys.name,
      api_key_prefix: apiKeys.keyPrefix,
    })
    .from(requests)
    .leftJoin(providers, eq(requests.providerId, providers.id))
    .leftJoin(apiKeys, eq(requests.apiKeyId, apiKeys.id))
    .where(and(...filters))
    .orderBy(desc(requests.createdAt))
    .limit(limit);
  return c.json({ object: "list", data: rows });
});

requestsRouter.get("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [row] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, c.req.param("id")), eq(requests.organizationId, tenant.organization.id)))
    .limit(1);
  if (!row) return c.json({ error: "Request not found" }, 404);
  return c.json({ object: "request", ...row });
});

export default requestsRouter;
