import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workspaceAgents } from "@opendoor/database";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { inferModelModality } from "@/lib/models/modality";
import { ensureAgentSchema } from "@/lib/agents/ensure-schema";
import { encodeAgentSse, runAgentTurn } from "@/lib/agents/engine";
import { agentsAddonRequiredResponse, loadAgentsEntitlement } from "@/lib/agents/entitlement";
import { workspacePublic } from "@/lib/agents/state";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  await ensureAgentSchema();
  const { id } = await params;
  const db = getDb();
  const [agent] = await db
    .select()
    .from(workspaceAgents)
    .where(and(eq(workspaceAgents.id, id), eq(workspaceAgents.organizationId, session.orgId), isNull(workspaceAgents.deletedAt)))
    .limit(1);

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const addon = await loadAgentsEntitlement(session.orgId, session);
  if (!addon.active) {
    return NextResponse.json(agentsAddonRequiredResponse(addon), { status: 402 });
  }
  if (agent.status !== "running") {
    return NextResponse.json({ error: "Start the agent before chatting." }, { status: 409 });
  }
  if (inferModelModality(agent.modelId) !== "chat") {
    return NextResponse.json({ error: `${agent.modelId} is not a chat model.` }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...incoming].reverse().find((m) => m && typeof m === "object" && (m as { role?: string }).role === "user");
  const userText =
    (typeof body.message === "string" && body.message.trim()) ||
    (lastUser && typeof (lastUser as { content?: string }).content === "string"
      ? (lastUser as { content: string }).content.trim()
      : "");
  if (!userText) return NextResponse.json({ error: "message is required" }, { status: 400 });

  try {
    const result = await runAgentTurn({ agent, userText });
    return new Response(encodeAgentSse(result.reply, result.events), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Agent-Workspace": JSON.stringify(workspacePublic(result.workspace)),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent run failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
