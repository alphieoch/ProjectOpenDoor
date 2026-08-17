import { Hono } from "hono";
import { db, requests, providers } from "@opendoor/database";
import { and, eq } from "drizzle-orm";

const generationRouter = new Hono();

function toGeneration(row: typeof requests.$inferSelect, providerSlug: string | null) {
  return {
    id: row.id,
    object: "generation" as const,
    model: row.modelId,
    provider: providerSlug,
    tokens_prompt: row.promptTokens,
    tokens_completion: row.completionTokens,
    total_tokens: row.totalTokens,
    total_cost: Number(row.costUsd),
    latency_ms: row.latencyMs,
    created_at: row.createdAt,
    status: row.status,
    streamed: Boolean((row.metadata as any)?.streamed),
    metadata: row.metadata,
  };
}

async function loadGeneration(organizationId: string, id: string) {
  const row = await db.query.requests.findFirst({
    where: and(eq(requests.id, id), eq(requests.organizationId, organizationId)),
  });
  if (!row) return null;
  let providerSlug: string | null = null;
  try {
    const [p] = await db
      .select({ slug: providers.slug })
      .from(providers)
      .where(eq(providers.id, row.providerId))
      .limit(1);
    providerSlug = p?.slug || null;
  } catch {
    providerSlug = null;
  }
  return toGeneration(row, providerSlug);
}

generationRouter.get("/", async (c) => {
  const organization = c.get("organization");
  const id = c.req.query("id");
  if (!id) return c.json({ error: "id is required" }, 400);
  const gen = await loadGeneration(organization.id, id);
  if (!gen) return c.json({ error: "Generation not found" }, 404);
  return c.json({ data: gen, ...gen });
});

generationRouter.get("/:id", async (c) => {
  const organization = c.get("organization");
  const gen = await loadGeneration(organization.id, c.req.param("id"));
  if (!gen) return c.json({ error: "Generation not found" }, 404);
  return c.json({ data: gen, ...gen });
});

export default generationRouter;
