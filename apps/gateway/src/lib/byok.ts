import { db, organizationProviderKeys } from "@opendoor/database";
import { and, eq, isNull } from "drizzle-orm";
import { decryptSecret } from "./secrets.js";

export interface OrgProviderKey {
  id: string;
  providerSlug: string;
  plaintext: string;
  alwaysUse: boolean;
}

export async function loadOrgProviderKeys(
  organizationId: string
): Promise<Map<string, OrgProviderKey>> {
  const map = new Map<string, OrgProviderKey>();
  if (!process.env.API_SECRET_KEY) return map;
  try {
    const rows = await db
      .select()
      .from(organizationProviderKeys)
      .where(
        and(
          eq(organizationProviderKeys.organizationId, organizationId),
          isNull(organizationProviderKeys.revokedAt)
        )
      );
    for (const row of rows) {
      try {
        const plaintext = decryptSecret({
          ciphertext: row.keyCiphertext,
          iv: row.keyIv,
          tag: row.keyTag,
        });
        map.set(row.providerSlug, {
          id: row.id,
          providerSlug: row.providerSlug,
          plaintext,
          alwaysUse: Boolean(row.alwaysUse),
        });
      } catch {
        /* skip undecryptable rows */
      }
    }
  } catch {
    /* table missing or db error — platform keys still work */
  }
  return map;
}

export function alwaysUseSlugs(keys: Map<string, OrgProviderKey>): string[] {
  return [...keys.values()].filter((k) => k.alwaysUse).map((k) => k.providerSlug);
}

/** Fire-and-forget last-used stamp when a BYOK key is actually sent upstream. */
export function touchOrgProviderKeyUsed(id: string): void {
  void db
    .update(organizationProviderKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(organizationProviderKeys.id, id))
    .catch(() => undefined);
}
