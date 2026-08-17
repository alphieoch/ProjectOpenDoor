import { NextResponse } from "next/server";
import { AGENTS_ADDON } from "@opendoor/shared";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { appBaseUrl } from "@/lib/public-urls";
import { agentsAddonPriceId, checkoutIntegrationId, getStripeInstance } from "@/lib/stripe";
import { ensureAgentsAddonColumns, loadAgentsEntitlement } from "@/lib/agents/entitlement";

export async function GET() {
  const session = await requireAuth();
  const entitlement = await loadAgentsEntitlement(session.orgId, session);
  return NextResponse.json({ addon: entitlement });
}

export async function POST() {
  try {
    const session = await requireAuth();
    await ensureAgentsAddonColumns();
    const entitlement = await loadAgentsEntitlement(session.orgId, session);
    if (entitlement.active) {
      return NextResponse.json({ alreadyActive: true, addon: entitlement });
    }

    const priceId = agentsAddonPriceId();
    if (!priceId) {
      return NextResponse.json(
        { error: "Agents add-on is not configured for checkout yet." },
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
      success_url: `${origin}/dashboard/agents?addon=success`,
      cancel_url: `${origin}/dashboard/agents?addon=canceled`,
      metadata: {
        organizationId: session.orgId,
        kind: "agents_addon",
        priceId,
      },
      subscription_data: {
        metadata: {
          organizationId: session.orgId,
          kind: "agents_addon",
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
      metadata: { addon: AGENTS_ADDON.id, priceId, amountUsd: AGENTS_ADDON.amountUsd },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to start Agents checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
