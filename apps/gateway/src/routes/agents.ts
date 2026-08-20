import { Hono } from "hono";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, workspaceAgents } from "@opendoor/database";
import { AGENT_SOFT_DELETE_RETENTION_MS, isAgentRuntime, workspaceHasAgentsAddon } from "@opendoor/shared";
import { asString, requireTenant, uniqueConflict, writeAudit } from "../lib/platform.js";
import { runAgentAgui } from "../lib/ag-ui.js";
import {
  AGENT_PUBLIC_ROUTES,
  isAgentId,
  planAgentCaps,
  presentDeletedAgent,
  resolveCreateKind,
  spawnCapError,
} from "../lib/agent-public.js";
import {
  bootAgent,
  countOrgAgents,
  createAndBootAgent,
  findLeaderbot,
  loadAgentMessages,
  loadOwnedAgent,
  presentAgent,
  purgeExpiredAgents,
  restoreAgent,
  runAgentChat,
  setComputerControl,
  softDeleteAgent,
  stopAgent,
} from "../lib/workspace-agent.js";

export { AGENT_PUBLIC_ROUTES };

const agentsRouter = new Hono();

function addonActive(org: { plan?: string | null; agentsAddonStatus?: string | null }) {
  return workspaceHasAgentsAddon({
    plan: org.plan,
    agentsAddonStatus: org.agentsAddonStatus,
  });
}

function addonRequired() {
  return { error: "Agents add-on required", code: "addon_required" as const, addon: "agents" };
}

async function owned(orgId: string, id: string, opts?: { includeDeleted?: boolean }) {
  if (!isAgentId(id)) return null;
  return loadOwnedAgent(orgId, id, opts);
}

agentsRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  await purgeExpiredAgents();
  const [rows, deletedRows] = await Promise.all([
    db
      .select()
      .from(workspaceAgents)
      .where(and(eq(workspaceAgents.organizationId, tenant.organization.id), isNull(workspaceAgents.deletedAt)))
      .orderBy(desc(workspaceAgents.createdAt)),
    db
      .select()
      .from(workspaceAgents)
      .where(and(eq(workspaceAgents.organizationId, tenant.organization.id), isNotNull(workspaceAgents.deletedAt)))
      .orderBy(desc(workspaceAgents.deletedAt)),
  ]);
  const running = rows.filter((row) => row.status === "running" || row.status === "starting").length;
  return c.json({
    object: "list",
    data: rows.map(presentAgent),
    deleted: deletedRows.flatMap((row) => {
      const presented = presentDeletedAgent(row);
      return presented ? [presented] : [];
    }),
    addon: { active: addonActive(tenant.organization) },
    capacity: {
      ...planAgentCaps(tenant.organization.plan),
      bots: rows.length,
      running,
    },
  });
});

agentsRouter.post("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  if (!addonActive(tenant.organization)) {
    return c.json(addonRequired(), 402);
  }
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name);
  const runtime = asString(body.runtime);
  const modelId = asString(body.modelId || body.model);
  const kind = resolveCreateKind(name, body.kind);
  if (!name) return c.json({ error: "name is required" }, 400);
  if (!isAgentRuntime(runtime)) {
    return c.json({ error: "runtime must be openclaw, hermes, nemoclaw, or openbot" }, 400);
  }
  if (!modelId) return c.json({ error: "modelId is required" }, 400);

  if (kind === "leader") {
    const found = await findLeaderbot(tenant.organization.id);
    if (found && !found.deletedAt) {
      return c.json({ ...presentAgent(found), existed: true });
    }
    if (found?.deletedAt) {
      const restored = await restoreAgent(found);
      const ready = await bootAgent(restored);
      await writeAudit({
        organizationId: tenant.organization.id,
        action: "agent.restored",
        entityType: "workspace_agent",
        entityId: ready.id,
        metadata: { name: ready.name, runtime: ready.runtime, status: ready.status, kind: "leader" },
      });
      return c.json({ ...presentAgent(ready), restored: true });
    }
  }

  const counts = await countOrgAgents(tenant.organization.id);
  const capped = spawnCapError({
    action: "create",
    bots: counts.bots,
    running: counts.running,
    plan: tenant.organization.plan,
  });
  if (capped) return c.json(capped, 402);

  try {
    const ready = await createAndBootAgent({
      orgId: tenant.organization.id,
      name,
      runtime,
      modelId,
      systemPrompt: asString(body.systemPrompt) || undefined,
      kind,
    });
    await writeAudit({
      organizationId: tenant.organization.id,
      action: "agent.created",
      entityType: "workspace_agent",
      entityId: ready.id,
      metadata: { name, runtime, modelId, status: ready.status, kind: kind || null },
    });
    return c.json(presentAgent(ready), 201);
  } catch (err) {
    if (uniqueConflict(err)) return c.json({ error: "slug already exists" }, 409);
    throw err;
  }
});

