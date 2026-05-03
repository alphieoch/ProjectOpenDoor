import { NextRequest, NextResponse } from "next/server";
import { getStripeInstance, TOPUP_PRESETS } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

function clampCustomAmount(amountCents: number): number {
  const min = 500;
  const max = 500000;
  return Math.max(min, Math.min(max, amountCents));
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const body = await req.json();
    const amountCents = Number(body.amountCents || 0);

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json(
        { error: "amountCents must be a positive integer" },
        { status: 400 }
      );
    }

    const db = getDb();
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const stripe = getStripeInstance();

    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { organizationId: orgId },
      });
      customerId = customer.id;
      await db
        .update(organizations)
        .set({ stripeCustomerId: customerId })
        .where(eq(organizations.id, orgId));
    }

    const preset = TOPUP_PRESETS.find((p) => p.amountCents === amountCents);
    const lineItem = preset?.priceId
      ? { price: preset.priceId, quantity: 1 }
      : {
          price_data: {
            currency: "usd",
            product_data: {
              name: `OpenDoor Credits Top-up ($${(clampCustomAmount(amountCents) / 100).toFixed(2)})`,
            },
            unit_amount: clampCustomAmount(amountCents),
          },
          quantity: 1,
        };

    const finalAmount = clampCustomAmount(amountCents);
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [lineItem as any],
      success_url: `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/dashboard/billing?topup=success`,
      cancel_url: `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/dashboard/billing?topup=canceled`,
      metadata: {
        kind: "topup",
        organizationId: orgId,
        amountCents: finalAmount.toString(),
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      userId: session.sub as string,
      action: "billing.checkout_started",
      entityType: "organization",
      entityId: orgId,
      metadata: { kind: "topup", amountCents: finalAmount },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error("Top-up checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create top-up checkout session" },
      { status: 500 }
    );
  }
}
