import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const db = getDb();

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        autoRechargeEnabled: true,
        autoRechargeThresholdCents: true,
        autoRechargeAmountCents: true,
        defaultPaymentMethodId: true,
        stripeCustomerId: true,
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({
      enabled: Boolean(org.autoRechargeEnabled),
      thresholdCents: Number(org.autoRechargeThresholdCents || 0),
      amountCents: Number(org.autoRechargeAmountCents || 0),
      hasPaymentMethod: Boolean(org.defaultPaymentMethodId),
      hasStripeCustomer: Boolean(org.stripeCustomerId),
    });
  } catch (error: any) {
    console.error("Auto-recharge GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch auto-recharge settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const db = getDb();

    const body = await req.json();
    const enabled = Boolean(body.enabled);
    const thresholdCents = Math.max(0, Math.round(Number(body.thresholdCents || 0)));
    const amountCents = Math.max(0, Math.round(Number(body.amountCents || 0)));

    if (enabled && (thresholdCents <= 0 || amountCents <= 0)) {
      return NextResponse.json(
        { error: "Threshold and amount must be greater than 0 when auto-recharge is enabled" },
        { status: 400 }
      );
    }

    await db
      .update(organizations)
      .set({
        autoRechargeEnabled: enabled,
        autoRechargeThresholdCents: enabled ? thresholdCents : null,
        autoRechargeAmountCents: enabled ? amountCents : null,
      })
      .where(eq(organizations.id, orgId));

    return NextResponse.json({
      enabled,
      thresholdCents: enabled ? thresholdCents : 0,
      amountCents: enabled ? amountCents : 0,
    });
  } catch (error: any) {
    console.error("Auto-recharge POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update auto-recharge settings" },
      { status: 500 }
    );
  }
}
