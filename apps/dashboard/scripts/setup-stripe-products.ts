/**
 * Creates OpenDoor recurring subscriptions + one-time prepaid credit top-up prices.
 *
 * Run from repo root:
 *   bun --env-file=.env apps/dashboard/scripts/setup-stripe-products.ts
 */
import Stripe from "stripe";

const API_VERSION = "2026-04-22.dahlia" as const;
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

async function archiveLegacyMonthlyPrices(
  stripe: Stripe,
  productId: string,
  amounts: number[]
): Promise<void> {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });

  const legacy = prices.data.filter(
    (pr) =>
      pr.recurring?.interval === "month" &&
      typeof pr.unit_amount === "number" &&
      amounts.includes(pr.unit_amount)
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

  const studentProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Student",
    "Student membership — warehouse-rate inference with a small monthly taste"
  );
  const proProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Pro",
    "Pro account — personal storage, inference credits, and GPU quota"
  );
  const familyProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Family",
    "Family pool — 4 household seats, shared inference pool, 4-month rollover"
  );
  const familyMaxProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Family Max",
    "Family Max pool — 5 household seats, $75 shared pool, Agents included, 4-month rollover"
  );
  const teamProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Team",
    "Team plan — SSO, audit logs, and shared GPU quota per seat"
  );
  const enterpriseProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Enterprise",
    "Enterprise — SCIM, residency, and dedicated support"
  );
  const creditsProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Credits",
    "Prepaid balance top-ups for token-based API usage"
  );
  const agentsProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Agents",
    "Agents add-on — hosted OpenClaw, Hermes, and NemoClaw. Tokens still bill workspace quota."
  );
  const webSearchProduct = await getOrCreateProduct(
    stripe,
    "OpenDoor Web Search",
    "Web Search add-on — live Google results via Vertex AI Grounding. Platform GCP keys stay on the server."
  );

  await archiveLegacyMonthlyPrices(stripe, proProduct.id, [4900, 900, 700]);
  await archiveLegacyMonthlyPrices(stripe, teamProduct.id, [2000, 1500]);
  await archiveLegacyMonthlyPrices(stripe, enterpriseProduct.id, [29900, 29999, 5000, 3900]);

  await archiveLegacyMonthlyPrices(stripe, familyMaxProduct.id, [4499]);

  const studentPrice = await getOrCreateMonthlyPrice(stripe, studentProduct.id, 999);
  const proPrice = await getOrCreateMonthlyPrice(stripe, proProduct.id, 1200);
  const familyPrice = await getOrCreateMonthlyPrice(stripe, familyProduct.id, 2999);
  const familyMaxPrice = await getOrCreateMonthlyPrice(stripe, familyMaxProduct.id, 9900);
  const teamPrice = await getOrCreateMonthlyPrice(stripe, teamProduct.id, 1800);
  const enterprisePrice = await getOrCreateMonthlyPrice(
    stripe,
    enterpriseProduct.id,
    4500
  );

  const agentsPrice = await getOrCreateMonthlyPrice(stripe, agentsProduct.id, 2000);
  const webSearchPrice = await getOrCreateMonthlyPrice(stripe, webSearchProduct.id, 2000);

  const topup20 = await getOrCreateOneTimePrice(stripe, creditsProduct.id, 2000);
  const topup30 = await getOrCreateOneTimePrice(stripe, creditsProduct.id, 3000);
  const topup50 = await getOrCreateOneTimePrice(stripe, creditsProduct.id, 5000);
  const topup100 = await getOrCreateOneTimePrice(stripe, creditsProduct.id, 10000);
  const topup200 = await getOrCreateOneTimePrice(stripe, creditsProduct.id, 20000);

  console.log("\nStripe prices ready. Add to .env / apps/dashboard/.env.local:\n");
  console.log(`STRIPE_STUDENT_PRICE_ID=${studentPrice.id}`);
  console.log(`STRIPE_PRO_PRICE_ID=${proPrice.id}`);
  console.log(`STRIPE_FAMILY_PRICE_ID=${familyPrice.id}`);
  console.log(`STRIPE_FAMILY_MAX_PRICE_ID=${familyMaxPrice.id}`);
  console.log(`STRIPE_TEAM_PRICE_ID=${teamPrice.id}`);
  console.log(`STRIPE_ENTERPRISE_PRICE_ID=${enterprisePrice.id}`);
  console.log(`STRIPE_AGENTS_ADDON_PRICE_ID=${agentsPrice.id}`);
  console.log(`STRIPE_WEB_SEARCH_ADDON_PRICE_ID=${webSearchPrice.id}`);
  console.log(`STRIPE_TOPUP_20_PRICE_ID=${topup20.id}`);
  console.log(`STRIPE_TOPUP_30_PRICE_ID=${topup30.id}`);
  console.log(`STRIPE_TOPUP_50_PRICE_ID=${topup50.id}`);
  console.log(`STRIPE_TOPUP_100_PRICE_ID=${topup100.id}`);
  console.log(`STRIPE_TOPUP_200_PRICE_ID=${topup200.id}`);
  console.log(
    "\nOptional:\nNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...\nSTRIPE_WEBHOOK_SECRET=whsec_...\n"
  );
  console.log(
    "Local webhooks: stripe listen --forward-to localhost:3010/api/webhooks/stripe\n"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
