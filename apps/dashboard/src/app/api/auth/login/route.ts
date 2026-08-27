import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations, users } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { verifyPassword, createToken } from "@/lib/auth";
import { posthogServerCapture } from "@/lib/posthog-server";
import {
  authenticateWorkOSPassword,
  jsonAuthSuccess,
  workosErrorMessage,
} from "@/lib/workos-password-auth";
import { applySessionCookies, cookieSecureFromRequest } from "@/lib/session-cookie";
import { enforceAuthRateLimit } from "@/lib/auth-rate-limit";
import {
  applySignupIntentCookies,
  clearSignupIntentCookies,
  postAuthPathForWorkspace,
  resolveSignupIntentFromRequest,
  type SignupIntent,
} from "@/lib/signup-plan";
import { applyWorldCookies } from "@/lib/i18n/cookies";
import { persistWorldToWorkspace, worldPreferenceFromRequest } from "@/lib/i18n/persist";

async function loginRedirect(orgId: string, intent: SignupIntent, isNew: boolean) {
  try {
    const org = await getDb().query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        plan: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
      },
    });
    return postAuthPathForWorkspace({ plan: intent.plan, isNew, org });
  } catch {
    return postAuthPathForWorkspace({
      plan: intent.plan,
      isNew,
      orgLookupFailed: true,
    });
  }
}

function withSignupCookies(
  response: NextResponse,
  intent: SignupIntent,
  redirectTo: string,
  world?: ReturnType<typeof worldPreferenceFromRequest>
) {
  if (intent.plan && redirectTo.includes("checkout=")) {
    applySignupIntentCookies(response, intent);
  } else {
    clearSignupIntentCookies(response);
  }
  if (world) applyWorldCookies(response, world);
  return response;
}

export async function POST(req: NextRequest) {
  const { email, password, plan, segment, locale, region, country } = await req.json();
  const intent = resolveSignupIntentFromRequest(req, { plan, segment });
  const world = worldPreferenceFromRequest(req, { locale, region, country });

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 }
    );
  }

  const normalized = String(email).toLowerCase().trim();
  const limited = enforceAuthRateLimit("login", req, normalized);
  if (limited) return limited;

  // Prefer WorkOS User Management when configured (custom UI, no hosted AuthKit).
  if (process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID) {
    try {
      const { token, session, user } = await authenticateWorkOSPassword(
        req,
        normalized,
        password
      );
      posthogServerCapture(req, session.userId, "user_signed_in", {
        email: session.email,
        organization_id: session.orgId,
        auth_method: "workos_password",
        signup_plan: intent.plan,
      });
      const redirectTo = await loginRedirect(session.orgId, intent, false);
      if (world.locale !== "en" || world.region) {
        await persistWorldToWorkspace({
          userId: session.userId,
          orgId: session.orgId,
          preference: world,
        });
      }
      return withSignupCookies(
        jsonAuthSuccess(
          {
            success: true,
            user: { id: session.userId, email: user.email, orgId: session.orgId },
          },
          token,
          redirectTo,
          req
        ),
        intent,
        redirectTo,
        world
      );
    } catch (error) {
      // Fall through to local password hash for legacy accounts.
      const msg = workosErrorMessage(error, "");
      if (msg.includes("verify your account")) {
        return NextResponse.json({ error: msg }, { status: 403 });
      }
    }
  }

  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.email, normalized),
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const token = await createToken({
    sub: user.id,
    userId: user.id,
    email: user.email,
    orgId: user.organizationId,
    role: user.role,
    isSiteAdmin: user.isSiteAdmin ?? false,
  });

  posthogServerCapture(req, user.id, "user_signed_in", {
    email: user.email,
    organization_id: user.organizationId,
    auth_method: "password",
    signup_plan: intent.plan,
  });

  const redirectTo = await loginRedirect(user.organizationId, intent, false);
  const response = NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email, orgId: user.organizationId },
    redirectTo,
  });
  applySessionCookies(response, token, 60 * 60 * 24 * 7, cookieSecureFromRequest(req));
  if (world.locale !== "en" || world.region) {
    await persistWorldToWorkspace({
      userId: user.id,
      orgId: user.organizationId,
      preference: world,
    });
  }
  return withSignupCookies(response, intent, redirectTo, world);
}
