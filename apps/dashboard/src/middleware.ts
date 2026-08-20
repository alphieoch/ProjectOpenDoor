import { NextRequest, NextResponse } from "next/server";
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import { LOCALE_COOKIE, persistWorldPreference, resolveLocale } from "@opendoor/shared";
import { applyWorldCookies } from "@/lib/i18n/cookies";
import { enforceCsrf } from "@/lib/csrf";
import { workosRedirectUri } from "@/lib/public-urls";
import { applySecurityHeaders } from "@/lib/security-headers";
import { cookieSecureFromRequest } from "@/lib/session-cookie";

// WorkOS reads `process.env[name]` dynamically, which Next's Edge compiler
// does not inline. Reference the keys here so the middleware bundle gets them.
void process.env.WORKOS_API_KEY;
void process.env.WORKOS_CLIENT_ID;
void process.env.WORKOS_COOKIE_PASSWORD;
void process.env.WORKOS_COOKIE_NAME;
void process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;

const workos = authkitMiddleware({
  redirectUri: workosRedirectUri(),
  middlewareAuth: {
    enabled: false,
    unauthenticatedPaths: [
      "/",
      "/login",
      "/sign-in",
      "/sign-up",
      "/callback",
      "/platform",
      "/pricing",
      "/how-it-works",
      "/sdk",
      "/rankings",
      "/security",
      "/status",
      "/terms",
      "/privacy",
      "/docs",
      "/docs/:path*",
      "/get-started",
      "/signup",
    ],
  },
});

function attachWorld(request: NextRequest, response: NextResponse) {
  const queryLang =
    request.nextUrl.searchParams.get("lang") ?? request.nextUrl.searchParams.get("locale");
  const locale = resolveLocale({
    query: queryLang,
    cookie: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  try {
    response.headers.set("x-od-locale", locale);
    const preference = persistWorldPreference({
      locale,
      region: request.cookies.get("od_region")?.value,
      country: request.cookies.get("od_country")?.value,
    });
    if (queryLang || !request.cookies.get(LOCALE_COOKIE)?.value) {
      applyWorldCookies(response, preference, cookieSecureFromRequest(request));
    }
  } catch (err) {
    console.error("[world] locale cookie", err);
  }
  return response;
}

export default async function middleware(request: NextRequest) {
  const queryLang =
    request.nextUrl.searchParams.get("lang") ?? request.nextUrl.searchParams.get("locale");
  const locale = resolveLocale({
    query: queryLang,
    cookie: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-od-locale", locale);
  const stamped = new NextRequest(request, { headers: requestHeaders });

  const blocked = enforceCsrf(stamped);
  if (blocked) return applySecurityHeaders(blocked, stamped);

  try {
    const raw = await workos(stamped);
    const response = raw instanceof NextResponse ? raw : NextResponse.next({ request: { headers: requestHeaders } });
    return applySecurityHeaders(attachWorld(stamped, response), stamped);
  } catch (err) {
    console.error("WorkOS middleware failed; continuing without session refresh.", err);
    return applySecurityHeaders(attachWorld(stamped, NextResponse.next({ request: { headers: requestHeaders } })), stamped);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|ingest|api/status).*)",
  ],
};
