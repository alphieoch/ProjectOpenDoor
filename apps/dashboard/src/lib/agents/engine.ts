import { getDb } from "@/lib/db";
import { agentRuns, workspaceAgentMessages, workspaceAgents } from "@opendoor/database";
import { desc, eq } from "drizzle-orm";
import { gatewayBaseUrl } from "@/lib/public-urls";
import { formatGatewayError } from "@/lib/models/modality";
import { getAgentRuntime, type AgentRuntimeId } from "@/lib/agents/runtimes";
import { unlockAgentKey } from "@/lib/agents/boot";
import { executeTool, toolsForRuntime, type ToolEvent } from "@/lib/agents/tools";
import { readWorkspace } from "@/lib/agents/state";

function gatewayUrl() {
  return (process.env.GATEWAY_URL || gatewayBaseUrl()).replace(/\/$/, "");
}

type LoopMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

function systemPrompt(row: typeof workspaceAgents.$inferSelect) {
  const runtime = getAgentRuntime(row.runtime);
  const ws = readWorkspace(row.config);
  const memory = ws.memory.slice(-8).map((m) => `- [${m.kind}] ${m.content}`).join("\n") || "(empty)";
  const skills = ws.skills.map((s) => `- ${s.name}`).join("\n") || "(none)";
  return [
    row.systemPrompt || runtime?.defaultPrompt || "",
    `Runtime: ${runtime?.name ?? row.runtime}. Model: ${row.modelId}.`,
    "You are the hosted runtime for this workspace. Use your tools when they help. Do not claim you lack tools.",
    `Installed skills:\n${skills}`,
    `Recent memory:\n${memory}`,
  ].join("\n\n");
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
  const tools = toolsForRuntime(runtime);
  let workspace = readWorkspace(opts.agent.config);

  await appendMessage({
    agentId: opts.agent.id,
    organizationId: opts.agent.organizationId,
    role: "user",
    content: opts.userText,
  });

  const history = await loadThread(opts.agent.id, 30);
  const messages: LoopMessage[] = [
    { role: "system", content: systemPrompt({ ...opts.agent, config: workspace }) },
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const events: ToolEvent[] = [];
  let reply = "";
  let useTools = true;

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
      if (useTools && /tool/i.test(message)) {
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
        const executed = await executeTool(runtime, call.function.name, call.function.arguments, workspace);
        workspace = executed.workspace;
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
          content: executed.result,
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
