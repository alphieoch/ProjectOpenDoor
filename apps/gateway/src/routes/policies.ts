import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db, modelPolicies } from "@opendoor/database";
import { asString, requireTenant, writeAudit } from "../lib/platform.js";

const policiesRouter = new Hono();
const ACTIONS = new Set(["allow", "deny", "require_approval", "route_fallback"]);
const DATA_CLASSES = new Set(["public", "internal", "confidential", "restricted"]);

policiesRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db
    .select()
    .from(modelPolicies)
    .where(eq(modelPolicies.organizationId, tenant.organization.id))
    .orderBy(desc(modelPolicies.priority), desc(modelPolicies.createdAt));
  return c.json({ object: "list", data: rows });
});

policiesRouter.post("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name);
  if (!name) return c.json({ error: "name is required" }, 400);
  const dataClass = asString(body.dataClass || body.data_class) || "internal";
  const action = asString(body.action) || "allow";
  if (!DATA_CLASSES.has(dataClass)) return c.json({ error: "invalid dataClass" }, 400);
  if (!ACTIONS.has(action)) return c.json({ error: "invalid action" }, 400);
  const [created] = await db
    .insert(modelPolicies)
    .values({
      organizationId: tenant.organization.id,
      name,
      description: asString(body.description) || null,
      dataClass: dataClass as "public" | "internal" | "confidential" | "restricted",
      modelIdPattern: asString(body.modelIdPattern || body.model_id_pattern) || null,
      userRolePattern: asString(body.userRolePattern || body.user_role_pattern) || null,
      action: action as "allow" | "deny" | "require_approval" | "route_fallback",
      fallbackModelId: asString(body.fallbackModelId || body.fallback_model_id) || null,
      requireHumanApproval: body.requireHumanApproval === true,
      priority: Number(body.priority ?? 100),
      enabled: body.enabled !== false,
      scope: asString(body.scope) || "organization",
    })
    .returning();
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "governance.policy.created",
    entityType: "model_policy",
    entityId: created.id,
  });
  return c.json({ object: "policy", ...created }, 201);
});

policiesRouter.get("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [row] = await db
    .select()
    .from(modelPolicies)
    .where(and(eq(modelPolicies.id, c.req.param("id")), eq(modelPolicies.organizationId, tenant.organization.id)))
    .limit(1);
  if (!row) return c.json({ error: "Policy not found" }, 404);
  return c.json({ object: "policy", ...row });
});

policiesRouter.patch("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [existing] = await db
    .select()
    .from(modelPolicies)
    .where(and(eq(modelPolicies.id, c.req.param("id")), eq(modelPolicies.organizationId, tenant.organization.id)))
    .limit(1);
  if (!existing) return c.json({ error: "Policy not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const [updated] = await db
    .update(modelPolicies)
    .set({
      name: asString(body.name) || existing.name,
      description: body.description !== undefined ? asString(body.description) || null : existing.description,
      enabled: body.enabled !== undefined ? body.enabled === true : existing.enabled,
      priority: body.priority !== undefined ? Number(body.priority) : existing.priority,
      action: asString(body.action) ? (asString(body.action) as typeof existing.action) : existing.action,
      fallbackModelId:
        body.fallbackModelId !== undefined || body.fallback_model_id !== undefined
          ? asString(body.fallbackModelId || body.fallback_model_id) || null
          : existing.fallbackModelId,
      updatedAt: new Date(),
    })
    .where(eq(modelPolicies.id, existing.id))
    .returning();
  return c.json({ object: "policy", ...updated });
});

policiesRouter.delete("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [existing] = await db
    .select()
    .from(modelPolicies)
    .where(and(eq(modelPolicies.id, c.req.param("id")), eq(modelPolicies.organizationId, tenant.organization.id)))
    .limit(1);
  if (!existing) return c.json({ error: "Policy not found" }, 404);
  await db.delete(modelPolicies).where(eq(modelPolicies.id, existing.id));
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "governance.policy.deleted",
    entityType: "model_policy",
    entityId: existing.id,
  });
  return c.json({ object: "policy.deleted", id: existing.id, deleted: true });
});

export default policiesRouter;
