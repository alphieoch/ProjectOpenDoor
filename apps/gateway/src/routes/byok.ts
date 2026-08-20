import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db, organizationProviderKeys } from "@opendoor/database";
import { byokKeyPrefix, parseByokCreateBody, publicByokRow } from "@opendoor/shared";
import { requireTenant, writeAudit } from "../lib/platform.js";
import { encryptSecret } from "../lib/secrets.js";

const byokRouter = new Hono();

byokRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db
    .select()
    .from(organizationProviderKeys)
    .where(
      and(
        eq(organizationProviderKeys.organizationId, tenant.organization.id),
        isNull(organizationProviderKeys.revokedAt)
      )
    );
  return c.json({ object: "list", data: rows.map(publicByokRow) });
});

byokRouter.post("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const parsed = parseByokCreateBody(await c.req.json().catch(() => ({})));
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);
  const encrypted = encryptSecret(parsed.apiKey);
  const existing = await db
    .select({ id: organizationProviderKeys.id })
    .from(organizationProviderKeys)
    .where(
      and(
        eq(organizationProviderKeys.organizationId, tenant.organization.id),
        eq(organizationProviderKeys.providerSlug, parsed.providerSlug),
        isNull(organizationProviderKeys.revokedAt)
      )
    );
  if (existing.length > 0) {
    await db
      .update(organizationProviderKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(organizationProviderKeys.organizationId, tenant.organization.id),
          eq(organizationProviderKeys.providerSlug, parsed.providerSlug),
          isNull(organizationProviderKeys.revokedAt)
        )
      );
  }
  const [inserted] = await db
    .insert(organizationProviderKeys)
    .values({
      organizationId: tenant.organization.id,
      providerSlug: parsed.providerSlug,
      label: parsed.label,
      keyPrefix: byokKeyPrefix(parsed.apiKey),
      keyCiphertext: encrypted.ciphertext,
      keyIv: encrypted.iv,
      keyTag: encrypted.tag,
      alwaysUse: parsed.alwaysUse,
    })
    .returning();
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "byok.created",
    entityType: "organization_provider_key",
    entityId: inserted.id,
    metadata: { providerSlug: parsed.providerSlug, alwaysUse: parsed.alwaysUse, rotated: existing.length > 0 },
  });
  return c.json(
    { object: "byok", ...publicByokRow(inserted), rotated: existing.length > 0 },
    existing.length > 0 ? 200 : 201
  );
});

byokRouter.delete("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [existing] = await db
    .select()
    .from(organizationProviderKeys)
    .where(
      and(
        eq(organizationProviderKeys.id, c.req.param("id")),
        eq(organizationProviderKeys.organizationId, tenant.organization.id),
        isNull(organizationProviderKeys.revokedAt)
      )
    )
    .limit(1);
  if (!existing) return c.json({ error: "Key not found" }, 404);
  await db
    .update(organizationProviderKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(organizationProviderKeys.id, existing.id));
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "byok.revoked",
    entityType: "organization_provider_key",
    entityId: existing.id,
  });
  return c.json({ object: "byok.deleted", id: existing.id, deleted: true });
});

export default byokRouter;
