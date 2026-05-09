import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeInstance } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { organizations, creditTransactions, assistantPurchases } from "@opendoor/database";
import { and, eq } from "drizzle-orm";

function parseAmountCents(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPlanForSession(session: Stripe.Checkout.Session): "free" | "pro" | "enterprise" {
  const metadataPlan = session.metadata?.plan;
  if (metadataPlan === "pro" || metadataPlan === "enterprise") {
    return metadataPlan;
  }
  return "free";
}

async function applyTopupCredit(
  orgId: string,
  paymentIntentId: string,
  amountCents: number,
  source: "checkout" | "auto_recharge"
) {
  const db = getDb();
  if (!paymentIntentId || amountCents <= 0) return;

  const existing = await db.query.creditTransactions.findFirst({
    where: eq(creditTransactions.stripePaymentIntentId, paymentIntentId),
  });
  if (existing) return;

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { creditsUsdCents: true },
  });
  if (!org) return;

  const current = Number(org.creditsUsdCents || 0);
  const next = current + amountCents;

  await db
    .update(organizations)
    .set({ creditsUsdCents: next })
    .where(eq(organizations.id, orgId));

  await db.insert(creditTransactions).values({
    organizationId: orgId,
    kind: "topup",
    amountCents,
    balanceAfterCents: next,
    stripePaymentIntentId: paymentIntentId,
    metadata: { source },
  });
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") || "";

  let event: Stripe.Event;

  try {
    const stripe = getStripeInstance();
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ""
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const db = getDb();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.organizationId;
      const kind = session.metadata?.kind;
      const assistantId = session.metadata?.assistantId;
      const userId = session.metadata?.userId;
      const type = session.metadata?.type;

      // Assistant purchase
      if (assistantId && userId && type) {
        const amountCents = parseAmountCents(session.metadata?.amountCents);
        // Look up assistant to get seller earnings
        const assistantRow = await db.query.aiAssistants.findFirst({
          where: eq(aiAssistants.id, assistantId),
          columns: { sellerEarningsCents: true },
        });
        const sellerEarningsCents = assistantRow?.sellerEarningsCents ?? amountCents;

        const existing = await db.query.assistantPurchases.findFirst({
          where: and(
            eq(assistantPurchases.assistantId, assistantId),
            eq(assistantPurchases.userId, userId),
            eq(assistantPurchases.type, type)
          ),
        });

        if (!existing) {
          await db.insert(assistantPurchases).values({
            assistantId,
            userId,
            type: type as "one_time" | "subscription",
            stripeCustomerId: session.customer as string | undefined,
            stripePaymentIntentId: session.payment_intent as string | undefined,
            stripeSubscriptionId: session.subscription as string | undefined,
            status: "active",
            amountCents,
            sellerEarningsCents,
          });
        } else {
          await db
            .update(assistantPurchases)
            .set({
              status: "active",
              stripePaymentIntentId: session.payment_intent as string | undefined,
              stripeSubscriptionId: session.subscription as string | undefined,
              amountCents,
              sellerEarningsCents,
              updatedAt: new Date(),
            })
            .where(eq(assistantPurchases.id, existing.id));
        }
      }

      // Org plan subscription
      if (session.mode === "subscription" && orgId && session.subscription && !assistantId) {
        await db
          .update(organizations)
          .set({
            stripeSubscriptionId: session.subscription as string,
            stripePriceId: (session.metadata?.priceId as string | undefined) || null,
            subscriptionStatus: "active",
            plan: getPlanForSession(session),
          })
          .where(eq(organizations.id, orgId));
      }

      if (session.mode === "payment" && kind === "topup" && orgId) {
        await applyTopupCredit(
          orgId,
          String(session.payment_intent || ""),
          parseAmountCents(session.metadata?.amountCents),
          "checkout"
        );
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription && invoice.customer) {
        await db
          .update(organizations)
          .set({ subscriptionStatus: "active" })
          .where(eq(organizations.stripeCustomerId, invoice.customer as string));
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.customer) {
        await db
          .update(organizations)
          .set({ subscriptionStatus: "past_due" })
          .where(eq(organizations.stripeCustomerId, invoice.customer as string));
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      // Update assistant purchases if this subscription matches
      if (subscription.id) {
        await db
          .update(assistantPurchases)
          .set({ status: "canceled", updatedAt: new Date() })
          .where(eq(assistantPurchases.stripeSubscriptionId, subscription.id));
      }
      // Also update org plan if it matches
      if (subscription.customer) {
        await db
          .update(organizations)
          .set({
            subscriptionStatus: "canceled",
            stripeSubscriptionId: null,
            plan: "free",
          })
          .where(
            eq(organizations.stripeCustomerId, subscription.customer as string)
          );
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      // Update assistant purchases
      if (subscription.id) {
        const status = subscription.status;
        const updates: Record<string, unknown> = { status, updatedAt: new Date() };
        if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
          updates.expiresAt = new Date();
        }
        await db
          .update(assistantPurchases)
          .set(updates)
          .where(eq(assistantPurchases.stripeSubscriptionId, subscription.id));
      }
      // Update org plan
      if (subscription.customer) {
        const status = subscription.status;
        const updates: Record<string, unknown> = { subscriptionStatus: status };
        if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
          updates.plan = "free";
        }
        await db
          .update(organizations)
          .set(updates)
          .where(
            eq(organizations.stripeCustomerId, subscription.customer as string)
          );
      }
      break;
    }

    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata?.kind === "auto_recharge" && intent.metadata.organizationId) {
        await applyTopupCredit(
          intent.metadata.organizationId,
          intent.id,
          parseAmountCents(intent.metadata.amountCents),
          "auto_recharge"
        );
      }
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string" ? charge.payment_intent : "";
      if (!paymentIntentId || !charge.amount_refunded) {
        break;
      }

      const originalTopup = await db.query.creditTransactions.findFirst({
        where: eq(creditTransactions.stripePaymentIntentId, paymentIntentId),
      });
      if (!originalTopup) break;

      const refundExists = await db.query.creditTransactions.findFirst({
        where: and(
          eq(creditTransactions.organizationId, originalTopup.organizationId),
          eq(creditTransactions.kind, "refund"),
          eq(creditTransactions.stripePaymentIntentId, paymentIntentId)
        ),
      });
      if (refundExists) break;

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, originalTopup.organizationId),
        columns: { creditsUsdCents: true },
      });
      if (!org) break;

      const refundAmount = Number(charge.amount_refunded || 0);
      const current = Number(org.creditsUsdCents || 0);
      const next = Math.max(0, current - refundAmount);

      await db
        .update(organizations)
        .set({ creditsUsdCents: next })
        .where(eq(organizations.id, originalTopup.organizationId));

      await db.insert(creditTransactions).values({
        organizationId: originalTopup.organizationId,
        kind: "refund",
        amountCents: -refundAmount,
        balanceAfterCents: next,
        stripePaymentIntentId: paymentIntentId,
        metadata: { refundFor: "topup" },
      });
      break;
    }

    default:
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
