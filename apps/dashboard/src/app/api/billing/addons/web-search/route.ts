import { NextResponse } from "next/server";
import { WEB_SEARCH_ADDON } from "@opendoor/shared";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { appBaseUrl } from "@/lib/public-urls";
import { checkoutIntegrationId, getStripeInstance, webSearchAddonPriceId } from "@/lib/stripe";
import { ensureWebSearchAddonColumns, loadWebSearchEntitlement } from "@/lib/web-search/entitlement";

export async function GET() {
  const session = await requireAuth();
  const entitlement = await loadWebSearchEntitlement(session.orgId, session);
  return NextResponse.json({ addon: entitlement });
}

export async function POST() {
  try {
    const session = await requireAuth();
    await ensureWebSearchAddonColumns();
    const entitlement = await loadWebSearchEntitlement(session.orgId, session);
    if (entitlement.active) {
      return NextResponse.json({ alreadyActive: true, addon: entitlement });
    }

    const priceId = webSearchAddonPriceId();
    if (!priceId) {
      return NextResponse.json(
        { error: "Web Search add-on is not configured for checkout yet." },
        { status: 400 },
      );
    }

    const db = getDb();
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, session.orgId),
    });
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const stripe = getStripeInstance();
    const origin = appBaseUrl();

    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { organizationId: session.orgId },
      });
      customerId = customer.id;
      await db
        .update(organizations)
        .set({ stripeCustomerId: customerId })
        .where(eq(organizations.id, session.orgId));
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      integration_identifier: checkoutIntegrationId("addon"),
      success_url: `${origin}/dashboard/billing?addon=web_search&success=true`,
      cancel_url: `${origin}/dashboard/billing?addon=web_search&canceled=true`,
      metadata: {
        organizationId: session.orgId,
        kind: "web_search_addon",
        priceId,
      },
      subscription_data: {
        metadata: {
          organizationId: session.orgId,
          kind: "web_search_addon",
          priceId,
        },
      },
      saved_payment_method_options: {
        payment_method_save: "enabled",
      },
    });

    await logAuditEvent({
      organizationId: session.orgId,
      userId: session.userId,
      action: "billing.checkout_started",
      entityType: "organization",
      entityId: session.orgId,
      metadata: { addon: WEB_SEARCH_ADDON.id, priceId, amountUsd: WEB_SEARCH_ADDON.amountUsd },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to start Web Search checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
