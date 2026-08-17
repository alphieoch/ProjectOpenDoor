import type { Context } from "hono";
import { db, auditLogs } from "@opendoor/database";

export function requireTenant(c: Context) {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  if (!apiKey || !organization?.id) return null;
  return { apiKey, organization };
}

export function slugify(value: string, fallback = "item"): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function asOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : String(value);
}

export function asOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function asOptionalBool(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  return value === true || value === "true";
}

export async function writeAudit(opts: {
  organizationId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      organizationId: opts.organizationId,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      metadata: opts.metadata,
    });
  } catch {
    /* audit is best-effort */
  }
}

export function publicAssistant<T extends { passwordHash?: string | null }>(row: T) {
  const { passwordHash: _hidden, ...rest } = row;
  return rest;
}

export function publicAgent<
  T extends {
    secretCiphertext?: string | null;
    secretIv?: string | null;
    secretTag?: string | null;
  },
>(row: T) {
  const { secretCiphertext: _a, secretIv: _b, secretTag: _c, ...rest } = row;
  return rest;
}

export function publicByok<
  T extends {
    keyCiphertext?: string;
    keyIv?: string;
    keyTag?: string;
  },
>(row: T) {
  const { keyCiphertext: _a, keyIv: _b, keyTag: _c, ...rest } = row;
  return rest;
}

export function uniqueConflict(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unique|duplicate|23505/i.test(message);
}
