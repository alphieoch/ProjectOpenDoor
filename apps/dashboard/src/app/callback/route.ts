import { NextRequest, NextResponse } from "next/server";
import { unsealData } from "iron-session";
import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { getWorkOSClientId } from "@/lib/workos";
import { applySessionCookies } from "@/lib/session-cookie";
import { syncWorkOSUserToSession } from "@/lib/workos-sync";
import { resolveAppOrigin } from "@/lib/public-urls";
import {
  AUTH_ERROR_MESSAGES,
  loginErrorLocation,
  workosFailureCode,
  workosFailureDetail,
} from "@/lib/workos-auth-errors";

type PkceState = {
  nonce?: string;
  codeVerifier?: string;
  returnPathname?: string;
};

/**
 * WorkOS OAuth callback (Google / GitHub / hosted AuthKit).
 *
 * AuthKit's handleAuth() requires a PKCE cookie that Firebase Hosting → Cloud Run
 * often drops on the return from Google. The sealed verifier is already in the
 * `state` query param, so we unseal that and finish the code exchange here.
 *
 * OpenDoor's dashboard session is minted on this same response. We do not send
 * the browser through `/api/auth/workos/sync` + withAuth(), which fails when
 * the AuthKit `wos-session` cookie is missing.
 */
export async function GET(req: NextRequest) {
  const origin = resolveAppOrigin(req);
  const oauthError = req.nextUrl.searchParams.get("error");
  const oauthErrorDescription = req.nextUrl.searchParams.get("error_description");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const password = process.env.WORKOS_COOKIE_PASSWORD;

  if (oauthError) {
    const mapped =
      oauthError === "access_denied" ? "access_denied" : workosFailureCode({ code: oauthError });
    return NextResponse.redirect(
      loginErrorLocation(origin, mapped, oauthErrorDescription || oauthError)
    );
  }

  if (!code || !state || !password) {
    return NextResponse.redirect(
      loginErrorLocation(origin, "missing_auth_params", "Missing code, state, or cookie password")
    );
  }

  try {
    const pkce = await unsealData<PkceState>(state, { password });
    if (!pkce?.codeVerifier) {
      console.error("[workos callback] state unsealed but codeVerifier missing");
      return NextResponse.redirect(
        loginErrorLocation(origin, "missing_pkce_cookie", "PKCE verifier missing from state")
      );
    }

    const auth = await getWorkOS().userManagement.authenticateWithCode({
      clientId: getWorkOSClientId(),
      code,
      codeVerifier: pkce.codeVerifier,
    });

    if (!auth.user?.email) {
      return NextResponse.redirect(
        loginErrorLocation(origin, "missing_email", "WorkOS user has no email")
      );
    }

    try {
      await saveSession(auth, req);
    } catch (sessionError) {
      console.error("[workos callback] saveSession", sessionError);
    }

    const { token, isNew } = await syncWorkOSUserToSession({
      id: auth.user.id,
      email: auth.user.email,
      firstName: auth.user.firstName,
      lastName: auth.user.lastName,
    });

    const dest = isNew ? `${origin}/dashboard/onboarding` : `${origin}/dashboard`;
    const response = NextResponse.redirect(dest);
    response.headers.set("Cache-Control", "private");
    applySessionCookies(response, token, 60 * 60 * 24 * 7, origin.startsWith("https:"));
    return response;
  } catch (error) {
    const codeName = workosFailureCode(error);
    const detail = workosFailureDetail(error);
    console.error("[workos callback]", codeName, detail);
    const mapped = AUTH_ERROR_MESSAGES[codeName] ? codeName : "workos_failed";
    return NextResponse.redirect(loginErrorLocation(origin, mapped, detail || codeName));
  }
}