agentsRouter.get("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const row = await owned(tenant.organization.id, c.req.param("id"));
  if (!row) return c.json({ error: "Agent not found" }, 404);
  const messages = await loadAgentMessages(row.id, tenant.organization.id);
  return c.json({
    ...presentAgent(row),
    messages,
  });
});

agentsRouter.patch("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const row = await owned(tenant.organization.id, c.req.param("id"));
  if (!row) return c.json({ error: "Agent not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const status = asString(body.status);
  const name = asString(body.name);
  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : undefined;
  const modelId = asString(body.modelId || body.model);
  const computerControl = body.computerControl === "take" || body.computerControl === "release"
    ? body.computerControl
    : null;

  if (status && status !== "stopped" && status !== "running") {
    return c.json({ error: "status must be running or stopped" }, 400);
  }

  const patch: Partial<typeof workspaceAgents.$inferInsert> = { updatedAt: new Date() };
  if (name) patch.name = name;
  if (systemPrompt !== undefined) patch.systemPrompt = systemPrompt || null;
  if (modelId) patch.modelId = modelId;
  if (Object.keys(patch).length > 1) {
    await db.update(workspaceAgents).set(patch).where(eq(workspaceAgents.id, row.id));
  }

  let updated = (await loadOwnedAgent(tenant.organization.id, row.id)) || row;
  if (status === "stopped") updated = await stopAgent(updated);
  if (status === "running") {
    if (!addonActive(tenant.organization)) {
      return c.json(addonRequired(), 402);
    }
    const alreadyHot = updated.status === "running" || updated.status === "starting";
    if (!alreadyHot) {
      const counts = await countOrgAgents(tenant.organization.id);
      const capped = spawnCapError({
        action: "start",
        bots: counts.bots,
        running: counts.running,
        plan: tenant.organization.plan,
      });
      if (capped) return c.json(capped, 402);
    }
    updated = await bootAgent({
      ...updated,
      name: name || updated.name,
      modelId: modelId || updated.modelId,
    });
  }
  if (computerControl) updated = await setComputerControl(updated, computerControl);

  await writeAudit({
    organizationId: tenant.organization.id,
    action: computerControl
      ? `agent.computer.${computerControl}`
      : status === "stopped"
        ? "agent.stopped"
        : status === "running"
          ? "agent.started"
          : "agent.updated",
    entityType: "workspace_agent",
    entityId: row.id,
    metadata: { status: updated.status, computerControl, kind: presentAgent(updated).kind },
  });
  return c.json(presentAgent(updated));
});

agentsRouter.post("/:id/chat", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  if (!addonActive(tenant.organization)) {
    return c.json(addonRequired(), 402);
  }
  const row = await owned(tenant.organization.id, c.req.param("id"));
  if (!row) return c.json({ error: "Agent not found" }, 404);
  if (row.status !== "running") {
    return c.json({ error: "Start the agent before chatting." }, 409);
  }
  const body = await c.req.json().catch(() => ({}));
  const message = asString(body.message);
  if (!message) return c.json({ error: "message is required" }, 400);
  try {
    const result = await runAgentChat(row, message);
    return c.json({
      object: "agent.turn",
      reply: result.reply,
      events: result.events,
      workspace: result.workspace,
      agent: result.agent,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Agent run failed";
    return c.json({ error }, 502);
  }
});

agentsRouter.post("/:id/ag-ui", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  if (!addonActive(tenant.organization)) {
    return c.json(addonRequired(), 402);
  }
  const row = await owned(tenant.organization.id, c.req.param("id"));
  if (!row) return c.json({ error: "Agent not found" }, 404);
  if (row.status !== "running") {
    return c.json({ error: "Start the agent before chatting." }, 409);
  }
  const body = await c.req.json().catch(() => ({}));
  return runAgentAgui(row, body);
});

agentsRouter.post("/:id/restore", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  await purgeExpiredAgents();
  const row = await owned(tenant.organization.id, c.req.param("id"), { includeDeleted: true });
  if (!row) return c.json({ error: "Agent not found" }, 404);
  if (!row.deletedAt) {
    return c.json({ error: "This agent is not in the recovery window." }, 409);
  }
  const restored = await restoreAgent(row);
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "agent.restored",
    entityType: "workspace_agent",
    entityId: row.id,
    metadata: { name: row.name, runtime: row.runtime, softDelete: true },
  });
  return c.json(presentAgent(restored));
});

agentsRouter.delete("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const existing = await owned(tenant.organization.id, c.req.param("id"));
  if (!existing) return c.json({ error: "Agent not found" }, 404);
  await softDeleteAgent(existing);
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "agent.deleted",
    entityType: "workspace_agent",
    entityId: existing.id,
    metadata: { softDelete: true },
  });
  return c.json({
    object: "agent.deleted",
    id: existing.id,
    deleted: true,
    recoverUntil: new Date(Date.now() + AGENT_SOFT_DELETE_RETENTION_MS).toISOString(),
  });
});

export default agentsRouter;
