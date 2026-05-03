import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations, creditTransactions } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { verifySiteAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await verifySiteAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { session } = auth;

  const { orgId, amountCents, mode, note } = await req.json();

  if (!orgId || amountCents == null || !mode) {
    return NextResponse.json({ error: "orgId, amountCents, and mode required" }, { status: 400 });
  }

  const db = getDb();

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const newBalance = mode === "set" ? amountCents : org.creditsUsdCents + amountCents;
  const delta = mode === "set" ? amountCents - org.creditsUsdCents : amountCents;

  await db
    .update(organizations)
    .set({ creditsUsdCents: newBalance })
    .where(eq(organizations.id, orgId));

  await db.insert(creditTransactions).values({
    organizationId: orgId,
    kind: "admin_adjustment",
    amountCents: delta,
    balanceAfterCents: newBalance,
    metadata: {
      adminUserId: session.userId,
      mode,
      note: note || null,
    },
  });

  return NextResponse.json({ success: true, newBalanceCents: newBalance });
}
