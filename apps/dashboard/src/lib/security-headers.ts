/**
 * Production response headers. Applied in Next middleware so every
 * Hosting → Cloud Run HTML/API response gets them (Cloud Armor is the edge WAF).
 * No country / geo rules — Africa must stay reachable.
 */

const POSTHOG_CONNECT = [
  "https://us.i.posthog.com",
  "https://eu.i.posthog.com",
  "https://us-assets.i.posthog.com",
  "https://eu-assets.i.posthog.com",
  "https://*.posthog.com",
].join(" ");

export function contentSecurityPolicy(opts?: { gatewayOrigin?: string }) {
  const extraConnect = opts?.gatewayOrigin && !opts.gatewayOrigin.includes("localhost")
    ? opts.gatewayOrigin
    : "";
  const connect = ["'self'", POSTHOG_CONNECT, "https://api.stripe.com", "https://api.workos.com", extraConnect]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://us.i.posthog.com https://eu.i.posthog.com https://us-assets.i.posthog.com https://eu-assets.i.posthog.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://images.unsplash.com https://*.googleusercontent.com https://*.posthog.com",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "frame-src https://js.stripe.com https://hooks.stripe.com https://*.workos.com",
    "worker-src 'self' blob:",
  ].join("; ");
}

export type SecurityHeaderRequest = {
  headers: { get(name: string): string | null };
};

export function requestIsHttps(request?: SecurityHeaderRequest) {
  if (!request) return process.env.NODE_ENV === "production";
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return process.env.NODE_ENV === "production";
}

export function securityHeaders(request?: SecurityHeaderRequest): Record<string, string> {
  const https = requestIsHttps(request);
  const gateway = (process.env.NEXT_PUBLIC_GATEWAY_URL || "").replace(/\/$/, "");
  let gatewayOrigin = "";
  try {
    if (gateway) gatewayOrigin = new URL(gateway).origin;
  } catch {
    gatewayOrigin = "";
  }

  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy({ gatewayOrigin }),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "X-Permitted-Cross-Domain-Policies": "none",
  };
  if (https) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

export function applySecurityHeaders<T extends { headers: { set(name: string, value: string): unknown } }>(
  response: T,
  request?: SecurityHeaderRequest,
) {
  for (const [name, value] of Object.entries(securityHeaders(request))) {
    response.headers.set(name, value);
  }
  return response;
}
