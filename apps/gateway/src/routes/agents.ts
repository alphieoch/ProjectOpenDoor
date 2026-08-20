import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, workspaceAgents } from "@opendoor/database";
import { AGENT_SOFT_DELETE_RETENTION_MS, isAgentRuntime, workspaceHasAgentsAddon } from "@opendoor/shared";
import { asString, requireTenant, uniqueConflict, writeAudit } from "../lib/platform.js";
import { runAgentAgui } from "../lib/ag-ui.js";
import {
  bootAgent,
  createAndBootAgent,
  presentAgent,
  purgeExpiredAgents,
  runAgentChat,
  setComputerControl,
  softDeleteAgent,
  stopAgent,
} from "../lib/workspace-agent.js";

const agentsRouter = new Hono();

function addonActive(org: { plan?: string | null; agentsAddonStatus?: string | null }) {
  return workspaceHasAgentsAddon({
    plan: org.plan,
    agentsAddonStatus: org.agentsAddonStatus,
  });
}

async function loadOwned(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(workspaceAgents)
    .where(and(eq(workspaceAgents.id, id), eq(workspaceAgents.organizationId, orgId), isNull(workspaceAgents.deletedAt)))
    .limit(1);
  return row;
}

agentsRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  await purgeExpiredAgents();
  const rows = await db
    .select()
    .from(workspaceAgents)
    .where(and(eq(workspaceAgents.organizationId, tenant.organization.id), isNull(workspaceAgents.deletedAt)))
    .orderBy(desc(workspaceAgents.createdAt));
  return c.json({
    object: "list",
    data: rows.map(presentAgent),
    addon: { active: addonActive(tenant.organization) },
  });
});

agentsRouter.post("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  if (!addonActive(tenant.organization)) {
    return c.json({ error: "Agents add-on required", code: "addon_required", addon: "agents" }, 402);
  }
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name);
  const runtime = asString(body.runtime);
  const modelId = asString(body.modelId || body.model);
  if (!name) return c.json({ error: "name is required" }, 400);
  if (!isAgentRuntime(runtime)) {
    return c.json({ error: "runtime must be openclaw, hermes, nemoclaw, or openbot" }, 400);
  }
  if (!modelId) return c.json({ error: "modelId is required" }, 400);
  try {
    const ready = await createAndBootAgent({
      orgId: tenant.organization.id,
      name,
      runtime,
      modelId,
      systemPrompt: asString(body.systemPrompt) || undefined,
    });
    await writeAudit({
      organizationId: tenant.organization.id,
      action: "agent.created",
      entityType: "workspace_agent",
      entityId: ready.id,
      metadata: { name, runtime, modelId, status: ready.status },
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
  const row = await loadOwned(tenant.organization.id, c.req.param("id"));
  if (!row) return c.json({ error: "Agent not found" }, 404);
  return c.json(presentAgent(row));
});

agentsRouter.patch("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const row = await loadOwned(tenant.organization.id, c.req.param("id"));
  if (!row) return c.json({ error: "Agent not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const status = asString(body.status);
  const computerControl = body.computerControl === "take" || body.computerControl === "release"
    ? body.computerControl
    : null;

  let updated = row;
  if (status === "stopped") updated = await stopAgent(updated);
  if (status === "running") {
    if (!addonActive(tenant.organization)) {
      return c.json({ error: "Agents add-on required", code: "addon_required", addon: "agents" }, 402);
    }
    updated = await bootAgent(updated);
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
    metadata: { status: updated.status, computerControl },
  });
  return c.json(presentAgent(updated));
});

agentsRouter.post("/:id/chat", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  if (!addonActive(tenant.organization)) {
    return c.json({ error: "Agents add-on required", code: "addon_required", addon: "agents" }, 402);
  }
  const row = await loadOwned(tenant.organization.id, c.req.param("id"));
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
    return c.json({ error: "Agents add-on required", code: "addon_required", addon: "agents" }, 402);
  }
  const row = await loadOwned(tenant.organization.id, c.req.param("id"));
  if (!row) return c.json({ error: "Agent not found" }, 404);
  if (row.status !== "running") {
    return c.json({ error: "Start the agent before chatting." }, 409);
  }
  const body = await c.req.json().catch(() => ({}));
  return runAgentAgui(row, body);
});

agentsRouter.delete("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const existing = await loadOwned(tenant.organization.id, c.req.param("id"));
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
