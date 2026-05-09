import { getStripeInstance } from "@/lib/stripe";

/**
 * Create or update a Stripe Product + Price for an assistant.
 * Returns the stripePriceId to store.
 */
export async function ensureAssistantStripePrice(params: {
  name: string;
  monetization: string;
  priceCents: number;
  existingStripePriceId?: string | null;
  assistantId: string;
  orgId: string;
}): Promise<string | null> {
  const { name, monetization, priceCents, existingStripePriceId, assistantId, orgId } = params;

  if (monetization === "free" || !priceCents || priceCents <= 0) {
    return null;
  }

  const stripe = getStripeInstance();

  // If there's an existing price, we could check if the amount changed.
  // Stripe prices are immutable, so if the price changed we need a new one.
  // For simplicity, always create a new product+price when saving a paid assistant.
  // In production you might want to reuse the product and only create a new price.

  const product = await stripe.products.create({
    name: `${name} — ${monetization === "subscription" ? "Monthly" : "Lifetime"} Access`,
    metadata: { assistantId, organizationId: orgId },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: priceCents,
    currency: "gbp",
    recurring: monetization === "subscription" ? { interval: "month" } : undefined,
  });

  return price.id;
}
