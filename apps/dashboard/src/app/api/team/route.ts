import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations, users } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { billingIsUnlimited, getPlan } from "@opendoor/shared";
import { orgHasUnlimitedSpend } from "@/lib/credits";

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;

    const db = getDb();
    const [org, members] = await Promise.all([
      db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { id: true, name: true, plan: true },
      }),
      db.query.users.findMany({
        where: eq(users.organizationId, orgId),
        columns: {
          id: true,
          email: true,
          name: true,
          role: true,
          isSiteAdmin: true,
          createdAt: true,
        },
        orderBy: (users, { desc }) => [desc(users.createdAt)],
      }),
    ]);

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const unlimited = await orgHasUnlimitedSpend(orgId, { isSiteAdmin: session.isSiteAdmin });
    const plan = getPlan(org.plan);

    return NextResponse.json({
      members,
      plan: org.plan,
      planName: plan.name,
      isFamilyPlan: Boolean(plan.isPool),
      maxSeats: plan.maxSeats ?? members.length,
      unlimited,
      unlimitedReason: session.isSiteAdmin
        ? "site_admin"
        : billingIsUnlimited({ plan: org.plan })
          ? "plan"
          : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch team members";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
