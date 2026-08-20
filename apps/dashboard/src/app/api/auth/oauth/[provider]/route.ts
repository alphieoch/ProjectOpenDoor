import { NextRequest, NextResponse } from "next/server";
import { sealData } from "iron-session";
import fnv1a from "@sindresorhus/fnv1a";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { getWorkOSClientId } from "@/lib/workos";
import {
  httpAuthorizationUrl,
  resolveAppOrigin,
  workosRedirectUri,
} from "@/lib/public-urls";
import { loginErrorLocation } from "@/lib/workos-auth-errors";

const PROVIDERS = {
  google: "GoogleOAuth",
  github: "GitHubOAuth",
} as const;

type ProviderKey = keyof typeof PROVIDERS;

/** Must match @workos-inc/authkit-nextjs `getPKCECookieNameForState`. */
function pkceCookieName(sealedState: string) {
  const hash = Number(fnv1a(sealedState, { size: 32 }));
  return `wos-auth-verifier-${hash.toString(16).padStart(8, "0")}`;
}

/**
 * Start Google / GitHub OAuth against WorkOS User Management while staying on
 * OpenDoor's UI (no hosted AuthKit screen). Lands on /callback which mints the
 * OpenDoor session cookie.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider: raw } = await ctx.params;
  const key = raw.toLowerCase() as ProviderKey;
  const appOrigin = resolveAppOrigin(req);

  if (!(key in PROVIDERS)) {
    return NextResponse.redirect(loginErrorLocation(appOrigin, "oauth_provider"));
  }

  const cookiePassword = process.env.WORKOS_COOKIE_PASSWORD;
  if (!cookiePassword || cookiePassword.length < 32) {
    return NextResponse.json(
      { error: "WORKOS_COOKIE_PASSWORD is not configured" },
      { status: 500 }
    );
  }

  const workos = getWorkOS();
  const clientId = getWorkOSClientId();
  const pkce = await workos.pkce.generate();
  const callback = workosRedirectUri(req);

  const statePayload = {
    nonce: crypto.randomUUID(),
    codeVerifier: pkce.codeVerifier,
    returnPathname: "/dashboard",
  };
  const sealedState = await sealData(statePayload, {
    password: cookiePassword,
    ttl: 600,
  });

  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    provider: PROVIDERS[key],
    clientId,
    redirectUri: callback,
    state: sealedState,
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: pkce.codeChallengeMethod,
  });
  const url = httpAuthorizationUrl(authorizationUrl);
  if (!url) {
    return NextResponse.redirect(
      loginErrorLocation(appOrigin, "invalid_authorization_url", "OAuth start returned a non-http URL")
    );
  }

  const response = NextResponse.redirect(url);
  response.cookies.set(pkceCookieName(sealedState), sealedState, {
    httpOnly: true,
    secure: callback.startsWith("https:"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
