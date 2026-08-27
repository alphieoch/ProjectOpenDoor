import { serve } from "bun";
import { Hono } from "hono";
import { DockerUnavailableError, ensure, listOwned, reachable, reset, stop } from "./docker";
import { registerEntry } from "./identity";
import { namesFor } from "./names";

/**
 * Vendored from CopilotKit/openbot `supervisor/src/index.ts` (MIT).
 * The Docker socket stays here. The API is four verbs expressed in Bots.
 */

const port = Number.parseInt(process.env.PORT ?? "4300", 10);
const token = process.env.SUPERVISOR_TOKEN?.trim();
if (!token) {
  console.error(
    "SUPERVISOR_TOKEN is not set. This process holds the Docker socket and will not start without the secret its caller must present.",
  );
  process.exit(1);
}

const image = process.env.COMPUTER_IMAGE ?? "opendoor-openbot-computer:latest";
const network = process.env.COMPUTER_NETWORK;
const runtime = process.env.COMPUTER_RUNTIME;
const memoryBytes = process.env.COMPUTER_MEMORY_BYTES
  ? Number.parseInt(process.env.COMPUTER_MEMORY_BYTES, 10)
  : undefined;
const spireSocketVolume = process.env.SPIRE_AGENT_SOCKET_VOLUME;

function environmentFor(botId: string): string[] {
  const passthrough = Object.entries(process.env).filter(([key]) => key.startsWith("EGRESS_PROXY"));
  const computerToken = process.env.COMPUTER_TOKEN;
  return [
    `COMPUTER_BOT_ID=${botId}`,
    ...(computerToken ? [`COMPUTER_TOKEN=${computerToken}`] : []),
    ...(spireSocketVolume ? ["SPIFFE_ENDPOINT_SOCKET=/tmp/spire-agent/public/api.sock"] : []),
    ...passthrough.map(([key, value]) => `${key}=${value ?? ""}`),
  ];
}

const app = new Hono();

app.use("*", async (context, next) => {
  if (context.req.path === "/health") return next();
  if (context.req.header("authorization") !== `Bearer ${token}`) {
    return context.json({ error: "Unauthorized." }, 401);
  }
  return next();
});

app.get("/health", async (context) => context.json({ status: "ok", docker: await reachable() }));

function resolve(raw: string) {
  return namesFor(raw);
}

app.post("/computers/:botId/ensure", async (context) => {
  const parsed = resolve(context.req.param("botId"));
  if (!parsed.ok) return context.json({ error: parsed.reason }, 400);

  try {
    const identity = await registerEntry(parsed.names);
    const state = await ensure(parsed.names, {
      image,
      environment: environmentFor(parsed.names.botId),
      ...(network ? { network } : {}),
      ...(runtime ? { runtime } : {}),
      ...(memoryBytes ? { memoryBytes } : {}),
      ...(spireSocketVolume ? { spireSocketVolume } : {}),
    });
    return context.json({
      ...state,
      ...(identity.registered ? { spiffeId: identity.spiffeId } : { identity: identity.reason }),
    });
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      return context.json({ error: error.message }, 503);
    }
    throw error;
  }
});

app.post("/computers/:botId/stop", async (context) => {
  const parsed = resolve(context.req.param("botId"));
  if (!parsed.ok) return context.json({ error: parsed.reason }, 400);
  try {
    const stopped = await stop(parsed.names);
    return context.json({ stopped });
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      return context.json({ error: error.message }, 503);
    }
    throw error;
  }
});

app.post("/computers/:botId/reset", async (context) => {
  const parsed = resolve(context.req.param("botId"));
  if (!parsed.ok) return context.json({ error: parsed.reason }, 400);
  try {
    const wasThere = await reset(parsed.names);
    return context.json({ reset: wasThere });
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      return context.json({ error: error.message }, 503);
    }
    throw error;
  }
});

app.get("/computers", async (context) => {
  try {
    return context.json({ computers: await listOwned() });
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      return context.json({ error: error.message }, 503);
    }
    throw error;
  }
});

serve({ port, fetch: app.fetch, idleTimeout: 120 });

console.info(
  `Supervisor listening on http://localhost:${port} (image ${image}${runtime ? `, runtime ${runtime}` : ""})`,
);
