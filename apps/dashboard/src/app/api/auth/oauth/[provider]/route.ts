import { NextRequest, NextResponse } from "next/server";
import { sealData } from "iron-session";
import fnv1a from "@sindresorhus/fnv1a";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { getWorkOSClientId } from "@/lib/workos";
import { appBaseUrl, workosRedirectUri } from "@/lib/public-urls";

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
 * OpenDoor's UI (no hosted AuthKit screen). Lands on /callback → sync.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider: raw } = await ctx.params;
  const key = raw.toLowerCase() as ProviderKey;
  const appOrigin = appBaseUrl();

  if (!(key in PROVIDERS)) {
    return NextResponse.redirect(`${appOrigin}/login?error=oauth_provider`);
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
  const callback = workosRedirectUri();

  const statePayload = {
    nonce: crypto.randomUUID(),
    codeVerifier: pkce.codeVerifier,
    returnPathname: "/api/auth/workos/sync",
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

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(pkceCookieName(sealedState), sealedState, {
    httpOnly: true,
    secure: callback.startsWith("https:"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
