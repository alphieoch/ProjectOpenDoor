import { createHash, randomBytes } from "crypto";
import { and, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { apiKeys, db, workspaceAgentMessages, workspaceAgents } from "@opendoor/database";
import {
  agentPurgeCutoff,
  applyComputerControl,
  attachOpenBotComputer,
  detachOpenBotIsolation,
  embeddingsClientFromEnv,
  formatRecallHits,
  getAgentRuntime,
  isolationStatusSuffix,
  nextAgentCompletionMode,
  readWorkspace,
  recallWorkspace,
  recordOpenBotAudit,
  seedSkills,
  syncLiveComputerControl,
  workspacePublic,
  type AgentRuntimeId,
  type AgentWorkspace,
  type ComputerControl,
} from "@opendoor/shared";
import { executeTool } from "@opendoor/shared/agent-execute";
import { toolsForRuntime } from "@opendoor/shared/agent-tools";
import { decryptAgentSecret, encryptAgentSecret } from "./agent-secret.js";
import { agentKind, isLeaderbotRecord } from "./agent-public.js";
import { gatewaySearchSpend } from "./search-spend.js";

type AgentRow = typeof workspaceAgents.$inferSelect;

function selfUrl() {
  return (
    process.env.GATEWAY_INTERNAL_URL ||
    process.env.GATEWAY_URL ||
    `http://127.0.0.1:${process.env.PORT || 3001}`
  ).replace(/\/$/, "");
}

export function presentAgent(row: AgentRow) {
  const runtime = getAgentRuntime(row.runtime);
  const workspace = workspacePublic(readWorkspace(row.config));
  return {
    id: row.id,
    object: "agent" as const,
    name: row.name,
    slug: row.slug,
    runtime: row.runtime,
    runtimeName: runtime?.name ?? row.runtime,
    modelId: row.modelId,
    systemPrompt: row.systemPrompt,
    status: row.status,
    statusMessage: row.statusMessage,
    kind: agentKind(row),
    workspace,
    lastUsedAt: row.lastUsedAt,
    startedAt: row.startedAt,
    stoppedAt: row.stoppedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function loadOwnedAgent(orgId: string, id: string, opts?: { includeDeleted?: boolean }) {
  const filters = [eq(workspaceAgents.id, id), eq(workspaceAgents.organizationId, orgId)];
  if (!opts?.includeDeleted) filters.push(isNull(workspaceAgents.deletedAt));
  const [row] = await db.select().from(workspaceAgents).where(and(...filters)).limit(1);
  return row ?? null;
}

export async function countOrgAgents(orgId: string) {
  const rows = await db
    .select({
      id: workspaceAgents.id,
      status: workspaceAgents.status,
    })
    .from(workspaceAgents)
    .where(and(eq(workspaceAgents.organizationId, orgId), isNull(workspaceAgents.deletedAt)));
  return {
    bots: rows.length,
    running: rows.filter((row) => row.status === "running" || row.status === "starting").length,
  };
}

export async function findLeaderbot(orgId: string) {
  const rows = await db
    .select()
    .from(workspaceAgents)
    .where(eq(workspaceAgents.organizationId, orgId));
  return rows.find((row) => row.runtime === "openbot" && isLeaderbotRecord(row)) ?? null;
}

export async function loadAgentMessages(agentId: string, orgId: string, limit = 80) {
  const rows = await db
    .select()
    .from(workspaceAgentMessages)
    .where(and(eq(workspaceAgentMessages.agentId, agentId), eq(workspaceAgentMessages.organizationId, orgId)))
    .orderBy(desc(workspaceAgentMessages.createdAt))
    .limit(limit);
  rows.reverse();
  return rows
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "tool")
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolName: m.toolName,
      createdAt: m.createdAt,
    }));
}

