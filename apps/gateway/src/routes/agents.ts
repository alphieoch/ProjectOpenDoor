import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db, workspaceAgents } from "@opendoor/database";
import { asString, publicAgent, requireTenant, slugify, uniqueConflict, writeAudit } from "../lib/platform.js";

const agentsRouter = new Hono();
const RUNTIMES = new Set(["openclaw", "hermes", "nemoclaw"]);

function agentsAddonActive(org: { plan?: string | null; agentsAddonStatus?: string | null }) {
  if (org.plan === "enterprise" || org.plan === "team") return true;
  return org.agentsAddonStatus === "active" || org.agentsAddonStatus === "trialing";
}

agentsRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db
    .select()
    .from(workspaceAgents)
    .where(eq(workspaceAgents.organizationId, tenant.organization.id))
    .orderBy(desc(workspaceAgents.createdAt));
  return c.json({
    object: "list",
    data: rows.map(publicAgent),
    addon: { active: agentsAddonActive(tenant.organization) },
  });
});

agentsRouter.post("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  if (!agentsAddonActive(tenant.organization)) {
    return c.json(
      {
        error: "Agents add-on required",
        code: "addon_required",
        addon: "agents",
      },
      402
    );
  }
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name);
  const runtime = asString(body.runtime);
  const modelId = asString(body.modelId || body.model);
  if (!name) return c.json({ error: "name is required" }, 400);
  if (!RUNTIMES.has(runtime)) return c.json({ error: "runtime must be openclaw, hermes, or nemoclaw" }, 400);
  if (!modelId) return c.json({ error: "modelId is required" }, 400);
  try {
    const [created] = await db
      .insert(workspaceAgents)
      .values({
        organizationId: tenant.organization.id,
        name,
        slug: slugify(asString(body.slug) || name),
        runtime,
        modelId,
        systemPrompt: asString(body.systemPrompt) || null,
        status: "pending",
        statusMessage: "Created via API. Boot from the dashboard to attach a runtime key.",
        config: {},
      })
      .returning();
    await writeAudit({
      organizationId: tenant.organization.id,
      action: "agent.created",
      entityType: "workspace_agent",
      entityId: created.id,
      metadata: { name, runtime, modelId },
    });
    return c.json({ object: "agent", ...publicAgent(created) }, 201);
  } catch (err) {
    if (uniqueConflict(err)) return c.json({ error: "slug already exists" }, 409);
    throw err;
  }
});

agentsRouter.get("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [row] = await db
    .select()
    .from(workspaceAgents)
    .where(and(eq(workspaceAgents.id, c.req.param("id")), eq(workspaceAgents.organizationId, tenant.organization.id)))
    .limit(1);
  if (!row) return c.json({ error: "Agent not found" }, 404);
  return c.json({ object: "agent", ...publicAgent(row) });
});

agentsRouter.delete("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [existing] = await db
    .select()
    .from(workspaceAgents)
    .where(and(eq(workspaceAgents.id, c.req.param("id")), eq(workspaceAgents.organizationId, tenant.organization.id)))
    .limit(1);
  if (!existing) return c.json({ error: "Agent not found" }, 404);
  await db.delete(workspaceAgents).where(eq(workspaceAgents.id, existing.id));
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "agent.deleted",
    entityType: "workspace_agent",
    entityId: existing.id,
  });
  return c.json({ object: "agent.deleted", id: existing.id, deleted: true });
});

export default agentsRouter;
