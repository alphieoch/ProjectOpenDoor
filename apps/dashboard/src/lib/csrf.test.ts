import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { csrfExemptPath, enforceCsrf, isAllowedMutationOrigin } from "./csrf";

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init);
}

describe("CSRF origin check", () => {
  test("exempts Stripe webhooks and secret workflow hooks", () => {
    expect(csrfExemptPath("/api/webhooks/stripe")).toBe(true);
    expect(csrfExemptPath("/api/public/workflows/abc/hook")).toBe(true);
    expect(csrfExemptPath("/api/tools/search")).toBe(false);
  });

  test("allows same-origin dashboard POSTs and rejects cross-site", () => {
    const ok = req("https://opendoor-gcp.web.app/api/tools/search", {
      method: "POST",
      headers: { origin: "https://opendoor-gcp.web.app" },
    });
    expect(isAllowedMutationOrigin(ok)).toBe(true);
    expect(enforceCsrf(ok)).toBeNull();

    const evil = req("https://opendoor-gcp.web.app/api/tools/search", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
    });
    expect(enforceCsrf(evil)?.status).toBe(403);
  });

  test("does not block GET or login-less cookie reads", () => {
    const get = req("https://opendoor-gcp.web.app/dashboard");
    expect(enforceCsrf(get)).toBeNull();
  });
});
