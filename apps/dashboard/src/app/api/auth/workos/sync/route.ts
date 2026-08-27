import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { applySessionCookies } from "@/lib/session-cookie";
import { syncWorkOSUserToSession } from "@/lib/workos-sync";
import { resolveAppOrigin } from "@/lib/public-urls";
import { loginErrorLocation, workosFailureDetail } from "@/lib/workos-auth-errors";

/**
 * Fallback for hosted AuthKit flows that still land here. Google / GitHub
 * buttons now mint the OpenDoor session in `/callback`.
 */
export async function GET(req: NextRequest) {
  const origin = resolveAppOrigin(req);
  try {
    const { user } = await withAuth();
    if (!user?.email) {
      return NextResponse.redirect(
        loginErrorLocation(
          origin,
          "workos_failed",
          "AuthKit session missing after callback (wos-session cookie)"
        )
      );
    }

    const { token, isNew } = await syncWorkOSUserToSession({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    const dest = isNew
      ? `${origin}/dashboard/onboarding`
      : `${origin}/dashboard`;
    const response = NextResponse.redirect(dest);
    response.headers.set("Cache-Control", "private");
    applySessionCookies(response, token, 60 * 60 * 24 * 7, origin.startsWith("https:"));
    return response;
  } catch (error) {
    console.error("[workos sync]", error);
    return NextResponse.redirect(
      loginErrorLocation(origin, "workos_sync_failed", workosFailureDetail(error))
    );
  }
}
