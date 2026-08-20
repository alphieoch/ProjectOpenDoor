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
import { checkoutSeatQuantity } from "@opendoor/shared";
import { resolveCheckoutRequest } from "@/lib/signup-plan";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const body = await req.json();

    const requestedPriceId =
      typeof body.priceId === "string" && body.priceId.startsWith("price_")
        ? body.priceId
        : "";
    const namedPlan = body.planId ?? body.plan;
    const requested = namedPlan
      ? resolveCheckoutRequest({ planId: body.planId, plan: body.plan })
      : null;
    if (requested && !requested.ok) {
      return NextResponse.json(
        { error: requested.error, ...(requested.sales ? { sales: requested.sales } : {}) },
        { status: requested.status }
      );
    }

    const planFromPrice = requestedPriceId ? getPlanFromPriceId(requestedPriceId) : null;
    if (planFromPrice === "enterprise") {
      const blocked = resolveCheckoutRequest({ planId: "enterprise" });
      return NextResponse.json(
        {
          error: blocked.ok ? "Enterprise is billed through sales" : blocked.error,
          sales: blocked.ok ? undefined : blocked.sales,
        },
        { status: 400 }
      );
    }

    const plan =
      (requested && requested.ok ? requested.plan : null) ||
      (planFromPrice && planFromPrice !== "free" ? planFromPrice : null);
    const priceId =
      (requested && requested.ok ? getPriceIdForPlan(requested.plan) : requestedPriceId) || "";

    if (!plan || plan === "free" || !priceId) {
      return NextResponse.json(
        { error: "This plan is not configured for checkout" },
        { status: 400 }
      );
    }

    const seats = checkoutSeatQuantity(plan, body.seats);

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create checkout session";
    console.error("Checkout error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
