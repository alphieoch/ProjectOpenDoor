import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db, organizationProviderKeys } from "@opendoor/database";
import { asString, publicByok, requireTenant, writeAudit } from "../lib/platform.js";
import { encryptSecret } from "../lib/secrets.js";

const byokRouter = new Hono();
const PROVIDER_SLUGS = new Set([
  "vertex",
  "together",
  "openai",
  "anthropic",
  "google",
  "cohere",
  "mistral",
  "deepseek",
  "qwen",
  "groq",
  "xai",
  "azure-foundry",
  "cerebras",
  "perplexity",
]);

function keyPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}••••`;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

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
  return c.json({ object: "list", data: rows.map(publicByok) });
});

byokRouter.post("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const providerSlug = asString(body.providerSlug || body.provider);
  const apiKey = asString(body.apiKey || body.secret);
  if (!providerSlug || !PROVIDER_SLUGS.has(providerSlug)) {
    return c.json({ error: `Invalid providerSlug. Allowed: ${[...PROVIDER_SLUGS].join(", ")}` }, 400);
  }
  if (apiKey.length < 8) return c.json({ error: "apiKey must be at least 8 characters" }, 400);
  const encrypted = encryptSecret(apiKey);
  const [inserted] = await db
    .insert(organizationProviderKeys)
    .values({
      organizationId: tenant.organization.id,
      providerSlug,
      label: asString(body.label) || null,
      keyPrefix: keyPrefix(apiKey),
      keyCiphertext: encrypted.ciphertext,
      keyIv: encrypted.iv,
      keyTag: encrypted.tag,
      alwaysUse: body.alwaysUse === true,
    })
    .returning();
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "byok.created",
    entityType: "organization_provider_key",
    entityId: inserted.id,
    metadata: { providerSlug, alwaysUse: body.alwaysUse === true },
  });
  return c.json({ object: "byok", ...publicByok(inserted) }, 201);
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
