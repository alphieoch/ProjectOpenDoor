import { NextRequest, NextResponse } from "next/server";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { httpAuthorizationUrl, resolveAppOrigin, workosRedirectUri } from "@/lib/public-urls";
import { loginErrorLocation } from "@/lib/workos-auth-errors";

export const GET = async (req: NextRequest) => {
  const origin = resolveAppOrigin(req);
  try {
    const signInUrl = await getSignInUrl({
      returnTo: "/dashboard",
      redirectUri: workosRedirectUri(req),
    });
    const url = httpAuthorizationUrl(signInUrl);
    if (!url) {
      return NextResponse.redirect(
        loginErrorLocation(origin, "invalid_authorization_url", "Hosted sign-in returned a non-http URL")
      );
    }
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("[workos sign-in]", error);
    return NextResponse.redirect(
      loginErrorLocation(origin, "workos_failed", "Could not start hosted AuthKit sign-in")
    );
  }
};
