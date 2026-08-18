export function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010").replace(/\/$/, "");
}

/** AuthKit / Google / GitHub OAuth callback. Must be allowlisted in WorkOS. */
export function workosRedirectUri() {
  return (
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI || `${appBaseUrl()}/callback`
  );
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
