import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getStripeInstance } from "@/lib/stripe";

function asId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" && id ? id : null;
  }
  return null;
}

export async function persistCustomerPaymentMethod(
  orgId: string,
  customerId: string,
  paymentMethodId?: string | null
): Promise<string | null> {
  const stripe = getStripeInstance();
  let pm = paymentMethodId || null;

  if (!pm) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) {
      pm = asId(customer.invoice_settings?.default_payment_method);
    }
  }

  if (!pm) {
    const listed = await stripe.paymentMethods.list({
      customer: customerId,
      limit: 1,
    });
    pm = listed.data[0]?.id || null;
  }

  if (!pm) return null;

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm },
  });

  const db = getDb();
  await db
    .update(organizations)
    .set({ defaultPaymentMethodId: pm })
    .where(eq(organizations.id, orgId));

  return pm;
}

export async function paymentMethodFromCheckoutSession(
  session: {
    mode?: string | null;
    subscription?: unknown;
    payment_intent?: unknown;
  }
): Promise<string | null> {
  const stripe = getStripeInstance();

  if (session.mode === "subscription") {
    const subscriptionId = asId(session.subscription);
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return asId(subscription.default_payment_method);
    }
  }

  const paymentIntentId = asId(session.payment_intent);
  if (paymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return asId(intent.payment_method);
  }

  return null;
}
