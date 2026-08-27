import { NextResponse, type NextRequest } from "next/server";
import { ALLOWED_AUTH_ORIGINS, isAllowedAuthOrigin } from "@/lib/public-urls";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Cookie-authenticated mutations. Stripe / workflow secrets and OAuth
 * redirects are not browser CSRF.
 */
const EXEMPT_PREFIXES = [
  "/api/webhooks/",
  "/api/public/workflows/",
  "/api/auth/oauth/",
  "/api/auth/sso",
  "/api/auth/sso/callback",
];

export function csrfExemptPath(pathname: string) {
  return EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function originFromReferer(referer: string | null) {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function requestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwardedProto ||
    request.nextUrl.protocol.replace(":", "") ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  if (!host) return null;
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

export function isAllowedMutationOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const refererOrigin = originFromReferer(request.headers.get("referer"));
  const self = requestOrigin(request);
  const site = request.headers.get("sec-fetch-site");

  if (site === "same-origin" || site === "same-site" || site === "none") return true;
  if (site === "cross-site") return false;

  const candidate = origin || refererOrigin;
  if (!candidate) {
    // curl / server-to-server: no Origin. Browser POSTs send Origin.
    return true;
  }
  if (self && candidate === self) return true;
  if (isAllowedAuthOrigin(candidate)) return true;
  return (ALLOWED_AUTH_ORIGINS as readonly string[]).includes(candidate);
}

export function enforceCsrf(request: NextRequest): NextResponse | null {
  if (!MUTATING.has(request.method.toUpperCase())) return null;
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/api/")) return null;
  if (csrfExemptPath(path)) return null;
  if (isAllowedMutationOrigin(request)) return null;
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
