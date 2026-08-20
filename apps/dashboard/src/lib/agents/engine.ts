import { getDb } from "@/lib/db";
import { agentRuns, workspaceAgentMessages, workspaceAgents } from "@opendoor/database";
import { embeddingsClientFromEnv, formatRecallHits, nextAgentCompletionMode, recallWorkspace } from "@opendoor/shared";
import { desc, eq } from "drizzle-orm";
import { gatewayBaseUrl } from "@/lib/public-urls";
import { formatGatewayError } from "@/lib/models/modality";
import { getAgentRuntime, type AgentRuntimeId } from "@/lib/agents/runtimes";
import { unlockAgentKey } from "@/lib/agents/boot";
import { formatTurnFailureReply, messagesForModel } from "@/lib/agents/chat-thread";
import { executeLeaderTool, formatLeaderContext, isLeaderTool, leaderToolDefinitions, loadOpenBotResources } from "@/lib/agents/openbot-orchestrate";
import { executeTool, toolsForRuntime, type ToolEvent } from "@/lib/agents/tools";
import { isLeaderbotRecord, withLeaderbotTurnGuidance } from "@/lib/openbot-leader";
import { loadHouseManagement } from "@/lib/openbot-settings";
import { readWorkspace } from "@/lib/agents/state";
import { openDoorSearchSpend } from "@/lib/tools/search-spend";

function gatewayUrl() {
  return (process.env.GATEWAY_URL || gatewayBaseUrl()).replace(/\/$/, "");
}

type LoopMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

