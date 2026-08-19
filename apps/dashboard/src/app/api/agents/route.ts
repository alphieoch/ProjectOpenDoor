import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workspaceAgents } from "@opendoor/database";
import { desc, eq } from "drizzle-orm";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { ensureAgentSchema } from "@/lib/agents/ensure-schema";
import { publicAgent } from "@/lib/agents/provision";
import { bootAgent } from "@/lib/agents/boot";
import { agentsAddonRequiredResponse, loadAgentsEntitlement } from "@/lib/agents/entitlement";
import { getAgentRuntime, isAgentRuntime, toAgentSlug } from "@/lib/agents/runtimes";

export async function GET() {
  const session = await requireAuth();
  await ensureAgentSchema();
  const db = getDb();
  const [rows, addon] = await Promise.all([
    db
      .select()
      .from(workspaceAgents)
      .where(eq(workspaceAgents.organizationId, session.orgId))
      .orderBy(desc(workspaceAgents.createdAt)),
    loadAgentsEntitlement(session.orgId, session),
  ]);
  return NextResponse.json({ agents: rows.map(publicAgent), addon });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  await ensureAgentSchema();
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const runtime = body.runtime;
  const modelId = typeof body.modelId === "string" ? body.modelId.trim().slice(0, 150) : "";
  const customPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";

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
    .select({ slug: workspaceAgents.slug })
    .from(workspaceAgents)
    .where(eq(workspaceAgents.organizationId, session.orgId));
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
      config: {},
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
}
