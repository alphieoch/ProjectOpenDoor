import { NextRequest, NextResponse } from "next/server";
import {
  checkoutIntegrationId,
  getPlanFromPriceId,
  getPriceIdForPlan,
  getStripeInstance,
} from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { appBaseUrl } from "@/lib/public-urls";
import { getPlan } from "@opendoor/shared";

const SELF_SERVE_PLANS = ["student", "pro", "ultra", "family", "family_max", "team"] as const;
type CheckoutPlan = (typeof SELF_SERVE_PLANS)[number];

function asCheckoutPlan(value: unknown): CheckoutPlan | null {
  return typeof value === "string" && (SELF_SERVE_PLANS as readonly string[]).includes(value)
    ? (value as CheckoutPlan)
    : null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const body = await req.json();

    const requestedPlan = asCheckoutPlan(body.planId);
    const requestedPriceId =
      typeof body.priceId === "string" && body.priceId.startsWith("price_")
        ? body.priceId
        : "";

    if (body.planId === "enterprise") {
      return NextResponse.json(
        { error: "Enterprise is billed through sales", sales: "mailto:sales@opendoor.ai?subject=OpenDoor%20Enterprise" },
        { status: 400 }
      );
    }

    const plan = requestedPlan || (requestedPriceId ? getPlanFromPriceId(requestedPriceId) : null);
    const priceId = (requestedPlan ? getPriceIdForPlan(requestedPlan) : requestedPriceId) || "";

    if (!plan || plan === "free" || !priceId) {
      return NextResponse.json(
        { error: "This plan is not configured for checkout" },
        { status: 400 }
      );
    }

    const seats = getPlan(plan).perSeat
      ? Math.min(500, Math.max(1, Number(body.seats) || 1))
      : 1;

    const db = getDb();
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const activeSub =
      Boolean(org.stripeSubscriptionId) &&
      (org.subscriptionStatus === "active" || org.subscriptionStatus === "trialing");
    if (activeSub) {
      return NextResponse.json(
        { error: "Use the billing portal to change plans", usePortal: true },
        { status: 409 }
      );
    }

    const stripe = getStripeInstance();
    const origin = appBaseUrl();

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

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: seats }],
      mode: "subscription",
      integration_identifier: checkoutIntegrationId("subscription"),
      success_url: `${origin}/dashboard/billing?success=true`,
      cancel_url: `${origin}/dashboard/billing?canceled=true`,
      metadata: {
        organizationId: orgId,
        plan,
        priceId,
        seats: String(seats),
      },
      subscription_data: {
        metadata: { organizationId: orgId, plan, priceId, seats: String(seats) },
      },
      saved_payment_method_options: {
        payment_method_save: "enabled",
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      userId: session.sub as string,
      action: "billing.checkout_started",
      entityType: "organization",
      entityId: orgId,
      metadata: { plan, priceId, seats, stripeCustomerId: customerId },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
