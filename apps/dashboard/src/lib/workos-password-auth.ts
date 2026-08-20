import { NextRequest, NextResponse } from "next/server";
import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { applySessionCookies, cookieSecureFromRequest } from "@/lib/session-cookie";
import { syncWorkOSUserToSession } from "@/lib/workos-sync";
import { getWorkOSClientId } from "@/lib/workos";

function workosErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const e = error as {
    message?: string;
    rawData?: {
      code?: string;
      message?: string;
      error_description?: string;
      error?: { message?: string; description?: string };
    };
    code?: string;
  };
  const nested = e.rawData?.error;
  const code = e.rawData?.code || e.code;
  if (code === "email_verification_required") {
    return "Check your email to verify your account, then sign in.";
  }
  if (code === "invalid_credentials") {
    return "Invalid email or password.";
  }
  return (
    nested?.description ||
    nested?.message ||
    e.rawData?.message ||
    e.rawData?.error_description ||
    e.message ||
    fallback
  );
}

/**
 * Authenticate via WorkOS User Management (password), seal AuthKit session,
 * and mint the OpenDoor dashboard JWT used by getSession().
 */
export async function authenticateWorkOSPassword(
  req: NextRequest,
  email: string,
  password: string
) {
  const workos = getWorkOS();
  const clientId = getWorkOSClientId();
  const authResponse = await workos.userManagement.authenticateWithPassword({
    clientId,
    email,
    password,
  });

  await saveSession(authResponse, req);

  const { token, session, isNew } = await syncWorkOSUserToSession({
    id: authResponse.user.id,
    email: authResponse.user.email,
    firstName: authResponse.user.firstName,
    lastName: authResponse.user.lastName,
  });

  return { token, session, isNew, user: authResponse.user };
}

export async function createWorkOSUser(opts: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}) {
  const workos = getWorkOS();
  const [firstName, ...rest] = (opts.firstName || "").trim().split(/\s+/);
  const lastName = opts.lastName || rest.join(" ") || undefined;

  return workos.userManagement.createUser({
    email: opts.email,
    password: opts.password,
    firstName: firstName || undefined,
    lastName,
    emailVerified: false,
  });
}

export function jsonAuthSuccess(
  body: Record<string, unknown>,
  token: string,
  redirectTo?: string,
  req?: NextRequest
) {
  const response = NextResponse.json({ ...body, redirectTo });
  applySessionCookies(response, token, 60 * 60 * 24 * 7, cookieSecureFromRequest(req));
  return response;
}

export { workosErrorMessage };
