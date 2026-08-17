import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiKeys, organizations } from "@opendoor/database";
import { eq, and, isNull, ne } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { createHash, randomBytes } from "crypto";
import { parseOnboardingChecklist } from "@/lib/onboarding";
import { getPlan, SYSTEM_ASSISTANT_KEY_NAME } from "@opendoor/shared";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  const keys = await db.query.apiKeys.findMany({
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
  });

  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { name, allowedModels } = await req.json();

  const db2 = getDb();
  const orgForPlan = await db2.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { plan: true },
  });
  const limits = getPlan(orgForPlan?.plan);
  const existingKeys = await db2.query.apiKeys.findMany({
    where: and(
      eq(apiKeys.organizationId, orgId),
      isNull(apiKeys.revokedAt),
      ne(apiKeys.name, SYSTEM_ASSISTANT_KEY_NAME)
    ),
    columns: { id: true },
  });
  if (existingKeys.length >= limits.maxApiKeys) {
    return NextResponse.json(
      {
        error: `${limits.name} includes ${limits.maxApiKeys} API keys. Upgrade to add more.`,
        limit: limits.maxApiKeys,
      },
      { status: 402 }
    );
  }

  const rawKey = `opd_${randomBytes(32).toString("hex")}`;
  const prefix = rawKey.slice(0, 16);
  const hash = createHash("sha256").update(rawKey).digest("hex");

  const [newKey] = await db2.insert(apiKeys).values({
    name: name || "Unnamed Key",
    keyHash: hash,
    keyPrefix: prefix,
    organizationId: orgId,
    allowedModels: allowedModels && allowedModels.length > 0 ? allowedModels : null,
  }).returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "api_key.created",
    entityType: "api_key",
    entityId: newKey.id,
    metadata: {
      name: name || "Unnamed Key",
      allowedModels: allowedModels || null,
    },
  });

  const org = await db2.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { metadata: true },
  });
  const metadata = (org?.metadata as Record<string, unknown> | null) || {};
  const checklist = parseOnboardingChecklist(metadata.onboarding_checklist);
  if (!checklist.apiKeyCreated) {
    await db2
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

  return NextResponse.json({ key: rawKey });
}
