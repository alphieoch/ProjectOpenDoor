import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  sessionCookieOptions,
  syncWorkOSUserToSession,
} from "@/lib/workos-sync";

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010").replace(
    /\/$/,
    ""
  );
}

export async function GET() {
  try {
    const { user } = await withAuth();
    if (!user?.email) {
      return NextResponse.redirect(`${appOrigin()}/login?error=workos_failed`);
    }

    const { token, isNew } = await syncWorkOSUserToSession({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    const dest = isNew
      ? `${appOrigin()}/dashboard/onboarding`
      : `${appOrigin()}/dashboard`;
    const response = NextResponse.redirect(dest);
    response.cookies.set("session", token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("[workos sync]", error);
    return NextResponse.redirect(
      `${appOrigin()}/login?error=workos_sync_failed`
    );
  }
}
