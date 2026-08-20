import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations, users } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { billingIsUnlimited, SEAT_CAP_UPGRADE_COPY, workspaceHasEnterpriseTools } from "@opendoor/shared";
import { orgHasUnlimitedSpend } from "@/lib/credits";
import { listPendingInvites, loadOrgSeatState } from "@/lib/seat-allocation";

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const isAdmin = session.role === "admin" || session.role === "owner";

    const db = getDb();
    const [state, members, pending, orgSso] = await Promise.all([
      loadOrgSeatState(orgId),
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
      listPendingInvites(orgId),
      db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: {
          ssoEnabled: true,
          ssoDefaultRole: true,
          workosOrganizationId: true,
          workosConnectionId: true,
        },
      }),
    ]);

    if (!state) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const unlimited = await orgHasUnlimitedSpend(orgId, { isSiteAdmin: session.isSiteAdmin });
    const atCap = state.atCap;
    const canInvite = isAdmin && !atCap;
    const enterpriseTools = workspaceHasEnterpriseTools({
      plan: state.org.plan,
      isSiteAdmin: session.isSiteAdmin,
    });

    return NextResponse.json({
      members,
      invitations: pending,
      plan: state.org.plan,
      planName: state.plan.name,
      perSeat: Boolean(state.plan.perSeat),
      isFamilyPlan: Boolean(state.plan.isPool),
      seatsUsed: state.seatsUsed,
      seatsPaid: state.paidSeatQuantity,
      maxSeats: state.maxSeats,
      pendingInviteCount: state.pendingInviteCount,
      atCap,
      canInvite,
      isAdmin,
      role: session.role,
      upgradeCopy: SEAT_CAP_UPGRADE_COPY,
      unlimited,
      unlimitedReason: session.isSiteAdmin
        ? "site_admin"
        : billingIsUnlimited({ plan: state.org.plan })
          ? "plan"
          : null,
      enterpriseTools,
      sso: {
        included: enterpriseTools,
        enabled: Boolean(orgSso?.ssoEnabled),
        defaultRole: orgSso?.ssoDefaultRole || "member",
        workosOrganizationId: orgSso?.workosOrganizationId || null,
        workosConnectionId: orgSso?.workosConnectionId || null,
      },
      scim: {
        included: enterpriseTools,
        available: enterpriseTools,
        configured: Boolean(orgSso?.workosOrganizationId),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch team members";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
