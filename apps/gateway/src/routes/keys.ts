import { createHash, randomBytes } from "crypto";
import { Hono } from "hono";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db, apiKeys } from "@opendoor/database";
import { SYSTEM_ASSISTANT_KEY_NAME, apiKeyLimitMessage, apiKeyQuota } from "@opendoor/shared";
import { asString, requireTenant, writeAudit } from "../lib/platform.js";

const keysRouter = new Hono();

function publicKey(row: typeof apiKeys.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.keyPrefix,
    allowed_models: row.allowedModels,
    rate_limit_rpm: row.rateLimitRpm,
    rate_limit_tpm: row.rateLimitTpm,
    spend_limit_usd_cents: row.spendLimitUsdCents,
    spend_used_usd_cents: row.spendUsedUsdCents,
    last_used_at: row.lastUsedAt,
    created_at: row.createdAt,
  };
}

keysRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.organizationId, tenant.organization.id),
        isNull(apiKeys.revokedAt),
        ne(apiKeys.name, SYSTEM_ASSISTANT_KEY_NAME)
      )
    );
  return c.json({ object: "list", data: rows.map(publicKey) });
});

keysRouter.post("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const existing = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.organizationId, tenant.organization.id),
        isNull(apiKeys.revokedAt),
        ne(apiKeys.name, SYSTEM_ASSISTANT_KEY_NAME)
      )
    );
  const quota = apiKeyQuota(existing.length, tenant.organization.plan);
  if (quota.atLimit) {
    return c.json(
      {
        error: apiKeyLimitMessage(quota.planName, quota.max),
        limit: quota.max,
        quota,
      },
      402
    );
  }
  const rawKey = `opd_${randomBytes(32).toString("hex")}`;
  const [created] = await db
    .insert(apiKeys)
    .values({
      name: asString(body.name) || "API key",
      keyHash: createHash("sha256").update(rawKey).digest("hex"),
      keyPrefix: rawKey.slice(0, 16),
      organizationId: tenant.organization.id,
      allowedModels: Array.isArray(body.allowedModels) ? body.allowedModels : null,
      spendLimitUsdCents: typeof body.spendLimitUsdCents === "number" ? body.spendLimitUsdCents : null,
    })
    .returning();
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "api_key.created",
    entityType: "api_key",
    entityId: created.id,
    metadata: { name: created.name },
  });
  return c.json({ object: "api_key", ...publicKey(created), key: rawKey }, 201);
});

keysRouter.delete("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [existing] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.id, c.req.param("id")),
        eq(apiKeys.organizationId, tenant.organization.id),
        isNull(apiKeys.revokedAt)
      )
    )
    .limit(1);
  if (!existing) return c.json({ error: "Key not found" }, 404);
  if (existing.id === tenant.apiKey.id) {
    return c.json({ error: "Cannot revoke the key used for this request" }, 400);
  }
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, existing.id));
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "api_key.revoked",
    entityType: "api_key",
    entityId: existing.id,
  });
  return c.json({ object: "api_key.deleted", id: existing.id, deleted: true });
});

export default keysRouter;
