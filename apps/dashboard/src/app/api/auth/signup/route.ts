import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users, organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { hashPassword, createToken } from "@/lib/auth";
import { posthogServerCapture } from "@/lib/posthog-server";
import { isOnboardingSegment, OnboardingSegment } from "@/lib/onboarding";
import {
  authenticateWorkOSPassword,
  createWorkOSUser,
  jsonAuthSuccess,
  workosErrorMessage,
} from "@/lib/workos-password-auth";
import { sessionCookieOptions, syncWorkOSUserToSession } from "@/lib/workos-sync";

export async function POST(req: NextRequest) {
  const { email, password, name, orgName, segment } = await req.json();

  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "Email, password, and name are required" },
      { status: 400 }
    );
  }

  if (password.length < 10) {
    return NextResponse.json(
      { error: "Password must be at least 10 characters" },
      { status: 400 }
    );
  }

  const onboardingSegment: OnboardingSegment = isOnboardingSegment(segment)
    ? segment
    : "standard";
  const normalized = String(email).toLowerCase().trim();

  // WorkOS-backed signup (custom UI)
  if (process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID) {
    try {
      const parts = String(name).trim().split(/\s+/);
      const workosUser = await createWorkOSUser({
        email: normalized,
        password,
        firstName: parts[0],
        lastName: parts.slice(1).join(" ") || undefined,
      });

      try {
        const { token, session, user } = await authenticateWorkOSPassword(
          req,
          normalized,
          password
        );
        // Ensure org naming preference is applied for brand-new accounts
        if (orgName) {
          const db = getDb();
          await db
            .update(organizations)
            .set({ name: orgName, updatedAt: new Date() })
            .where(eq(organizations.id, session.orgId));
        }
        posthogServerCapture(req, session.userId, "user_signed_up", {
          email: user.email,
          organization_id: session.orgId,
          onboarding_segment: onboardingSegment,
          auth_method: "workos_password",
        });
        return jsonAuthSuccess(
          {
            success: true,
            user: { id: session.userId, email: user.email, name },
          },
          token,
          "/dashboard/onboarding"
        );
      } catch (authErr) {
        const msg = workosErrorMessage(authErr, "Account created");
        if (msg.includes("verify your account")) {
          await syncWorkOSUserToSession({
            id: workosUser.id,
            email: workosUser.email,
            firstName: workosUser.firstName,
            lastName: workosUser.lastName,
          });
          return NextResponse.json(
            {
              error: msg,
              needsVerification: true,
            },
            { status: 403 }
          );
        }
        throw authErr;
      }
    } catch (error) {
      const msg = workosErrorMessage(error, "Sign up failed");
      if (/already|exists|duplicate/i.test(msg)) {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 }
        );
      }
      console.error("[signup workos]", error);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // Legacy local signup (no WorkOS)
  const db = getDb();

  const existing = await db.query.users.findFirst({
    where: eq(users.email, normalized),
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const baseSlug = (orgName || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  let slug = baseSlug || "org";
  let suffix = 1;
  while (true) {
    const existingOrg = await db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });
    if (!existingOrg) break;
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  const [org] = await db
    .insert(organizations)
    .values({
      name: orgName || `${name}'s Organization`,
      slug,
      plan: "free",
      onboardingSegment,
      creditsUsdCents: 0,
      welcomeCreditsUsdCents: 0,
      signupCreditGranted: false,
      metadata: { onboarding_checklist: {} },
    })
    .returning();

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      email: normalized,
      name,
      passwordHash,
      organizationId: org.id,
      role: "admin",
    })
    .returning();

  const token = await createToken({
    sub: user.id,
    userId: user.id,
    email: user.email,
    orgId: org.id,
    role: user.role,
    isSiteAdmin: false,
  });

  posthogServerCapture(req, user.id, "user_signed_up", {
    email: user.email,
    organization_id: org.id,
    onboarding_segment: onboardingSegment,
  });

  const response = NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name },
  });
  response.cookies.set("session", token, sessionCookieOptions());
  return response;
}
