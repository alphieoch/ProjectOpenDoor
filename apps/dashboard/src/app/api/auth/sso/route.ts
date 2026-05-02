import { NextRequest, NextResponse } from "next/server";
import { getWorkOS, getWorkOSClientId } from "@/lib/workos";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgSlug = searchParams.get("org");
  const orgId = searchParams.get("organizationId");

  try {
    const workos = getWorkOS();
    const clientId = getWorkOSClientId();

    let workosOrgId = orgId;

    // If slug provided, lookup the org
    if (orgSlug && !workosOrgId) {
      const db = getDb();
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.slug, orgSlug),
        columns: {
          workosOrganizationId: true,
          ssoEnabled: true,
        },
      });

      if (!org || !org.ssoEnabled || !org.workosOrganizationId) {
        return NextResponse.json(
          { error: "SSO is not enabled for this organization" },
          { status: 400 }
        );
      }

      workosOrgId = org.workosOrganizationId;
    }

    if (!workosOrgId) {
      return NextResponse.json(
        { error: "Organization ID required" },
        { status: 400 }
      );
    }

    const authorizationUrl = workos.sso.getAuthorizationURL({
      organization: workosOrgId,
      clientId,
      redirectUri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/sso/callback`,
      state: Buffer.from(JSON.stringify({ orgId: workosOrgId })).toString("base64"),
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (error: any) {
    console.error("SSO initiate error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initiate SSO" },
      { status: 500 }
    );
  }
}
