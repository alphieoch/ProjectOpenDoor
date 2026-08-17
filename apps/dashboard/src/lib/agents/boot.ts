import { getDb } from "@/lib/db";
import { workspaceAgents } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { decryptAgentSecret } from "@/lib/agents/crypto";
import { provisionAgentKey } from "@/lib/agents/provision";
import { getAgentRuntime } from "@/lib/agents/runtimes";
import { gatewayBaseUrl } from "@/lib/public-urls";
import { readWorkspace, seedSkills, type AgentProbe } from "@/lib/agents/state";

function gatewayUrl() {
  return (process.env.GATEWAY_URL || gatewayBaseUrl()).replace(/\/$/, "");
}

export async function unlockAgentKey(row: typeof workspaceAgents.$inferSelect) {
  if (!row.secretCiphertext || !row.secretIv || !row.secretTag) {
    throw new Error("Agent key is missing. Start the agent again.");
  }
  return decryptAgentSecret({
    ciphertext: row.secretCiphertext,
    iv: row.secretIv,
    tag: row.secretTag,
  });
}

export async function probeGateway(apiKey: string): Promise<AgentProbe> {
  const started = Date.now();
  const url = gatewayUrl();
  try {
    const res = await fetch(`${url}/v1/models`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = typeof (data as { error?: string }).error === "string"
        ? (data as { error: string }).error
        : `Gateway returned ${res.status}`;
      return { ok: false, latencyMs, at: new Date().toISOString(), error: err };
    }
    const body = (await res.json().catch(() => ({}))) as { data?: unknown[] };
    return {
      ok: true,
      latencyMs,
      at: new Date().toISOString(),
      modelsSeen: Array.isArray(body.data) ? body.data.length : 0,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      at: new Date().toISOString(),
      error: err instanceof Error ? err.message : "Gateway unreachable",
    };
  }
}

export async function bootAgent(row: typeof workspaceAgents.$inferSelect) {
  const db = getDb();
  const runtime = getAgentRuntime(row.runtime);
  let current = row;

  if (!current.apiKeyId || !current.secretCiphertext) {
    await provisionAgentKey({
      orgId: current.organizationId,
      agentId: current.id,
      name: current.name,
      modelId: current.modelId,
    });
    const [reloaded] = await db
      .select()
      .from(workspaceAgents)
      .where(eq(workspaceAgents.id, current.id))
      .limit(1);
    if (!reloaded) throw new Error("Agent disappeared while provisioning a key.");
    current = reloaded;
  }

  const apiKey = await unlockAgentKey(current);
  const probe = await probeGateway(apiKey);
  const ws = readWorkspace(current.config);
  if (ws.skills.length === 0) ws.skills = seedSkills(current.runtime as "openclaw" | "hermes" | "nemoclaw");
  ws.probe = probe;

  if (!probe.ok) {
    const [failed] = await db
      .update(workspaceAgents)
      .set({
        status: "failed",
        statusMessage: `Could not reach the gateway: ${probe.error}`,
        config: ws,
        updatedAt: new Date(),
      })
      .where(eq(workspaceAgents.id, current.id))
      .returning();
    return failed;
  }

  const [ready] = await db
    .update(workspaceAgents)
    .set({
      status: "running",
      statusMessage: `${runtime?.name ?? current.runtime} is live on ${current.modelId} · gateway ${probe.latencyMs}ms · ${probe.modelsSeen ?? 0} models`,
      config: ws,
      startedAt: new Date(),
      stoppedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaceAgents.id, current.id))
    .returning();
  return ready;
}

export async function stopAgent(row: typeof workspaceAgents.$inferSelect) {
  const db = getDb();
  const runtime = getAgentRuntime(row.runtime);
  const [stopped] = await db
    .update(workspaceAgents)
    .set({
      status: "stopped",
      statusMessage: `${runtime?.name ?? row.runtime} stopped. Memory and skills are kept; token spend is paused.`,
      stoppedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workspaceAgents.id, row.id))
    .returning();
  return stopped;
}
