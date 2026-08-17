import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizationProviderKeys } from "@opendoor/database";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { encryptSecret } from "@/lib/api-connections/crypto";

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

function publicRow(row: any) {
  return {
    id: row.id,
    providerSlug: row.providerSlug,
    label: row.label,
    keyPrefix: row.keyPrefix,
    alwaysUse: row.alwaysUse,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

function keyPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}••••`;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const db = getDb();
    const keys = await db
      .select()
      .from(organizationProviderKeys)
      .where(
        and(
          eq(organizationProviderKeys.organizationId, orgId),
          isNull(organizationProviderKeys.revokedAt)
        )
      );
    return NextResponse.json({ keys: keys.map(publicRow) });
  } catch {
    return NextResponse.json({ keys: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const body = await req.json().catch(() => ({}));
    const { providerSlug, apiKey, label, alwaysUse } = body as {
      providerSlug?: string;
      apiKey?: string;
      label?: string;
      alwaysUse?: boolean;
    };

    if (!providerSlug || !PROVIDER_SLUGS.has(providerSlug)) {
      return NextResponse.json(
        { error: `Invalid providerSlug. Allowed: ${Array.from(PROVIDER_SLUGS).join(", ")}` },
        { status: 400 }
      );
    }
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 8) {
      return NextResponse.json({ error: "apiKey must be at least 8 characters" }, { status: 400 });
    }

    const trimmedKey = apiKey.trim();
    const encrypted = encryptSecret(trimmedKey);
    const prefix = keyPrefix(trimmedKey);

    const db = getDb();
    const [inserted] = await db
      .insert(organizationProviderKeys)
      .values({
        organizationId: orgId,
        providerSlug,
        label: label?.trim() || null,
        keyPrefix: prefix,
        keyCiphertext: encrypted.ciphertext,
        keyIv: encrypted.iv,
        keyTag: encrypted.tag,
        alwaysUse: Boolean(alwaysUse),
      })
      .returning();

    await logAuditEvent({
      organizationId: orgId,
      userId: session.userId,
      action: "byok.created",
      entityType: "organization_provider_key",
      entityId: inserted?.id,
      metadata: { providerSlug, label: label?.trim() || null, alwaysUse: Boolean(alwaysUse) },
    });

    return NextResponse.json({ key: inserted ? publicRow(inserted) : null }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to save BYOK provider key" },
      { status: 500 }
    );
  }
}
