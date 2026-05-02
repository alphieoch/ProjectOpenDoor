import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiKeys } from "@opendoor/database";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { createHash, randomBytes } from "crypto";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  const keys = await db.query.apiKeys.findMany({
    where: and(
      eq(apiKeys.organizationId, orgId),
      isNull(apiKeys.revokedAt)
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

  const rawKey = `opd_${randomBytes(32).toString("hex")}`;
  const prefix = rawKey.slice(0, 16);
  const hash = createHash("sha256").update(rawKey).digest("hex");

  const db2 = getDb();
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

  return NextResponse.json({ key: rawKey });
}
