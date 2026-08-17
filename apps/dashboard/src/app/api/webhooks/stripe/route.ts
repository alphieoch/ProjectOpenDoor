import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPlanFromPriceId, getStripeInstance, isAgentsAddonPriceId, isWebSearchAddonPriceId } from "@/lib/stripe";
import {
  includedCreditCents,
  qualifiesForTopupBonus,
  TOPUP_BONUS_CENTS,
  welcomeExpiresAt,
  type PlanId,
} from "@opendoor/shared";
import { getDb } from "@/lib/db";
import {
  organizations,
  creditTransactions,
  assistantPurchases,
  aiAssistants,
  workspaceAgents,
} from "@opendoor/database";
import { and, eq } from "drizzle-orm";
import {
  paymentMethodFromCheckoutSession,
  persistCustomerPaymentMethod,
} from "@/lib/billing-stripe";
import { ensureWebSearchAddonColumns } from "@/lib/web-search/entitlement";
import { posthogServerCapture } from "@/lib/posthog-server";

function parseAmountCents(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asPlanId(value: unknown): PlanId {
  if (value === "pro" || value === "team" || value === "enterprise") return value;
  return "free";
}

function getPlanForSession(session: Stripe.Checkout.Session): PlanId {
  return asPlanId(session.metadata?.plan);
}

function isAgentsAddonMeta(meta?: Stripe.Metadata | null) {
  return meta?.kind === "agents_addon";
}

function isWebSearchAddonMeta(meta?: Stripe.Metadata | null) {
  return meta?.kind === "web_search_addon";
}

async function setAgentsAddon(
  orgId: string,
  status: string,
  subscriptionId?: string | null,
) {
  const db = getDb();
  await db
    .update(organizations)
    .set({
      agentsAddonStatus: status,
      ...(subscriptionId === undefined ? {} : { stripeAgentsSubscriptionId: subscriptionId }),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    try {
      await db
        .update(workspaceAgents)
        .set({
          status: "stopped",
          statusMessage: "Agents add-on is no longer active",
          stoppedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(workspaceAgents.organizationId, orgId));
    } catch (error) {
      console.warn("Failed to stop agents after add-on change:", error);
    }
  }
}

async function setWebSearchAddon(
  orgId: string,
  status: string,
  subscriptionId?: string | null,
) {
  await ensureWebSearchAddonColumns();
  const db = getDb();
  await db
    .update(organizations)
    .set({
      webSearchAddonStatus: status,
      ...(subscriptionId === undefined ? {} : { stripeWebSearchSubscriptionId: subscriptionId }),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = invoice.parent?.subscription_details?.subscription;
  if (typeof fromParent === "string" && fromParent) return fromParent;
  if (fromParent && typeof fromParent === "object" && "id" in fromParent) {
    return String(fromParent.id);
  }
  const legacy = (invoice as { subscription?: unknown }).subscription;
  return typeof legacy === "string" && legacy ? legacy : null;
}

async function applyPlanStipend(
  orgId: string,
  plan: PlanId,
  seats: number,
  invoiceId: string
) {
  const amountCents = includedCreditCents(plan, seats);
  if (amountCents <= 0) return;

  const db = getDb();
  const grantKey = `invoice:${invoiceId}`;
  const existing = await db.query.creditTransactions.findFirst({
    where: eq(creditTransactions.stripePaymentIntentId, grantKey),
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
    kind: "plan_grant",
    amountCents,
    balanceAfterCents: next,
    stripePaymentIntentId: grantKey,
    metadata: { source: "plan_stipend", plan, seats, invoiceId },
  });
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

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      creditsUsdCents: true,
      welcomeCreditsUsdCents: true,
      welcomeExpiresAt: true,
      signupCreditGranted: true,
    },
  });
  if (!org) return;

  let current = Number(org.creditsUsdCents || 0);
  let currentWelcome = Number(org.welcomeCreditsUsdCents || 0);
  const alreadyGranted = Boolean(org.signupCreditGranted);

  if (!existing) {
    current += amountCents;
    await db
      .update(organizations)
      .set({ creditsUsdCents: current })
      .where(eq(organizations.id, orgId));
    await db.insert(creditTransactions).values({
      organizationId: orgId,
      kind: "topup",
      amountCents,
      balanceAfterCents: current,
      stripePaymentIntentId: paymentIntentId,
      metadata: { source },
    });
  }

  if (qualifiesForTopupBonus(amountCents, alreadyGranted)) {
    const bonusCents = TOPUP_BONUS_CENTS;
    const expires = welcomeExpiresAt();
    current += bonusCents;
    currentWelcome += bonusCents;
    await db
      .update(organizations)
      .set({
        creditsUsdCents: current,
        welcomeCreditsUsdCents: currentWelcome,
        welcomeExpiresAt: expires,
        signupCreditGranted: true,
      })
      .where(eq(organizations.id, orgId));
    await db.insert(creditTransactions).values({
      organizationId: orgId,
      kind: "topup_bonus",
      amountCents: bonusCents,
      balanceAfterCents: current,
      metadata: {
        source: "topup_open_weight_bonus",
        restricted_to: "open_weight",
        qualifying_topup_cents: amountCents,
        expires_at: expires.toISOString(),
      },
    });
  }
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

      if (session.mode === "subscription" && orgId && session.subscription && isAgentsAddonMeta(session.metadata)) {
        await setAgentsAddon(orgId, "active", session.subscription as string);
      } else if (session.mode === "subscription" && orgId && session.subscription && isWebSearchAddonMeta(session.metadata)) {
        await setWebSearchAddon(orgId, "active", session.subscription as string);
      } else if (session.mode === "subscription" && orgId && session.subscription && !assistantId) {
        const plan = getPlanForSession(session);
        await db
          .update(organizations)
          .set({
            stripeSubscriptionId: session.subscription as string,
            stripePriceId: (session.metadata?.priceId as string | undefined) || null,
            subscriptionStatus: "active",
            plan,
          })
          .where(eq(organizations.id, orgId));
        posthogServerCapture(null, orgId, "billing_subscribe", {
          organization_id: orgId,
          plan,
          stripe_subscription_id: session.subscription,
        });
      }

      if (session.mode === "payment" && kind === "topup" && orgId) {
        await applyTopupCredit(
          orgId,
          String(session.payment_intent || ""),
          parseAmountCents(session.metadata?.amountCents),
          "checkout"
        );
      }

      if (orgId && session.customer) {
        try {
          const paymentMethodId = await paymentMethodFromCheckoutSession(session);
          await persistCustomerPaymentMethod(
            orgId,
            session.customer as string,
            paymentMethodId
          );
        } catch (error) {
          console.warn("Failed to persist checkout payment method:", error);
        }
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId && invoice.customer) {
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.stripeCustomerId, invoice.customer as string),
          columns: { id: true, plan: true },
        });
        if (org) {
          const stripe = getStripeInstance();
          const subscription = await stripe.subscriptions.retrieve(
            subscriptionId
          );
          const agentsItem = subscription.items.data.find((item) =>
            isAgentsAddonPriceId(item.price.id) || isAgentsAddonMeta(subscription.metadata),
          );
          if (agentsItem || isAgentsAddonMeta(subscription.metadata)) {
            await setAgentsAddon(org.id, "active", subscription.id);
            break;
          }
          const webSearchItem = subscription.items.data.find((item) =>
            isWebSearchAddonPriceId(item.price.id) || isWebSearchAddonMeta(subscription.metadata),
          );
          if (webSearchItem || isWebSearchAddonMeta(subscription.metadata)) {
            await setWebSearchAddon(org.id, "active", subscription.id);
            break;
          }
          const item = subscription.items.data[0];
          const plan = asPlanId(
            subscription.metadata?.plan || getPlanFromPriceId(item?.price.id || "")
          );
          const seats = Math.max(1, item?.quantity || 1);
          await db
            .update(organizations)
            .set({
              subscriptionStatus: "active",
              plan,
              stripeSubscriptionId: subscription.id,
              stripePriceId: item?.price.id || null,
            })
            .where(eq(organizations.id, org.id));
          await applyPlanStipend(org.id, plan, seats, invoice.id);
        }
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
      if (isAgentsAddonMeta(subscription.metadata) || subscription.items.data.some((item) => isAgentsAddonPriceId(item.price.id))) {
        const org = subscription.customer
          ? await db.query.organizations.findFirst({
              where: eq(organizations.stripeCustomerId, subscription.customer as string),
              columns: { id: true },
            })
          : null;
        if (org) await setAgentsAddon(org.id, "canceled", null);
        break;
      }
      if (isWebSearchAddonMeta(subscription.metadata) || subscription.items.data.some((item) => isWebSearchAddonPriceId(item.price.id))) {
        const org = subscription.customer
          ? await db.query.organizations.findFirst({
              where: eq(organizations.stripeCustomerId, subscription.customer as string),
              columns: { id: true },
            })
          : null;
        if (org) await setWebSearchAddon(org.id, "canceled", null);
        break;
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
      if (isAgentsAddonMeta(subscription.metadata) || subscription.items.data.some((item) => isAgentsAddonPriceId(item.price.id))) {
        const org = subscription.customer
          ? await db.query.organizations.findFirst({
              where: eq(organizations.stripeCustomerId, subscription.customer as string),
              columns: { id: true },
            })
          : null;
        if (org) {
          const dead = subscription.status === "canceled" || subscription.status === "unpaid" || subscription.status === "incomplete_expired";
          await setAgentsAddon(org.id, dead ? "canceled" : subscription.status, dead ? null : subscription.id);
        }
        break;
      }
      if (isWebSearchAddonMeta(subscription.metadata) || subscription.items.data.some((item) => isWebSearchAddonPriceId(item.price.id))) {
        const org = subscription.customer
          ? await db.query.organizations.findFirst({
              where: eq(organizations.stripeCustomerId, subscription.customer as string),
              columns: { id: true },
            })
          : null;
        if (org) {
          const dead = subscription.status === "canceled" || subscription.status === "unpaid" || subscription.status === "incomplete_expired";
          await setWebSearchAddon(org.id, dead ? "canceled" : subscription.status, dead ? null : subscription.id);
        }
        break;
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