async function uniqueSlug(orgId: string, name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `agent-${Date.now().toString(36)}`;
  const existing = await db
    .select({ slug: workspaceAgents.slug })
    .from(workspaceAgents)
    .where(eq(workspaceAgents.organizationId, orgId));
  const taken = new Set(existing.map((r) => r.slug));
  let slug = base;
  let n = 2;
  while (taken.has(slug)) {
    slug = `${base}-${n}`.slice(0, 100);
    n += 1;
  }
  return slug;
}

async function unlockKey(row: AgentRow) {
  if (!row.secretCiphertext || !row.secretIv || !row.secretTag) {
    throw new Error("Agent key is missing. Start the agent again.");
  }
  return decryptAgentSecret({
    ciphertext: row.secretCiphertext,
    iv: row.secretIv,
    tag: row.secretTag,
  });
}

async function provisionKey(row: AgentRow) {
  const rawKey = `opd_${randomBytes(32).toString("hex")}`;
  const prefix = rawKey.slice(0, 16);
  const secret = encryptAgentSecret(rawKey);
  const [key] = await db
    .insert(apiKeys)
    .values({
      name: `Agent · ${row.name}`.slice(0, 255),
      keyHash: createHash("sha256").update(rawKey).digest("hex"),
      keyPrefix: prefix,
      organizationId: row.organizationId,
      allowedModels: [row.modelId],
    })
    .returning();
  const [updated] = await db
    .update(workspaceAgents)
    .set({
      apiKeyId: key.id,
      keyPrefix: prefix,
      secretCiphertext: secret.ciphertext,
      secretIv: secret.iv,
      secretTag: secret.tag,
      updatedAt: new Date(),
    })
    .where(eq(workspaceAgents.id, row.id))
    .returning();
  return { row: updated || row, rawKey };
}

