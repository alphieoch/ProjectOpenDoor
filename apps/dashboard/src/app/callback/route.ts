import { NextRequest, NextResponse } from "next/server";
import { unsealData } from "iron-session";
import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { getWorkOSClientId } from "@/lib/workos";
import { appBaseUrl } from "@/lib/public-urls";

function appOrigin() {
  return appBaseUrl();
}

type PkceState = {
  nonce?: string;
  codeVerifier?: string;
  returnPathname?: string;
};

/**
 * WorkOS OAuth callback.
 *
 * AuthKit's handleAuth() requires a PKCE cookie that Firebase Hosting → Cloud Run
 * often drops on the return from Google. The sealed verifier is already in the
 * `state` query param, so we unseal that and finish the code exchange here.
 */
export async function GET(req: NextRequest) {
  const origin = appOrigin();
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const password = process.env.WORKOS_COOKIE_PASSWORD;

  if (!code || !state || !password) {
    return NextResponse.redirect(`${origin}/login?error=missing_auth_params`);
  }

  try {
    const pkce = await unsealData<PkceState>(state, { password });
    if (!pkce?.codeVerifier) {
      console.error("[workos callback] state unsealed but codeVerifier missing");
      return NextResponse.redirect(`${origin}/login?error=missing_pkce_cookie`);
    }

    const auth = await getWorkOS().userManagement.authenticateWithCode({
      clientId: getWorkOSClientId(),
      code,
      codeVerifier: pkce.codeVerifier,
    });

    await saveSession(auth, req);

    const dest = pkce.returnPathname || "/api/auth/workos/sync";
    return NextResponse.redirect(new URL(dest, origin).toString());
  } catch (error) {
    console.error("[workos callback]", error);
    return NextResponse.redirect(`${origin}/login?error=workos_failed`);
  }
}
