import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { loadEnterpriseAccess } from "@/lib/enterprise";
import { workspaceHasEnterpriseTools } from "@opendoor/shared";

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
        slug: true,
        plan: true,
        ssoEnabled: true,
        ssoDefaultRole: true,
        workosOrganizationId: true,
        workosConnectionId: true,
        customDomain: true,
        customDomainVerified: true,
        emailNotificationsEnabled: true,
        notifyOnInvites: true,
        notifyOnBillingAlerts: true,
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const enterpriseTools = workspaceHasEnterpriseTools({
      plan: org.plan,
      isSiteAdmin: session.isSiteAdmin,
    });

    return NextResponse.json({
      org,
      enterpriseTools,
      sso: {
        included: enterpriseTools,
        enabled: Boolean(org.ssoEnabled),
        defaultRole: org.ssoDefaultRole || "member",
        workosOrganizationId: org.workosOrganizationId,
        workosConnectionId: org.workosConnectionId,
      },
      scim: {
        included: enterpriseTools,
        available: enterpriseTools,
        configured: Boolean(org.workosOrganizationId),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load SSO settings";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;

    // Only admins can update SSO settings
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const {
      ssoEnabled,
      ssoDefaultRole,
      workosOrganizationId,
      workosConnectionId,
      customDomain,
      customDomainVerified,
      emailNotificationsEnabled,
      notifyOnInvites,
      notifyOnBillingAlerts,
    } = await req.json();

    const db = getDb();
    const access = await loadEnterpriseAccess(orgId, session);
    await db
      .update(organizations)
      .set({
        ssoEnabled: ssoEnabled ?? false,
        ssoDefaultRole: ssoDefaultRole || "member",
        workosOrganizationId: workosOrganizationId || null,
        workosConnectionId: workosConnectionId || null,
        emailNotificationsEnabled: emailNotificationsEnabled ?? true,
        notifyOnInvites: notifyOnInvites ?? true,
        notifyOnBillingAlerts: notifyOnBillingAlerts ?? true,
        ...(access.active
          ? {
              customDomain: customDomain || null,
              customDomainVerified: customDomainVerified ?? false,
            }
          : {}),
      })
      .where(eq(organizations.id, orgId));

    await logAuditEvent({
      organizationId: orgId,
      userId: session.sub as string,
      action: ssoEnabled ? "sso.enabled" : "sso.disabled",
      entityType: "organization",
      entityId: orgId,
      metadata: { workosOrganizationId, workosConnectionId, ssoDefaultRole },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update SSO settings";
    console.error("SSO settings update error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
