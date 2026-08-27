import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workspaceAgents } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { ensureAgentSchema } from "@/lib/agents/ensure-schema";
import { loadOwnedAgent, purgeExpiredWorkspaceAgents, softDeleteWorkspaceAgent } from "@/lib/agents/lifecycle";
import { publicAgent } from "@/lib/agents/provision";
import { bootAgent, stopAgent } from "@/lib/agents/boot";
import { agentsAddonRequiredResponse, loadAgentsEntitlement } from "@/lib/agents/entitlement";
import { collapseConsecutiveDuplicateUserMessages } from "@/lib/agents/chat-thread";
import { loadThread } from "@/lib/agents/engine";
import { applyComputerControl, recordOpenBotAudit } from "@/lib/agents/openbot";
import { readWorkspace } from "@/lib/agents/state";
import {
  AGENT_SOFT_DELETE_RETENTION_MS,
  authorSkillOnWorkspace,
  enableCatalogSkill,
  syncLiveComputerControl,
} from "@opendoor/shared";

async function loadOwned(orgId: string, id: string) {
  return loadOwnedAgent(orgId, id);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  await ensureAgentSchema();
  const { id } = await params;
  const row = await loadOwned(session.orgId, id);
  if (!row) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const messages = collapseConsecutiveDuplicateUserMessages(await loadThread(row.id, 80));
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
  try {
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
    try {
      await syncLiveComputerControl(updated.id, computerControl);
    } catch {
      // Workspace state still records the handover if the computer is down.
    }
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

  const skillCatalogId = typeof body.skillCatalogId === "string" ? body.skillCatalogId.trim() : "";
  const skillDraft = body.skill && typeof body.skill === "object" && !Array.isArray(body.skill)
    ? (body.skill as Record<string, unknown>)
    : null;
  let skillName: string | undefined;

  if (skillCatalogId || skillDraft) {
    if (updated.runtime !== "openbot") {
      return NextResponse.json({ error: "This catalog can only be added to OpenBot coworkers." }, { status: 400 });
    }
    const ws = readWorkspace(updated.config);
    let nextSkills = ws.skills;
    if (skillCatalogId) {
      const enabled = enableCatalogSkill(nextSkills, skillCatalogId);
      if (enabled.error) return NextResponse.json({ error: enabled.error }, { status: 400 });
      nextSkills = enabled.skills;
      skillName = enabled.skill?.name;
    }
    if (skillDraft) {
      const authored = authorSkillOnWorkspace(nextSkills, {
        name: skillDraft.name,
        description: skillDraft.description,
        instructions: skillDraft.instructions ?? skillDraft.body,
      });
      if (authored.error) return NextResponse.json({ error: authored.error }, { status: 400 });
      nextSkills = authored.skills;
      skillName = authored.skill?.name;
    }
    const [saved] = await db
      .update(workspaceAgents)
      .set({ config: { ...ws, skills: nextSkills }, updatedAt: new Date() })
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
    metadata: { status: updated.status, runtime: updated.runtime, modelId: updated.modelId, computerControl, skillCatalogId: skillCatalogId || undefined, skillName },
  });

  return NextResponse.json({ agent: publicAgent(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update the agent";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  await ensureAgentSchema();
  await purgeExpiredWorkspaceAgents();
  const { id } = await params;
  const row = await loadOwned(session.orgId, id);
  if (!row) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  await softDeleteWorkspaceAgent(row);

  await logAuditEvent({
    organizationId: session.orgId,
    userId: sessionActorId(session),
    action: "agent.deleted",
    entityType: "workspace_agent",
    entityId: row.id,
    metadata: { name: row.name, runtime: row.runtime, softDelete: true },
  });

  return NextResponse.json({
    ok: true,
    recoverUntil: new Date(Date.now() + AGENT_SOFT_DELETE_RETENTION_MS).toISOString(),
  });
}
