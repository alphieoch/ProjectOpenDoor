import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiKeys, organizations } from "@opendoor/database";
import { eq, and, isNull, ne } from "drizzle-orm";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { parseOnboardingChecklist } from "@/lib/onboarding";
import { SYSTEM_ASSISTANT_KEY_NAME } from "@opendoor/shared";
import {
  apiKeyLimitMessage,
  apiKeyQuota,
  mintOpenDoorApiKey,
  parseApiKeyCreateBody,
  publicApiKeyRow,
} from "@/lib/org-keys";

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

    const [org, rows] = await Promise.all([
      db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { plan: true },
      }),
      db.query.apiKeys.findMany({
        where: and(
          eq(apiKeys.organizationId, orgId),
          isNull(apiKeys.revokedAt),
          ne(apiKeys.name, SYSTEM_ASSISTANT_KEY_NAME)
        ),
        columns: {
          id: true,
          name: true,
          keyPrefix: true,
          allowedModels: true,
          createdAt: true,
          lastUsedAt: true,
        },
      }),
    ]);

    const keys = rows.map(publicApiKeyRow);
    const quota = apiKeyQuota(keys.length, org?.plan);
    return NextResponse.json({ keys, quota });
  } catch (err) {
    return unauthorized(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const parsed = parseApiKeyCreateBody(await req.json().catch(() => ({})));
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const db = getDb();
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { plan: true, metadata: true },
    });
    const existingKeys = await db.query.apiKeys.findMany({
      where: and(
        eq(apiKeys.organizationId, orgId),
        isNull(apiKeys.revokedAt),
        ne(apiKeys.name, SYSTEM_ASSISTANT_KEY_NAME)
      ),
      columns: { id: true },
    });
    const quota = apiKeyQuota(existingKeys.length, org?.plan);
    if (quota.atLimit) {
      return NextResponse.json(
        {
          error: apiKeyLimitMessage(quota.planName, quota.max),
          limit: quota.max,
          quota,
        },
        { status: 402 }
      );
    }

    const minted = mintOpenDoorApiKey();
    const [newKey] = await db
      .insert(apiKeys)
      .values({
        name: parsed.name,
        keyHash: minted.keyHash,
        keyPrefix: minted.keyPrefix,
        organizationId: orgId,
        allowedModels: parsed.allowedModels,
      })
      .returning();

    await logAuditEvent({
      organizationId: orgId,
      userId: sessionActorId(session),
      action: "api_key.created",
      entityType: "api_key",
      entityId: newKey.id,
      metadata: {
        name: parsed.name,
        allowedModels: parsed.allowedModels,
      },
    });

    const metadata = (org?.metadata as Record<string, unknown> | null) || {};
    const checklist = parseOnboardingChecklist(metadata.onboarding_checklist);
    if (!checklist.apiKeyCreated) {
      await db
        .update(organizations)
        .set({
          metadata: {
            ...metadata,
            onboarding_checklist: {
              ...checklist,
              apiKeyCreated: true,
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, orgId));
    }

    return NextResponse.json({
      key: minted.rawKey,
      ...publicApiKeyRow(newKey),
    });
  } catch (err) {
    return unauthorized(err);
  }
}
