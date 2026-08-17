import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { verifyPassword, createToken } from "@/lib/auth";
import { posthogServerCapture } from "@/lib/posthog-server";
import {
  authenticateWorkOSPassword,
  jsonAuthSuccess,
  workosErrorMessage,
} from "@/lib/workos-password-auth";
import { sessionCookieOptions } from "@/lib/workos-sync";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 }
    );
  }

  const normalized = String(email).toLowerCase().trim();

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
      });
      return jsonAuthSuccess(
        {
          success: true,
          user: { id: session.userId, email: user.email, orgId: session.orgId },
        },
        token
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
  });

  const response = NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email, orgId: user.organizationId },
  });
  response.cookies.set("session", token, sessionCookieOptions());
  return response;
}
