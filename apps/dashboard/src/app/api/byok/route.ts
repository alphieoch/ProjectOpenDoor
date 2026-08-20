import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizationProviderKeys } from "@opendoor/database";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { encryptSecret } from "@/lib/api-connections/crypto";
import { byokKeyPrefix, parseByokCreateBody, publicByokRow } from "@/lib/org-keys";

function unauthorized(err: unknown) {
  if (err instanceof Error && err.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  throw err;
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
    return NextResponse.json({ keys: keys.map(publicByokRow) });
  } catch (err) {
    return unauthorized(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const parsed = parseByokCreateBody(await req.json().catch(() => ({})));
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    let encrypted: ReturnType<typeof encryptSecret>;
    try {
      encrypted = encryptSecret(parsed.apiKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to encrypt provider key";
      if (message.includes("API_SECRET_KEY")) {
        return NextResponse.json(
          { error: "Provider keys need API_SECRET_KEY on the server." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const prefix = byokKeyPrefix(parsed.apiKey);
    const db = getDb();

    const inserted = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: organizationProviderKeys.id })
        .from(organizationProviderKeys)
        .where(
          and(
            eq(organizationProviderKeys.organizationId, orgId),
            eq(organizationProviderKeys.providerSlug, parsed.providerSlug),
            isNull(organizationProviderKeys.revokedAt)
          )
        );
      if (existing.length > 0) {
        await tx
          .update(organizationProviderKeys)
          .set({ revokedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(organizationProviderKeys.organizationId, orgId),
              eq(organizationProviderKeys.providerSlug, parsed.providerSlug),
              isNull(organizationProviderKeys.revokedAt)
            )
          );
      }
      const [row] = await tx
        .insert(organizationProviderKeys)
        .values({
          organizationId: orgId,
          providerSlug: parsed.providerSlug,
          label: parsed.label,
          keyPrefix: prefix,
          keyCiphertext: encrypted.ciphertext,
          keyIv: encrypted.iv,
          keyTag: encrypted.tag,
          alwaysUse: parsed.alwaysUse,
        })
        .returning();
      return { row, rotated: existing.length > 0 };
    });

    await logAuditEvent({
      organizationId: orgId,
      userId: sessionActorId(session),
      action: "byok.created",
      entityType: "organization_provider_key",
      entityId: inserted.row?.id,
      metadata: {
        providerSlug: parsed.providerSlug,
        label: parsed.label,
        alwaysUse: parsed.alwaysUse,
        rotated: inserted.rotated,
      },
    });

    return NextResponse.json(
      {
        key: inserted.row ? publicByokRow(inserted.row) : null,
        rotated: inserted.rotated,
      },
      { status: inserted.rotated ? 200 : 201 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save BYOK provider key" },
      { status: 500 }
    );
  }
}
