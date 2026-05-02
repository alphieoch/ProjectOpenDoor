import { NextRequest, NextResponse } from "next/server";
import { getWorkOS, getWorkOSClientId } from "@/lib/workos";
import { getDb } from "@/lib/db";
import { users, organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { createToken } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect("/login?error=sso_failed");
  }

  try {
    const workos = getWorkOS();
    const clientId = getWorkOSClientId();

    const { profile } = await workos.sso.getProfileAndToken({
      code,
      clientId,
    });

    // Validate organization ID from profile
    const workosOrgId = profile.organizationId;
    if (!workosOrgId) {
      return NextResponse.redirect("/login?error=invalid_org");
    }

    const db = getDb();

    // Find organization by WorkOS ID
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.workosOrganizationId, workosOrgId),
    });

    if (!org) {
      return NextResponse.redirect("/login?error=org_not_found");
    }

    if (!org.ssoEnabled) {
      return NextResponse.redirect("/login?error=sso_disabled");
    }

    // Find or create user
    let user = await db.query.users.findFirst({
      where: eq(users.email, profile.email),
    });

    if (!user) {
      // JIT provision the user
      const [newUser] = await db
        .insert(users)
        .values({
          email: profile.email,
          name: profile.firstName
            ? `${profile.firstName} ${profile.lastName || ""}`.trim()
            : profile.email,
          organizationId: org.id,
          role: org.ssoDefaultRole || "member",
        })
        .returning();
      user = newUser;
    }

    // Create session token
    const token = await createToken({
      sub: user.id,
      email: user.email,
      orgId: user.organizationId,
      role: user.role,
    });

    await logAuditEvent({
      organizationId: org.id,
      userId: user.id,
      action: "user.login",
      entityType: "user",
      entityId: user.id,
      metadata: { method: "sso", provider: profile.connectionType },
    });

    const response = NextResponse.redirect("/dashboard");
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("SSO callback error:", error);
    return NextResponse.redirect("/login?error=sso_callback_failed");
  }
}
