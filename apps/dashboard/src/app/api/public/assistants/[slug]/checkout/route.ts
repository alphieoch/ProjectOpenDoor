import { NextRequest, NextResponse } from "next/server";
import { getStripeInstance } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { aiAssistants, organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const { slug } = await params;
    const db = getDb();

    const [assistant] = await db
      .select()
      .from(aiAssistants)
      .where(eq(aiAssistants.slug, slug));

    if (!assistant || !assistant.enabled || !assistant.publishedAt) {
      return NextResponse.json({ error: "Assistant not found" }, { status: 404 });
    }

    if (assistant.visibility !== "public") {
      return NextResponse.json({ error: "This assistant is not available for purchase" }, { status: 403 });
    }

    if (assistant.monetization === "free" || !assistant.priceCents || !assistant.stripePriceId) {
      return NextResponse.json({ error: "This assistant is free" }, { status: 400 });
    }

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, assistant.organizationId),
    });

    const stripe = getStripeInstance();

    // Get or create Stripe customer for this user
    // We store the customer ID on the org for simplicity, or we could create a separate user-level customer
    let customerId = org?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: session.email || session.userId,
        metadata: { userId: session.userId, organizationId: session.orgId },
      });
      customerId = customer.id;
      await db
        .update(organizations)
        .set({ stripeCustomerId: customerId })
        .where(eq(organizations.id, session.orgId));
    }

    const body = await req.json().catch(() => ({}));
    const returnUrl = body.returnUrl || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"}/ai/${slug}`;

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: assistant.stripePriceId, quantity: 1 }],
      mode: assistant.monetization === "subscription" ? "subscription" : "payment",
      success_url: `${returnUrl}?purchase=success`,
      cancel_url: `${returnUrl}?purchase=canceled`,
      metadata: {
        assistantId: assistant.id,
        userId: session.userId,
        type: assistant.monetization,
        amountCents: String(assistant.priceCents),
      },
      subscription_data: assistant.monetization === "subscription" ? {
        metadata: { assistantId: assistant.id, userId: session.userId },
      } : undefined,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error("Assistant checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
