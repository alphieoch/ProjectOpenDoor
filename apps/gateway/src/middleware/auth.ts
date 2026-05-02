import type { Context, Next } from "hono";
import { db } from "@opendoor/database";
import { apiKeys, organizations } from "@opendoor/database";
import { eq, and, isNull } from "drizzle-orm";
import { createHash } from "crypto";

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const apiKey = authHeader.slice(7);

  if (apiKey.length < 20) {
    return c.json({ error: "Invalid API key format" }, 401);
  }

  const prefix = apiKey.slice(0, 16);
  const hash = createHash("sha256").update(apiKey).digest("hex");

  const keyRecord = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.keyPrefix, prefix),
      eq(apiKeys.keyHash, hash),
      isNull(apiKeys.revokedAt)
    ),
  });

  if (!keyRecord) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRecord.id));

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, keyRecord.organizationId),
  });

  if (!org) {
    return c.json({ error: "Organization not found" }, 401);
  }

  c.set("apiKey", keyRecord);
  c.set("organization", org);

  await next();
}
