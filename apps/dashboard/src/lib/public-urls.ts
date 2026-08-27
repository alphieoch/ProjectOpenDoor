export function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010").replace(/\/$/, "");
}

/** Origins we may use as WorkOS redirect / post-login hosts. */
export const ALLOWED_AUTH_ORIGINS = [
  "http://localhost:3010",
  "http://127.0.0.1:3010",
  "https://opendoor-gcp.web.app",
  "https://opendoor-dashboard-u5ojp4qjiq-uc.a.run.app",
] as const;

export type AuthRequestLike = {
  headers: { get(name: string): string | null };
  nextUrl?: { origin: string; host?: string; protocol?: string };
};

export function isAllowedAuthOrigin(origin: string) {
  try {
    return (ALLOWED_AUTH_ORIGINS as readonly string[]).includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

/**
 * Prefer the browser-facing host (local or Firebase) when it is allowlisted so
 * one dashboard build can finish Google OAuth on localhost and prod.
 */
export function resolveAppOrigin(request?: AuthRequestLike) {
  const candidates: string[] = [];
  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || request.nextUrl?.host || "";
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto =
      forwardedProto ||
      request.nextUrl?.protocol?.replace(":", "") ||
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    if (host) candidates.push(`${proto}://${host}`);
    if (request.nextUrl?.origin) candidates.push(request.nextUrl.origin);
  }
  for (const raw of candidates) {
    try {
      const origin = new URL(raw).origin;
      if (isAllowedAuthOrigin(origin)) return origin;
    } catch {
      // ignore malformed hosts
    }
  }
  return appBaseUrl();
}

/** AuthKit / Google / GitHub OAuth callback. Must be allowlisted in WorkOS. */
export function workosRedirectUri(request?: AuthRequestLike) {
  if (request) return `${resolveAppOrigin(request)}/callback`;
  return (
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI || `${appBaseUrl()}/callback`
  );
}

/** Reject AuthKit `{ url, sealedState }` objects so we never redirect to `/[object Object]`. */
export function httpAuthorizationUrl(value: unknown): string | null {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (value && typeof value === "object" && "url" in value) {
    const url = (value as { url?: unknown }).url;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
  }
  return null;
}

/** Standalone SSO callback. Must be allowlisted in WorkOS separately from AuthKit. */
export function workosSsoCallbackUri() {
  return `${appBaseUrl()}/api/auth/sso/callback`;
}

export function gatewayBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:3001";
  return raw.replace(/\/$/, "");
}

/**
 * Server-side origin for gateway JSON (`/status`, `/v1`, …).
 * Prefer Cloud Run `GATEWAY_URL` so we never hit the dashboard marketing
 * page at the same public host (`/status` on Firebase Hosting).
 */
export function gatewayInternalUrl() {
  const internal = (
    process.env.GATEWAY_URL ||
    process.env.GATEWAY_INTERNAL_URL ||
    ""
  ).replace(/\/$/, "");
  if (internal) return internal;

  const pub = gatewayBaseUrl();
  const app = appBaseUrl();
  try {
    if (new URL(pub).host !== new URL(app).host) return pub;
  } catch {
    return pub;
  }
  return pub;
}

/** Same public host as the dashboard — `/status` is the Next.js page, not JSON. */
export function gatewayStatusCollidesWithApp(gatewayUrl: string) {
  try {
    return new URL(gatewayUrl).host === new URL(appBaseUrl()).host;
  } catch {
    return false;
  }
}

export function docsBaseUrl() {
  const app = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return app ? `${app}/docs` : "/docs";
}

export function docsHref(path = "/") {
  if (path.startsWith("/docs/") || path === "/docs") return path;
  const p = !path || path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/docs${p}`;
}
