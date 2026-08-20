import { initTracing } from "./lib/tracing.js";
initTracing();

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { policyMiddleware } from "./middleware/policy.js";
import chatRouter from "./routes/chat.js";
import modelsRouter from "./routes/models.js";
import usageRouter from "./routes/usage.js";
import analyticsRouter from "./routes/analytics.js";
import embeddingsRouter from "./routes/embeddings.js";
import rerankRouter from "./routes/rerank.js";
import completionsRouter from "./routes/completions.js";
import batchesRouter from "./routes/batches.js";
import imagesRouter from "./routes/images.js";
import videosRouter from "./routes/videos.js";
import audioRouter from "./routes/audio.js";
import generationRouter from "./routes/generation.js";
import pluginsRouter from "./routes/plugins.js";
import responsesRouter from "./routes/responses.js";
import filesRouter from "./routes/files.js";
import premiumRouter from "./routes/premium.js";
import accountRouter from "./routes/account.js";
import assistantsRouter from "./routes/assistants.js";
import workflowsRouter from "./routes/workflows.js";
import trainingRouter from "./routes/training.js";
import deploymentsRouter from "./routes/deployments.js";
import agentsRouter from "./routes/agents.js";
import byokRouter from "./routes/byok.js";
import keysRouter from "./routes/keys.js";
import requestsRouter from "./routes/requests.js";
import policiesRouter from "./routes/policies.js";
import catalogRouter from "./routes/catalog.js";
import toolsRouter from "./routes/tools.js";
import { statusHandler } from "./routes/status.js";
import { cachetSyncHandler } from "./routes/cachet-sync.js";
import { startBatchWorker } from "./lib/batch-worker.js";

const app = new Hono();

app.use(cors());
app.use(logger());

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "opendoor-gateway",
    version: "1.0.0",
    region: process.env.GCP_REGION || process.env.AZURE_REGION || "local",
  });
});

/** Public status: Postgres, Redis, and which LLM providers loaded (real env configuration). */
app.get("/status", (c) => statusHandler(c));
/** Same JSON when Firebase Hosting `/status` is the dashboard marketing page. */
app.get("/gateway/status", (c) => statusHandler(c));

/** Push health data to Cachet status page. */
app.post("/internal/cachet-sync", (c) => cachetSyncHandler(c));

app.use("/v1/*", authMiddleware);
app.use("/v1/*", rateLimitMiddleware);
app.use("/v1/*", policyMiddleware);

app.route("/v1/chat", chatRouter);
app.route("/v1/embeddings", embeddingsRouter);
app.route("/v1/rerank", rerankRouter);
app.route("/v1/completions", completionsRouter);
app.route("/v1/batches", batchesRouter);
app.route("/v1/images", imagesRouter);
app.route("/v1/videos", videosRouter);
app.route("/v1/audio", audioRouter);
app.route("/v1/generation", generationRouter);
app.route("/v1/generations", generationRouter);
app.route("/v1/plugins", pluginsRouter);
app.route("/v1/responses", responsesRouter);
app.route("/v1/files", filesRouter);
app.route("/v1/premium", premiumRouter);
app.route("/v1/models", modelsRouter);
app.route("/v1/usage", usageRouter);
app.route("/v1/analytics", analyticsRouter);
app.route("/v1/account", accountRouter);
app.route("/v1/assistants", assistantsRouter);
app.route("/v1/workflows", workflowsRouter);
app.route("/v1/training", trainingRouter);
app.route("/v1/deployments", deploymentsRouter);
app.route("/v1/agents", agentsRouter);
app.route("/v1/byok", byokRouter);
app.route("/v1/keys", keysRouter);
app.route("/v1/requests", requestsRouter);
app.route("/v1/policies", policiesRouter);
app.route("/v1/catalog", catalogRouter);
app.route("/v1/tools", toolsRouter);

app.onError((err, c) => {
  const orgId = c.get("organization")?.id || "gateway";
  void import("./lib/posthog.js")
    .then(({ captureGatewayException }) => {
      captureGatewayException(orgId, err, { path: c.req.path });
    })
    .catch(() => undefined);
  return c.json(
    { error: { message: err.message || "Internal error", type: "internal_error" } },
    500
  );
});

app.get("/v1/models/:model", async (c) => {
  const modelId = c.req.param("model");
  const { resolveProvider } = await import("./providers/index.js");
  const resolved = await resolveProvider(modelId);
  if (!resolved) {
    return c.json({ error: "Model not found" }, 404);
  }
  return c.json({
    id: modelId,
    object: "model",
    created: 0,
    owned_by: resolved.provider.slug,
  });
});

const port = parseInt(process.env.GATEWAY_PORT || process.env.PORT || "3001", 10);

startBatchWorker();

serve({
  fetch: app.fetch,
  port,
});

console.log(`🚪 OpenDoor Gateway running on port ${port}`);

void import("./lib/web-search.js")
  .then(({ getGcpAccessToken }) => getGcpAccessToken())
  .then((token) => {
    console.log(
      token
        ? "Vertex ADC ready"
        : "Vertex ADC missing — run `gcloud auth application-default login` for OpenDoor Chat"
    );
  })
  .catch(() => undefined);

async function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, flushing PostHog…`);
  try {
    const { shutdownGatewayPostHog } = await import("./lib/posthog.js");
    await shutdownGatewayPostHog();
  } catch {
    /* noop */
  }
  process.exit(0);
}

process.once("SIGINT", () => void gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => void gracefulShutdown("SIGTERM"));