async function probeGateway(apiKey: string) {
  const started = Date.now();
  try {
    const res = await fetch(`${selfUrl()}/v1/models`, {
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

export async function createAndBootAgent(opts: {
  orgId: string;
  name: string;
  runtime: AgentRuntimeId;
  modelId: string;
  systemPrompt?: string;
  kind?: "leader" | "coworker";
}) {
  const profile = getAgentRuntime(opts.runtime)!;
  const config =
    opts.kind === "leader" ? { kind: "leader" as const } : opts.kind === "coworker" ? { kind: "coworker" as const } : {};
  const [created] = await db
    .insert(workspaceAgents)
    .values({
      organizationId: opts.orgId,
      name: opts.name,
      slug: await uniqueSlug(opts.orgId, opts.name),
      runtime: opts.runtime,
      modelId: opts.modelId,
      systemPrompt: opts.systemPrompt || profile.defaultPrompt,
      status: "starting",
      statusMessage: `Booting ${profile.name} on ${opts.modelId}…`,
      config,
    })
    .returning();
  return bootAgent(created);
}

export async function restoreAgent(row: AgentRow) {
  if (!row.deletedAt) return row;
  const [updated] = await db
    .update(workspaceAgents)
    .set({
      deletedAt: null,
      status: "stopped",
      statusMessage: "Restored. Start it again to attach the computer.",
      updatedAt: new Date(),
    })
    .where(eq(workspaceAgents.id, row.id))
    .returning();
  return updated || row;
}

export async function bootAgent(row: AgentRow) {
  let current = row;
  if (!current.apiKeyId || !current.secretCiphertext) {
    const provisioned = await provisionKey(current);
    current = provisioned.row;
  }
  const apiKey = await unlockKey(current);
  const probe = await probeGateway(apiKey);
  let ws = readWorkspace(current.config);
  if (ws.skills.length === 0) ws.skills = seedSkills(current.runtime as AgentRuntimeId);
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
    return failed || current;
  }
  if (current.runtime === "openbot") {
    ws = await attachOpenBotComputer(ws, current.id);
  }
  const runtime = getAgentRuntime(current.runtime);
  const [ready] = await db
    .update(workspaceAgents)
    .set({
      status: "running",
      statusMessage: `${runtime?.name ?? current.runtime} is live on ${current.modelId} · gateway ${probe.latencyMs}ms · ${probe.modelsSeen ?? 0} models${current.runtime === "openbot" ? isolationStatusSuffix(ws.computer.isolation) : ""}`,
      config: ws,
      startedAt: new Date(),
      stoppedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaceAgents.id, current.id))
    .returning();
  return ready || current;
}

export async function softDeleteAgent(row: AgentRow) {
  if (row.deletedAt) return row;
  if (row.runtime === "openbot") await detachOpenBotIsolation(row.id);
  const now = new Date();
  const [updated] = await db
    .update(workspaceAgents)
    .set({
      deletedAt: now,
      status: "stopped",
      statusMessage: "Removed. Recover within 7 days, then it is permanently deleted.",
      stoppedAt: now,
      updatedAt: now,
    })
    .where(eq(workspaceAgents.id, row.id))
    .returning();
  return updated || row;
}

export async function purgeExpiredAgents(now = new Date()) {
  const expired = await db
    .select()
    .from(workspaceAgents)
    .where(and(isNotNull(workspaceAgents.deletedAt), lte(workspaceAgents.deletedAt, agentPurgeCutoff(now))));
  for (const row of expired) {
    try {
      if (row.runtime === "openbot") await detachOpenBotIsolation(row.id);
    } catch {
      // Still remove the row if the computer is already gone.
    }
    if (row.apiKeyId) {
      await db
        .update(apiKeys)
        .set({ revokedAt: now, updatedAt: now })
        .where(eq(apiKeys.id, row.apiKeyId));
    }
    await db.delete(workspaceAgents).where(eq(workspaceAgents.id, row.id));
  }
  return expired.length;
}

export async function stopAgent(row: AgentRow) {
  if (row.runtime === "openbot") {
    await detachOpenBotIsolation(row.id);
  }
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
  return stopped || row;
}

export async function setComputerControl(row: AgentRow, control: ComputerControl) {
  try {
    await syncLiveComputerControl(row.id, control);
  } catch {
    // Workspace state still records the handover if the computer is down.
  }
  const ws = readWorkspace(row.config);
  ws.computer = applyComputerControl(ws.computer, control);
  const audited = recordOpenBotAudit(ws, {
    action: control === "take" ? "computer.control_taken" : "computer.control_released",
    detail: control === "take" ? "A person took the wheel." : "Control returned to the bot.",
    allowed: true,
    rule: "human_control",
    outcome: "permitted",
  });
  const [saved] = await db
    .update(workspaceAgents)
    .set({ config: audited, updatedAt: new Date() })
    .where(eq(workspaceAgents.id, row.id))
    .returning();
  return saved || row;
}

type LoopMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

function systemPrompt(row: AgentRow, ws: AgentWorkspace, memoryBlock?: string) {
  const runtime = getAgentRuntime(row.runtime);
  const memory = memoryBlock || "(empty)";
  const skills = ws.skills.length
    ? ws.skills.map((s) => `- ${s.name}: ${s.body.replace(/\s+/g, " ").trim()}`).join("\n")
    : "(none)";
  const parts = [
    row.systemPrompt || runtime?.defaultPrompt || "",
    `Runtime: ${runtime?.name ?? row.runtime}. Model: ${row.modelId}.`,
    "You are the hosted runtime for this workspace. Use your tools when they help. Do not claim you lack tools.",
    `Installed skills:\n${skills}`,
    `Memory:\n${memory}`,
  ];
  if (row.runtime === "openbot") {
    const files = ws.computer.files.map((f) => `- ${f.path}`).join("\n") || "(empty)";
    parts.push(
      `OpenBot computer: operator=${ws.computer.operator} status=${ws.computer.status}`,
      `Current page: ${ws.computer.url || "(none)"}`,
      `/workspace files:\n${files}`,
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

async function complete(opts: {
  apiKey: string;
  model: string;
  messages: LoopMessage[];
  tools: ReturnType<typeof toolsForRuntime>;
  useTools: boolean;
}) {
  const res = await fetch(`${selfUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
      "X-Data-Class": "internal",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: false,
      temperature: 0.4,
      max_tokens: 2048,
      ...(opts.useTools ? { tools: opts.tools, tool_choice: "auto" } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = typeof (data as { error?: string }).error === "string"
      ? (data as { error: string }).error
      : `Gateway returned ${res.status}`;
    throw new Error(err);
  }
  return data as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: LoopMessage["tool_calls"];
      };
    }>;
  };
}

export async function runAgentChat(row: AgentRow, userText: string) {
  const apiKey = await unlockKey(row);
  const runtime = row.runtime as AgentRuntimeId;
  const tools = toolsForRuntime(runtime);
  const embeddings = embeddingsClientFromEnv({ baseUrl: selfUrl(), apiKey });
  let workspace = readWorkspace(row.config);
  const recalled = await recallWorkspace(workspace, { query: userText, includeFiles: false }, embeddings);
  workspace = recalled.workspace;
  const memoryBlock = formatRecallHits(recalled.hits) || "(empty)";

  await db.insert(workspaceAgentMessages).values({
    agentId: row.id,
    organizationId: row.organizationId,
    role: "user",
    content: userText,
  });

  const history = await db
    .select()
    .from(workspaceAgentMessages)
    .where(eq(workspaceAgentMessages.agentId, row.id))
    .orderBy(desc(workspaceAgentMessages.createdAt))
    .limit(30);
  history.reverse();

  const messages: LoopMessage[] = [
    { role: "system", content: systemPrompt(row, workspace, memoryBlock) },
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const events: Array<{ name: string; ok: boolean; detail: string }> = [];
  let reply = "";
  let useTools = true;
  let retriedProviders = false;

  for (let step = 0; step < 8; step += 1) {
    let data;
    try {
      data = await complete({ apiKey, model: row.modelId, messages, tools, useTools });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gateway error";
      const next = nextAgentCompletionMode(message, useTools, retriedProviders);
      if (next === "retry-tools") {
        retriedProviders = true;
        continue;
      }
      if (next === "drop-tools") {
        useTools = false;
        continue;
      }
      throw err;
    }
    const message = data.choices?.[0]?.message;
    const calls = message?.tool_calls || [];
    if (calls.length > 0) {
      messages.push({ role: "assistant", content: message?.content || "", tool_calls: calls });
      for (const call of calls) {
        const executed = await executeTool(runtime, call.function.name, call.function.arguments, workspace, {
          botId: row.id,
          embeddings,
          searchSpend: gatewaySearchSpend({ id: row.organizationId }),
        });
        workspace = executed.workspace;
        const display =
          "display" in executed && typeof executed.display === "string" && executed.display.trim()
            ? executed.display
            : executed.result;
        events.push(executed.event);
        messages.push({ role: "tool", tool_call_id: call.id, content: executed.result });
        await db.insert(workspaceAgentMessages).values({
          agentId: row.id,
          organizationId: row.organizationId,
          role: "tool",
          content: display,
          toolName: call.function.name,
          metadata: { ok: executed.event.ok, detail: executed.event.detail },
        });
      }
      continue;
    }
    reply = (message?.content || "").trim();
    break;
  }

  if (!reply) {
    reply = events.length
      ? `Finished ${events.length} tool step${events.length === 1 ? "" : "s"}.`
      : "The model returned an empty reply. Try again.";
  }

  await db.insert(workspaceAgentMessages).values({
    agentId: row.id,
    organizationId: row.organizationId,
    role: "assistant",
    content: reply,
    metadata: { tools: events },
  });

  const [updated] = await db
    .update(workspaceAgents)
    .set({ config: workspace, lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(workspaceAgents.id, row.id))
    .returning();

  return {
    reply,
    events,
    workspace: workspacePublic(workspace),
    agent: presentAgent(updated || { ...row, config: workspace }),
  };
}
