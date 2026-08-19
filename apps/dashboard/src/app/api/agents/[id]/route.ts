import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiKeys, workspaceAgents } from "@opendoor/database";
import { and, eq } from "drizzle-orm";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { ensureAgentSchema } from "@/lib/agents/ensure-schema";
import { publicAgent } from "@/lib/agents/provision";
import { bootAgent, stopAgent } from "@/lib/agents/boot";
import { agentsAddonRequiredResponse, loadAgentsEntitlement } from "@/lib/agents/entitlement";
import { loadThread } from "@/lib/agents/engine";
import { applyComputerControl, recordOpenBotAudit } from "@/lib/agents/openbot";
import { readWorkspace } from "@/lib/agents/state";

async function loadOwned(orgId: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(workspaceAgents)
    .where(and(eq(workspaceAgents.id, id), eq(workspaceAgents.organizationId, orgId)))
    .limit(1);
  return row;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  await ensureAgentSchema();
  const { id } = await params;
  const row = await loadOwned(session.orgId, id);
  if (!row) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const messages = await loadThread(row.id, 80);
  const addon = await loadAgentsEntitlement(session.orgId, session);
  return NextResponse.json({
    agent: publicAgent(row),
    addon,
    messages: messages
      .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "tool")
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolName: m.toolName,
        createdAt: m.createdAt,
      })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  await ensureAgentSchema();
  const { id } = await params;
  const row = await loadOwned(session.orgId, id);
  if (!row) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const body = await req.json();
  const db = getDb();
  const nextStatus = typeof body.status === "string" ? body.status : null;
  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : undefined;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : undefined;
  const modelId = typeof body.modelId === "string" ? body.modelId.trim().slice(0, 150) : undefined;
  const computerControl = body.computerControl === "take" || body.computerControl === "release" ? body.computerControl : null;

  if (nextStatus && !["running", "stopped"].includes(nextStatus)) {
    return NextResponse.json({ error: "status must be running or stopped" }, { status: 400 });
  }

  const patch: Partial<typeof workspaceAgents.$inferInsert> = { updatedAt: new Date() };
  if (name) patch.name = name;
  if (systemPrompt !== undefined) patch.systemPrompt = systemPrompt || null;
  if (modelId) patch.modelId = modelId;

  if (Object.keys(patch).length > 1) {
    await db.update(workspaceAgents).set(patch).where(eq(workspaceAgents.id, row.id));
  }

  let updated = (await loadOwned(session.orgId, id)) || row;
  if (nextStatus === "stopped") {
    updated = await stopAgent(updated);
  }
  if (nextStatus === "running") {
    const addon = await loadAgentsEntitlement(session.orgId, session);
    if (!addon.active) {
      return NextResponse.json(agentsAddonRequiredResponse(addon), { status: 402 });
    }
    updated = await bootAgent({
      ...updated,
      name: name || updated.name,
      modelId: modelId || updated.modelId,
    });
  }

  if (computerControl) {
    const ws = readWorkspace(updated.config);
    ws.computer = applyComputerControl(ws.computer, computerControl);
    const audited = recordOpenBotAudit(ws, {
      action: computerControl === "take" ? "computer.control_taken" : "computer.control_released",
      detail: computerControl === "take" ? "A person took the wheel." : "Control returned to the bot.",
      allowed: true,
      rule: "human_control",
      outcome: "permitted",
    });
    const [saved] = await db
      .update(workspaceAgents)
      .set({ config: audited, updatedAt: new Date() })
      .where(eq(workspaceAgents.id, updated.id))
      .returning();
    if (saved) updated = saved;
  }

  await logAuditEvent({
    organizationId: session.orgId,
    userId: sessionActorId(session),
    action: computerControl
      ? computerControl === "take" ? "agent.computer.take" : "agent.computer.release"
      : nextStatus === "stopped" ? "agent.stopped" : nextStatus === "running" ? "agent.started" : "agent.updated",
    entityType: "workspace_agent",
    entityId: row.id,
    metadata: { status: updated.status, runtime: updated.runtime, modelId: updated.modelId, computerControl },
  });

  return NextResponse.json({ agent: publicAgent(updated) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  await ensureAgentSchema();
  const { id } = await params;
  const row = await loadOwned(session.orgId, id);
  if (!row) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const db = getDb();
  if (row.apiKeyId) {
    await db
      .update(apiKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(apiKeys.id, row.apiKeyId));
  }
  await db.delete(workspaceAgents).where(eq(workspaceAgents.id, row.id));

  await logAuditEvent({
    organizationId: session.orgId,
    userId: sessionActorId(session),
    action: "agent.deleted",
    entityType: "workspace_agent",
    entityId: row.id,
    metadata: { name: row.name, runtime: row.runtime },
  });

  return NextResponse.json({ ok: true });
}
