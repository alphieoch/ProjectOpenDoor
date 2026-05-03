/**
 * Creates OpenDoor recurring subscriptions + one-time prepaid credit top-up prices.
 *
 * Run from repo root:
 *   bun --env-file=.env apps/dashboard/scripts/setup-stripe-products.ts
 */
import Stripe from "stripe";

const API_VERSION = "2025-03-31.basil" as const;
const APP_METADATA = { app: "opendoor" };

async function getOrCreateProduct(
  stripe: Stripe,
  name: string,
  description: string
): Promise<Stripe.Product> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find(
    (p) => p.name === name && p.metadata?.app === APP_METADATA.app
  );
  if (existing) return existing;
  return stripe.products.create({
    name,
    description,
    metadata: APP_METADATA,
  });
}

async function getOrCreateMonthlyPrice(
  stripe: Stripe,
  productId: string,
  unitAmount: number
): Promise<Stripe.Price> {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 50,
  });
  const existing = prices.data.find(
    (pr) =>
      pr.recurring?.interval === "month" &&
      pr.unit_amount === unitAmount &&
      pr.currency === "usd"
  );
  if (existing) return existing;

  return stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: APP_METADATA,
  });
}

async function getOrCreateOneTimePrice(
  stripe: Stripe,
  productId: string,
  unitAmount: number
): Promise<Stripe.Price> {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 50,
  });
  const existing = prices.data.find(
    (pr) =>
      !pr.recurring &&
      pr.unit_amount === unitAmount &&
      pr.currency === "usd"
  );
  if (existing) return existing;

  return stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: "usd",
    metadata: APP_METADATA,
  });
}

async function archiveLegacyEnterpriseMonthlyPrice(
  stripe: Stripe,
  productId: string
): Promise<void> {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });

  const legacy = prices.data.filter(
    (pr) => pr.recurring?.interval === "month" && pr.unit_amount === 29900
  );
  for (const oldPrice of legacy) {
    await stripe.prices.update(oldPrice.id, { active: false });
  }
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_")) {
    console.error(
      "Missing STRIPE_SECRET_KEY. Example:\n  bun --env-file=.env apps/dashboard/scripts/setup-stripe-products.ts"
    );
    process.exit(1);
  }

  const stripe = new Stripe(key, { apiVersion: API_VERSION, typescript: true });

  const proProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Pro",
    "Pro plan — reduced markup, priority routing"
  );
  const enterpriseProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Enterprise",
    "Enterprise — custom markup, SSO, dedicated capacity"
  );
  const creditsProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Credits",
    "Prepaid balance top-ups for token-based API usage"
  );

  await archiveLegacyEnterpriseMonthlyPrice(stripe, enterpriseProduct.id);

  const proPrice = await getOrCreateMonthlyPrice(stripe, proProduct.id, 4900);
  const enterprisePrice = await getOrCreateMonthlyPrice(
    stripe,
    enterpriseProduct.id,
    29999
  );

  const topup30 = await getOrCreateOneTimePrice(stripe, creditsProduct.id, 3000);
  const topup50 = await getOrCreateOneTimePrice(stripe, creditsProduct.id, 5000);
  const topup100 = await getOrCreateOneTimePrice(stripe, creditsProduct.id, 10000);
  const topup200 = await getOrCreateOneTimePrice(stripe, creditsProduct.id, 20000);

  console.log("\nStripe prices ready. Add to .env / apps/dashboard/.env.local:\n");
  console.log(`STRIPE_PRO_PRICE_ID=${proPrice.id}`);
  console.log(`STRIPE_ENTERPRISE_PRICE_ID=${enterprisePrice.id}`);
  console.log(`NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=${proPrice.id}`);
  console.log(`NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID=${enterprisePrice.id}`);
  console.log(`STRIPE_TOPUP_30_PRICE_ID=${topup30.id}`);
  console.log(`STRIPE_TOPUP_50_PRICE_ID=${topup50.id}`);
  console.log(`STRIPE_TOPUP_100_PRICE_ID=${topup100.id}`);
  console.log(`STRIPE_TOPUP_200_PRICE_ID=${topup200.id}`);
  console.log(`NEXT_PUBLIC_STRIPE_TOPUP_30_PRICE_ID=${topup30.id}`);
  console.log(`NEXT_PUBLIC_STRIPE_TOPUP_50_PRICE_ID=${topup50.id}`);
  console.log(`NEXT_PUBLIC_STRIPE_TOPUP_100_PRICE_ID=${topup100.id}`);
  console.log(`NEXT_PUBLIC_STRIPE_TOPUP_200_PRICE_ID=${topup200.id}`);
  console.log(
    "\nOptional:\nNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...\nSTRIPE_WEBHOOK_SECRET=whsec_...\n"
  );
  console.log(
    "Local webhooks: stripe listen --forward-to localhost:3000/api/webhooks/stripe\n"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
