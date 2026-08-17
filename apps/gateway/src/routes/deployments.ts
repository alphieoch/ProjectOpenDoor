import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db, deployments } from "@opendoor/database";
import { ACTIVE_DEPLOYMENT_STATUSES, getPlan } from "@opendoor/shared";
import { asString, requireTenant, writeAudit } from "../lib/platform.js";

const deploymentsRouter = new Hono();

deploymentsRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db
    .select()
    .from(deployments)
    .where(eq(deployments.organizationId, tenant.organization.id))
    .orderBy(desc(deployments.createdAt));
  return c.json({ object: "list", data: rows });
});

deploymentsRouter.post("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name);
  const sourceType = asString(body.sourceType || body.source_type);
  const sourceValue = asString(body.sourceValue || body.source_value);
  if (!name || !sourceType || !sourceValue) {
    return c.json({ error: "name, sourceType, and sourceValue are required" }, 400);
  }
  const target = asString(body.target) || "gcp";
  if (!["local", "gcp", "azure"].includes(target)) {
    return c.json({ error: "target must be local, gcp, or azure" }, 400);
  }
  const limits = getPlan(tenant.organization.plan);
  const active = await db
    .select({ id: deployments.id, status: deployments.status })
    .from(deployments)
    .where(eq(deployments.organizationId, tenant.organization.id));
  const activeCount = active.filter((d) =>
    (ACTIVE_DEPLOYMENT_STATUSES as readonly string[]).includes(d.status)
  ).length;
  if (activeCount >= limits.maxActiveDeployments) {
    return c.json(
      {
        error: `${limits.name} includes ${limits.maxActiveDeployments} active deployments. Upgrade or stop one first.`,
        limit: limits.maxActiveDeployments,
      },
      402
    );
  }
  const [created] = await db
    .insert(deployments)
    .values({
      organizationId: tenant.organization.id,
      name,
      sourceType,
      sourceValue,
      target,
      cpu: String(body.cpu ?? "0.5"),
      memoryGb: String(body.memoryGb ?? body.memory_gb ?? "1.0"),
      replicas: Number(body.replicas ?? 1),
      minReplicas: Number(body.minReplicas ?? body.min_replicas ?? 0),
      maxReplicas: Number(body.maxReplicas ?? body.max_replicas ?? 1),
      scaleToZero: body.scaleToZero !== false,
      precision: asString(body.precision) || "fp16",
      weightsUri: asString(body.weightsUri || body.weights_uri) || null,
      regionLocked: body.regionLocked === true,
      reserved: body.reserved === true,
      status: "pending",
      statusMessage: "Queued via API. Provisioning continues from the dashboard runner.",
    })
    .returning();
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "deployment.created",
    entityType: "deployment",
    entityId: created.id,
    metadata: { name, sourceType, target },
  });
  return c.json({ object: "deployment", ...created }, 201);
});

deploymentsRouter.get("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [row] = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.id, c.req.param("id")), eq(deployments.organizationId, tenant.organization.id)))
    .limit(1);
  if (!row) return c.json({ error: "Deployment not found" }, 404);
  return c.json({ object: "deployment", ...row });
});

deploymentsRouter.patch("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [existing] = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.id, c.req.param("id")), eq(deployments.organizationId, tenant.organization.id)))
    .limit(1);
  if (!existing) return c.json({ error: "Deployment not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const [updated] = await db
    .update(deployments)
    .set({
      name: asString(body.name) || existing.name,
      statusMessage: asString(body.statusMessage) || existing.statusMessage,
      updatedAt: new Date(),
    })
    .where(eq(deployments.id, existing.id))
    .returning();
  return c.json({ object: "deployment", ...updated });
});

deploymentsRouter.delete("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [existing] = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.id, c.req.param("id")), eq(deployments.organizationId, tenant.organization.id)))
    .limit(1);
  if (!existing) return c.json({ error: "Deployment not found" }, 404);
  const [updated] = await db
    .update(deployments)
    .set({
      status: "stopped",
      statusMessage: "Stopped via API",
      stoppedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deployments.id, existing.id))
    .returning();
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "deployment.deleted",
    entityType: "deployment",
    entityId: existing.id,
  });
  return c.json({ object: "deployment", ...updated });
});

export default deploymentsRouter;
