import { Hono } from "hono";
import { db, batchJobs } from "@opendoor/database";
import { and, desc, eq } from "drizzle-orm";
import type { BatchRequestLine, ChatCompletionRequest } from "@opendoor/shared";
import { resolveProvider } from "../providers/index.js";
import { calculateCost } from "../utils/pricing.js";
import { debitUsage, usdToCents } from "../utils/billing.js";
import { logGatewayRequest } from "../lib/request-log.js";

const MAX_BATCH = 100;
const batchesRouter = new Hono();

function toApi(row: typeof batchJobs.$inferSelect) {
  return {
    id: row.id,
    object: "batch" as const,
    endpoint: row.endpoint,
    status: row.status,
    model: row.modelId,
    request_counts: {
      total: row.totalCount,
      completed: row.completedCount,
      failed: row.failedCount,
    },
    output: row.output,
    error: row.error,
    created_at: Math.floor(new Date(row.createdAt).getTime() / 1000),
    completed_at: row.completedAt
      ? Math.floor(new Date(row.completedAt).getTime() / 1000)
      : null,
  };
}

function normalizeLines(body: any): BatchRequestLine[] {
  if (Array.isArray(body.requests)) {
    return body.requests.map((r: any, i: number) => ({
      custom_id: r.custom_id || `req-${i + 1}`,
      method: "POST" as const,
      url: r.url || "/v1/chat/completions",
      body: r.body,
    }));
  }
  if (Array.isArray(body.input)) {
    return body.input.map((r: any, i: number) => ({
      custom_id: r.custom_id || `req-${i + 1}`,
      method: "POST" as const,
      url: "/v1/chat/completions",
      body: (r.body || r) as ChatCompletionRequest,
    }));
  }
  return [];
}

async function runBatch(jobId: string, organizationId: string, apiKeyId: string) {
  const job = await db.query.batchJobs.findFirst({
    where: eq(batchJobs.id, jobId),
  });
  if (!job) return;

  await db
    .update(batchJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(batchJobs.id, jobId));

  const lines = (job.input as BatchRequestLine[]) || [];
  const output: Array<{
    custom_id: string;
    response?: unknown;
    error?: { message: string };
  }> = [];
  let completed = 0;
  let failed = 0;

  for (const line of lines) {
    try {
      const model = line.body?.model;
      if (!model) throw new Error("Each request body needs a model");
      const resolved = await resolveProvider(model);
      if (!resolved) throw new Error(`Model not found: ${model}`);
      const started = Date.now();
      const response = await resolved.provider.chatCompletion({
        ...line.body,
        model: resolved.model,
        stream: false,
      });
      const promptTokens = response.usage?.prompt_tokens || 0;
      const completionTokens = response.usage?.completion_tokens || 0;
      let costUsd = 0;
      try {
        const cost = await calculateCost({
          providerSlug: resolved.provider.slug,
          modelId: model,
          promptTokens,
          completionTokens,
        });
        const multiplier = 0.5;
        costUsd = cost.totalCost * multiplier;
        await debitUsage({
          organizationId,
          apiKeyId,
          amountCents: usdToCents(costUsd),
          useFromPlan: false,
          useFromCredits: true,
        });
      } catch {
        /* optional */
      }
      await logGatewayRequest({
        apiKeyId,
        organizationId,
        providerSlug: resolved.provider.slug,
        modelId: model,
        requestType: "chat",
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - started,
        costUsd,
      });
      output.push({ custom_id: line.custom_id, response });
      completed += 1;
    } catch (err: any) {
      output.push({
        custom_id: line.custom_id,
        error: { message: err.message || "Request failed" },
      });
      failed += 1;
    }
  }

  await db
    .update(batchJobs)
    .set({
      status: failed === lines.length && lines.length > 0 ? "failed" : "completed",
      output,
      completedCount: completed,
      failedCount: failed,
      completedAt: new Date(),
      error: failed === lines.length ? "All requests failed" : null,
    })
    .where(eq(batchJobs.id, jobId));
}

batchesRouter.post("/", async (c) => {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  const body = await c.req.json();
  const lines = normalizeLines(body);

  if (lines.length === 0) {
    return c.json(
      { error: "Provide requests[] or input[] of chat completion bodies" },
      400
    );
  }
  if (lines.length > MAX_BATCH) {
    return c.json({ error: `Batch is capped at ${MAX_BATCH} requests in v1` }, 400);
  }

  const [row] = await db
    .insert(batchJobs)
    .values({
      organizationId: organization.id,
      apiKeyId: apiKey.id,
      endpoint: body.endpoint || "/v1/chat/completions",
      modelId: lines[0]?.body?.model || null,
      status: "pending",
      input: lines,
      totalCount: lines.length,
    })
    .returning();

  setTimeout(() => {
    runBatch(row.id, organization.id, apiKey.id).catch((err) => {
      console.error("[batches] run failed", err);
      db.update(batchJobs)
        .set({ status: "failed", error: String(err?.message || err) })
        .where(eq(batchJobs.id, row.id))
        .catch(() => undefined);
    });
  }, 0);

  return c.json(toApi(row), 202);
});

batchesRouter.get("/", async (c) => {
  const organization = c.get("organization");
  const rows = await db
    .select()
    .from(batchJobs)
    .where(eq(batchJobs.organizationId, organization.id))
    .orderBy(desc(batchJobs.createdAt))
    .limit(50);
  return c.json({ object: "list", data: rows.map(toApi) });
});

batchesRouter.get("/:id", async (c) => {
  const organization = c.get("organization");
  const row = await db.query.batchJobs.findFirst({
    where: and(
      eq(batchJobs.id, c.req.param("id")),
      eq(batchJobs.organizationId, organization.id)
    ),
  });
  if (!row) return c.json({ error: "Batch not found" }, 404);
  return c.json(toApi(row));
});

export default batchesRouter;
