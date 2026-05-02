import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

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
        ssoEnabled: true,
        ssoDefaultRole: true,
        workosOrganizationId: true,
        workosConnectionId: true,
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({ org });
  } catch (error: any) {
    console.error("SSO settings fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch SSO settings" },
      { status: 500 }
    );
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
    } = await req.json();

    const db = getDb();
    await db
      .update(organizations)
      .set({
        ssoEnabled: ssoEnabled ?? false,
        ssoDefaultRole: ssoDefaultRole || "member",
        workosOrganizationId: workosOrganizationId || null,
        workosConnectionId: workosConnectionId || null,
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
