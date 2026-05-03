import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users, organizations, creditTransactions } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { hashPassword, createToken } from "@/lib/auth";
import { posthogServerCapture } from "@/lib/posthog-server";
import { isOnboardingSegment, OnboardingSegment } from "@/lib/onboarding";

export async function POST(req: NextRequest) {
  const { email, password, name, orgName, segment } = await req.json();

  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "Email, password, and name are required" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const onboardingSegment: OnboardingSegment =
    isOnboardingSegment(segment) ? segment : "standard";

  const db = getDb();
  const signupCreditCents = Number.parseInt(
    process.env.SIGNUP_CREDIT_USD_CENTS || "2000",
    10
  );

  // Check if email already exists
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  // Generate org slug from name or orgName
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

  // Create organization
  const [org] = await db
    .insert(organizations)
    .values({
      name: orgName || `${name}'s Organization`,
      slug,
      plan: "free",
      onboardingSegment,
      creditsUsdCents: signupCreditCents,
      signupCreditGranted: true,
      metadata: {
        onboarding_checklist: {},
      },
    })
    .returning();

  await db.insert(creditTransactions).values({
    organizationId: org.id,
    kind: "signup",
    amountCents: signupCreditCents,
    balanceAfterCents: signupCreditCents,
    metadata: { source: "signup_bonus" },
  });

  // Hash password and create user
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      email,
      name,
      passwordHash,
      organizationId: org.id,
      role: "admin",
    })
    .returning();

  // Create session token
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

  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