function systemPrompt(
  row: typeof workspaceAgents.$inferSelect,
  extra?: string,
  memoryBlock?: string,
  opts?: { leader?: boolean },
) {
  const runtime = getAgentRuntime(row.runtime);
  const ws = readWorkspace(row.config);
  const memory = memoryBlock || "(empty)";
  const skills = ws.skills.length
    ? ws.skills.map((s) => `- ${s.name}: ${s.body.replace(/\s+/g, " ").trim()}`).join("\n")
    : "(none)";
  const stored = row.systemPrompt || runtime?.defaultPrompt || "";
  const parts = [
    opts?.leader ? withLeaderbotTurnGuidance(stored) : stored,
    `Runtime: ${runtime?.name ?? row.runtime}. Model: ${row.modelId}.`,
    "You are the hosted runtime for this workspace. Use your tools when they help. Do not claim you lack tools.",
    extra,
    `Installed skills:\n${skills}`,
    `Memory:\n${memory}`,
  ];
  if (row.runtime === "openbot") {
    const files = ws.computer.files.map((f) => `- ${f.path}`).join("\n") || "(empty)";
    const audit = ws.audit.slice(-6).map((a) => `- ${a.outcome || (a.allowed ? "permitted" : "refused")} ${a.action} (${a.rule || "n/a"})`).join("\n") || "(none)";
    parts.push(
      `OpenBot computer: operator=${ws.computer.operator} status=${ws.computer.status}`,
      `Current page: ${ws.computer.url || "(none)"} ${ws.computer.title ? `— ${ws.computer.title}` : ""}`,
      ws.computer.helpReason ? `Help requested: ${ws.computer.helpReason}` : "",
      `/workspace files:\n${files}`,
      `Recent computer audit:\n${audit}`,
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

export async function loadThread(agentId: string, limit = 40) {
  const db = getDb();
  const rows = await db
    .select()
    .from(workspaceAgentMessages)
    .where(eq(workspaceAgentMessages.agentId, agentId))
    .orderBy(desc(workspaceAgentMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function appendMessage(opts: {
  agentId: string;
  organizationId: string;
  role: string;
  content: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  const [row] = await db
    .insert(workspaceAgentMessages)
    .values({
      agentId: opts.agentId,
      organizationId: opts.organizationId,
      role: opts.role,
      content: opts.content,
      toolName: opts.toolName,
      metadata: opts.metadata || {},
    })
    .returning();
  return row;
}

async function complete(opts: {
  apiKey: string;
  model: string;
  messages: LoopMessage[];
  tools: ReturnType<typeof toolsForRuntime>;
  useTools: boolean;
}) {
  const res = await fetch(`${gatewayUrl()}/v1/chat/completions`, {
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
    throw new Error(formatGatewayError(data, `Gateway returned ${res.status}`));
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

export async function runAgentTurn(opts: {
  agent: typeof workspaceAgents.$inferSelect;
  userText: string;
}) {
  const db = getDb();
  const apiKey = await unlockAgentKey(opts.agent);
  const runtime = opts.agent.runtime as AgentRuntimeId;
  const leader = runtime === "openbot" && isLeaderbotRecord(opts.agent);
  const houseManagement = leader ? await loadHouseManagement(opts.agent.organizationId) : false;
  const tools = leader
    ? [...toolsForRuntime(runtime), ...leaderToolDefinitions({ houseManagement })]
    : toolsForRuntime(runtime);
  const embeddings = embeddingsClientFromEnv({ baseUrl: gatewayUrl(), apiKey });
  let workspace = readWorkspace(opts.agent.config);
  const recalled = await recallWorkspace(workspace, { query: opts.userText, includeFiles: false }, embeddings);
  workspace = recalled.workspace;
  const memoryBlock = formatRecallHits(recalled.hits) || "(empty)";
  const leaderContext = leader
    ? formatLeaderContext(await loadOpenBotResources(opts.agent.organizationId, opts.agent.modelId), {
        houseManagement,
      })
    : "";

  await appendMessage({
    agentId: opts.agent.id,
    organizationId: opts.agent.organizationId,
    role: "user",
    content: opts.userText,
  });

  const history = await loadThread(opts.agent.id, 30);
  const messages: LoopMessage[] = [
    {
      role: "system",
      content: systemPrompt({ ...opts.agent, config: workspace }, leaderContext, memoryBlock, { leader }),
    },
    ...messagesForModel(history),
  ];

  const events: ToolEvent[] = [];
  let reply = "";
  let useTools = true;
  let retriedProviders = false;

  try {
  for (let step = 0; step < 8; step += 1) {
    let data;
    try {
      data = await complete({
        apiKey,
        model: opts.agent.modelId,
        messages,
        tools,
        useTools,
      });
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
      messages.push({
        role: "assistant",
        content: message?.content || "",
        tool_calls: calls,
      });
      for (const call of calls) {
        const executed =
          leader && isLeaderTool(call.function.name)
            ? await executeLeaderTool(call.function.name, call.function.arguments, workspace, {
                organizationId: opts.agent.organizationId,
                leaderId: opts.agent.id,
                modelId: opts.agent.modelId,
                createdBy: opts.agent.createdBy,
              })
            : await executeTool(runtime, call.function.name, call.function.arguments, workspace, {
                botId: opts.agent.id,
                embeddings,
                searchSpend: openDoorSearchSpend({
                  orgId: opts.agent.organizationId,
                  userId: opts.agent.createdBy,
                }),
              });
        workspace = executed.workspace;
        const display =
          "display" in executed && typeof executed.display === "string" && executed.display.trim()
            ? executed.display
            : executed.result;
        events.push(executed.event);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: executed.result,
        });
        await appendMessage({
          agentId: opts.agent.id,
          organizationId: opts.agent.organizationId,
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

  await appendMessage({
    agentId: opts.agent.id,
    organizationId: opts.agent.organizationId,
    role: "assistant",
    content: reply,
    metadata: { tools: events },
  });

  await db
    .update(workspaceAgents)
    .set({
      config: workspace,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workspaceAgents.id, opts.agent.id));

  try {
    await db.insert(agentRuns).values({
      organizationId: opts.agent.organizationId,
      apiKeyId: opts.agent.apiKeyId,
      agentName: opts.agent.name,
      modelId: opts.agent.modelId,
      status: "completed",
      toolsUsed: events.map((e) => e.name),
      completedAt: new Date(),
    });
  } catch {
    /* optional */
  }

  return { reply, events, workspace };
  } catch (err) {
    try {
      await appendMessage({
        agentId: opts.agent.id,
        organizationId: opts.agent.organizationId,
        role: "assistant",
        content: formatTurnFailureReply(),
        metadata: {
          error: true,
          cause: err instanceof Error ? err.message : "Agent run failed",
        },
      });
    } catch {
      /* still surface the original failure */
    }
    throw err;
  }
}

export function encodeAgentSse(reply: string, events: ToolEvent[]) {
  const chunks: string[] = [];
  for (const event of events) {
    chunks.push(`data: ${JSON.stringify({ type: "tool", ...event })}\n\n`);
  }
  const size = 24;
  for (let i = 0; i < reply.length; i += size) {
    chunks.push(`data: ${JSON.stringify({ type: "delta", content: reply.slice(i, i + size) })}\n\n`);
  }
  chunks.push(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  return chunks.join("");
}
