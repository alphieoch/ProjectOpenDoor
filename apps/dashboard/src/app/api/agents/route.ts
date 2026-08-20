import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations, workspaceAgentMessages, workspaceAgents } from "@opendoor/database";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { ensureAgentSchema } from "@/lib/agents/ensure-schema";
import { purgeExpiredWorkspaceAgents, restoreWorkspaceAgent } from "@/lib/agents/lifecycle";
import { publicAgent } from "@/lib/agents/provision";
import { bootAgent } from "@/lib/agents/boot";
import { agentsAddonRequiredResponse, loadAgentsEntitlement } from "@/lib/agents/entitlement";
import { getAgentRuntime, isAgentRuntime, toAgentSlug } from "@/lib/agents/runtimes";
import { isLeaderbotName, isLeaderbotRecord, summarizeOpenBotCapacity } from "@/lib/openbot-leader";
import { hasOpenBotSupervisor, readWorkspace } from "@opendoor/shared";
import { publicErrorMessage } from "@/lib/client-error";

function agentRouteError(err: unknown, fallback: string) {
  const message = publicErrorMessage(err, fallback);
  const status = message === "Unauthorized" ? 401 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
  const session = await requireAuth();
  await ensureAgentSchema();
  await purgeExpiredWorkspaceAgents();
  const db = getDb();
  const [rows, addon, org] = await Promise.all([
    db
      .select()
      .from(workspaceAgents)
      .where(and(eq(workspaceAgents.organizationId, session.orgId), isNull(workspaceAgents.deletedAt)))
      .orderBy(desc(workspaceAgents.createdAt)),
    loadAgentsEntitlement(session.orgId, session),
    db.query.organizations.findFirst({
      where: eq(organizations.id, session.orgId),
      columns: { plan: true },
    }),
  ]);
  const recent = await db
    .select({
      agentId: workspaceAgentMessages.agentId,
      content: workspaceAgentMessages.content,
      createdAt: workspaceAgentMessages.createdAt,
      role: workspaceAgentMessages.role,
    })
    .from(workspaceAgentMessages)
    .where(eq(workspaceAgentMessages.organizationId, session.orgId))
    .orderBy(desc(workspaceAgentMessages.createdAt))
    .limit(400);

  const snippets = new Map<string, { content: string; createdAt: Date; role: string }>();
  for (const row of recent) {
    const existing = snippets.get(row.agentId);
    if (existing && existing.role !== "tool") continue;
    if (existing && row.role === "tool") continue;
    snippets.set(row.agentId, { content: row.content, createdAt: row.createdAt, role: row.role });
  }

  return NextResponse.json({
    agents: rows.map((row) => {
      const agent = publicAgent(row);
      const last = snippets.get(row.id);
      return {
        ...agent,
        lastMessage: last?.content || agent.statusMessage || null,
        lastMessageAt: last?.createdAt || agent.lastUsedAt || agent.updatedAt || null,
      };
    }),
    addon,
    capacity: summarizeOpenBotCapacity({
      plan: org?.plan,
      addonActive: addon.active,
      addonStatus: addon.status,
      addonIncludedInPlan: addon.includedInPlan,
      supervisor: hasOpenBotSupervisor(),
      sharedComputer: Boolean(process.env.OPENBOT_COMPUTER_URL || process.env.AGENT_COMPUTER_URL),
      bots: rows
        .filter((row) => row.runtime === "openbot")
        .map((row) => ({
          status: row.status,
          computer: readWorkspace(row.config).computer,
        })),
    }),
  });
  } catch (err) {
    return agentRouteError(err, "Could not load agents");
  }
}

export async function POST(req: NextRequest) {
  try {
  const session = await requireAuth();
  await ensureAgentSchema();
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const runtime = body.runtime;
  const modelId = typeof body.modelId === "string" ? body.modelId.trim().slice(0, 150) : "";
  const customPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  const kind = body.kind === "leader" || isLeaderbotName(name) ? "leader" : undefined;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!isAgentRuntime(runtime)) {
    return NextResponse.json(
      { error: "runtime must be openclaw, hermes, nemoclaw, or openbot" },
      { status: 400 },
    );
  }
  if (!modelId) return NextResponse.json({ error: "modelId is required" }, { status: 400 });

  const addon = await loadAgentsEntitlement(session.orgId, session);
  if (!addon.active) {
    return NextResponse.json(agentsAddonRequiredResponse(addon), { status: 402 });
  }

  const profile = getAgentRuntime(runtime)!;
  const slugBase = toAgentSlug(name) || `agent-${Date.now().toString(36)}`;
  const db = getDb();

  let slug = slugBase;
  const existing = await db
    .select()
    .from(workspaceAgents)
    .where(eq(workspaceAgents.organizationId, session.orgId));
  if (kind === "leader") {
    const found = existing.find((row) => row.runtime === "openbot" && isLeaderbotRecord(row));
    if (found && !found.deletedAt) return NextResponse.json({ agent: publicAgent(found), existed: true });
    if (found?.deletedAt) {
      const restored = await restoreWorkspaceAgent(found);
      const ready = await bootAgent(restored);
      return NextResponse.json({ agent: publicAgent(ready), restored: true });
    }
  }
  const taken = new Set(existing.map((r) => r.slug));
  let n = 2;
  while (taken.has(slug)) {
    slug = `${slugBase}-${n}`.slice(0, 100);
    n += 1;
  }

  const [created] = await db
    .insert(workspaceAgents)
    .values({
      organizationId: session.orgId,
      createdBy: /^[0-9a-f-]{36}$/i.test(sessionActorId(session)) ? sessionActorId(session) : null,
      name,
      slug,
      runtime,
      modelId,
      systemPrompt: customPrompt || profile.defaultPrompt,
      status: "starting",
      statusMessage: `Booting ${profile.name} on ${modelId}…`,
      config: kind === "leader" ? { kind: "leader" } : {},
    })
    .returning();

  try {
    const ready = await bootAgent(created);
    await logAuditEvent({
      organizationId: session.orgId,
      userId: sessionActorId(session),
      action: "agent.created",
      entityType: "workspace_agent",
      entityId: created.id,
      metadata: { name, runtime, modelId, status: ready.status },
    });
    if (ready.status === "failed") {
      return NextResponse.json({ agent: publicAgent(ready), error: ready.statusMessage }, { status: 201 });
    }
    return NextResponse.json({ agent: publicAgent(ready) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to boot agent";
    const [failed] = await db
      .update(workspaceAgents)
      .set({ status: "failed", statusMessage: message, updatedAt: new Date() })
      .where(eq(workspaceAgents.id, created.id))
      .returning();
    return NextResponse.json({ error: message, agent: failed ? publicAgent(failed) : null }, { status: 500 });
  }
  } catch (err) {
    return agentRouteError(err, "Could not start that coworker");
  }
}
