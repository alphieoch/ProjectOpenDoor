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
import { statusHandler } from "./routes/status.js";
import { cachetSyncHandler } from "./routes/cachet-sync.js";

const app = new Hono();

app.use(cors());
app.use(logger());

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "opendoor-gateway",
    version: "1.0.0",
    region: process.env.AZURE_REGION || "unknown",
  });
});

/** Public status: Postgres, Redis, and which LLM providers loaded (real env configuration). */
app.get("/status", (c) => statusHandler(c));

/** Push health data to Cachet status page. */
app.post("/internal/cachet-sync", (c) => cachetSyncHandler(c));

app.use("/v1/*", authMiddleware);
app.use("/v1/*", rateLimitMiddleware);
app.use("/v1/*", policyMiddleware);

app.route("/v1/chat", chatRouter);
app.route("/v1/models", modelsRouter);
app.route("/v1/usage", usageRouter);
app.route("/v1/analytics", analyticsRouter);

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

const port = parseInt(process.env.PORT || "3001", 10);

serve({
  fetch: app.fetch,
  port,
});

console.log(`🚪 OpenDoor Gateway running on port ${port}`);

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
