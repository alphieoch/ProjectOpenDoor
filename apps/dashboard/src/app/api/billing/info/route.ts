import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations, users } from "@opendoor/database";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { checkoutPlanConfigured } from "@/lib/stripe";
import { loadAgentsEntitlement } from "@/lib/agents/entitlement";
import { loadWebSearchEntitlement } from "@/lib/web-search/entitlement";

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;

    const db = getDb();
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        id: true,
        name: true,
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
        monthlyBudgetUsd: true,
        creditsUsdCents: true,
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const [seatRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.organizationId, orgId));

    const [addon, webSearchAddon] = await Promise.all([
      loadAgentsEntitlement(orgId, session),
      loadWebSearchEntitlement(orgId, session),
    ]);

    return NextResponse.json({
      org,
      seatCount: Math.max(1, Number(seatRow?.n || 1)),
      checkout: {
        pro: checkoutPlanConfigured("pro"),
        team: checkoutPlanConfigured("team"),
        agents: addon.configured,
        webSearch: webSearchAddon.configured,
      },
      addon,
      webSearchAddon,
    });
  } catch (error: any) {
    console.error("Billing info error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch billing info" },
      { status: 500 }
    );
  }
}
