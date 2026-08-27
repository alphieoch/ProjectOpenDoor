import { describe, expect, test } from "bun:test";
import { applySecurityHeaders, contentSecurityPolicy, securityHeaders } from "./security-headers";

describe("security headers helper", () => {
  test("sets CSP, XFO, and nosniff", () => {
    const headers = securityHeaders({
      headers: { get: (name) => (name === "x-forwarded-proto" ? "https" : null) },
    });
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
  });

  test("omits HSTS on http localhost so cookies still work", () => {
    const headers = securityHeaders({
      headers: { get: (name) => (name === "x-forwarded-proto" ? "http" : null) },
    });
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  test("CSP does not geo-block and allows first-party + analytics", () => {
    const csp = contentSecurityPolicy();
    expect(csp.toLowerCase()).not.toMatch(/geo|country|africa|region_code/);
    expect(csp).toContain("connect-src");
    expect(csp).toContain("'self'");
  });

  test("applySecurityHeaders writes onto a response-like object", () => {
    const set: Record<string, string> = {};
    applySecurityHeaders({
      headers: {
        set(name, value) {
          set[name] = value;
        },
      },
    });
    expect(set["X-Frame-Options"]).toBe("DENY");
    expect(set["X-Content-Type-Options"]).toBe("nosniff");
  });
});
