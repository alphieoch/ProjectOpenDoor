import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { loadEnterpriseAccess } from "@/lib/enterprise";

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;

    const db = getDb();
    let org = orgId
      ? await db.query.organizations.findFirst({
          where: eq(organizations.id, orgId),
          columns: {
            id: true,
            name: true,
            slug: true,
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
        }).catch(() => null)
      : null;

    if (!org) {
      // Look for any first org or create single-user default workspace
      const firstOrg = await db.query.organizations.findFirst({
        columns: {
          id: true,
          name: true,
          slug: true,
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
      }).catch(() => null);

      if (firstOrg) {
        org = firstOrg;
      } else {
        // Create default organization
        try {
          const inserted = await db.insert(organizations).values({
            name: "OpenDoor Workspace",
            slug: "opendoor-workspace",
            plan: "pro",
            ssoEnabled: false,
            ssoDefaultRole: "admin",
            emailNotificationsEnabled: true,
            notifyOnInvites: true,
            notifyOnBillingAlerts: true,
          }).returning();
          if (inserted[0]) {
            org = {
              id: inserted[0].id,
              name: inserted[0].name,
              slug: inserted[0].slug,
              ssoEnabled: inserted[0].ssoEnabled,
              ssoDefaultRole: inserted[0].ssoDefaultRole,
              workosOrganizationId: inserted[0].workosOrganizationId,
              workosConnectionId: inserted[0].workosConnectionId,
              customDomain: inserted[0].customDomain,
              customDomainVerified: inserted[0].customDomainVerified,
              emailNotificationsEnabled: inserted[0].emailNotificationsEnabled,
              notifyOnInvites: inserted[0].notifyOnInvites,
              notifyOnBillingAlerts: inserted[0].notifyOnBillingAlerts,
            };
          }
        } catch {
          // fallback in-memory object
        }
      }
    }

    if (!org) {
      org = {
        id: orgId || "single-user-workspace",
        name: "OpenDoor Workspace",
        slug: "opendoor",
        ssoEnabled: false,
        ssoDefaultRole: "admin",
        workosOrganizationId: null,
        workosConnectionId: null,
        customDomain: null,
        customDomainVerified: false,
        emailNotificationsEnabled: true,
        notifyOnInvites: true,
        notifyOnBillingAlerts: true,
      };
    }

    return NextResponse.json({ org });
  } catch (error: any) {
    console.error("SSO settings fetch error:", error);
    return NextResponse.json({
      org: {
        id: "single-user-workspace",
        name: "OpenDoor Workspace",
        slug: "opendoor",
        ssoEnabled: false,
        ssoDefaultRole: "admin",
        workosOrganizationId: null,
        workosConnectionId: null,
        customDomain: null,
        customDomainVerified: false,
        emailNotificationsEnabled: true,
        notifyOnInvites: true,
        notifyOnBillingAlerts: true,
      },
    });
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
  } catch (error: any) {
    console.error("SSO settings update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update SSO settings" },
      { status: 500 }
    );
  }
}
