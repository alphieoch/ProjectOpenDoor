import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeInstance } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";

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
      const orgId = session.subscription_data?.metadata?.organizationId;
      if (orgId && session.subscription) {
        await db
          .update(organizations)
          .set({
            stripeSubscriptionId: session.subscription as string,
            subscriptionStatus: "active",
            plan: "pro",
          })
          .where(eq(organizations.id, orgId));
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
      if (subscription.customer) {
        const status = subscription.status;
        await db
          .update(organizations)
          .set({ subscriptionStatus: status })
          .where(
            eq(organizations.stripeCustomerId, subscription.customer as string)
          );
      }
      break;
    }

    default:
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
