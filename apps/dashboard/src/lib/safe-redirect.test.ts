import { describe, expect, test } from "bun:test";
import { httpAuthorizationUrl } from "./public-urls";
import { safeAppPath, safeReturnUrl } from "./safe-redirect";

describe("open redirect reject", () => {
  test("rejects absolute, protocol-relative, and AuthKit objects", () => {
    expect(safeAppPath("https://evil.example/phish")).toBe("/dashboard");
    expect(safeAppPath("//evil.example/phish")).toBe("/dashboard");
    expect(safeAppPath("/\\evil.example")).toBe("/dashboard");
    expect(safeAppPath("https://opendoor-gcp.web.app.evil.example/")).toBe("/dashboard");
    expect(safeAppPath("[object Object]")).toBe("/dashboard");
    expect(safeAppPath({ url: "https://evil.example", sealedState: "x" })).toBe("/dashboard");
    expect(safeAppPath("javascript:alert(1)")).toBe("/dashboard");
    expect(safeAppPath("/dashboard?next=https://evil.example")).toBe("/dashboard");
  });

  test("rejects encoded protocol-relative and control characters", () => {
    expect(safeAppPath("/%2Fevil.example")).toBe("/dashboard");
    expect(safeAppPath("/dashboard\u0000.evil")).toBe("/dashboard");
  });

  test("accepts same-app relative paths", () => {
    expect(safeAppPath("/dashboard")).toBe("/dashboard");
    expect(safeAppPath("/dashboard/billing?checkout=pro")).toBe("/dashboard/billing?checkout=pro");
    expect(safeAppPath("/onboarding?plan=enterprise")).toBe("/onboarding?plan=enterprise");
  });

  test("safeReturnUrl only allows allowlisted http(s) origins", () => {
    expect(safeReturnUrl("https://evil.example/ai/bot")).toBeNull();
    expect(safeReturnUrl("https://opendoor-gcp.web.app.evil.example/ai/bot")).toBeNull();
    expect(safeReturnUrl("//evil.example")).toBeNull();
    expect(safeReturnUrl("javascript:alert(1)")).toBeNull();
    expect(safeReturnUrl({ url: "https://evil.example" })).toBeNull();
    expect(safeReturnUrl("https://opendoor-gcp.web.app/ai/demo")).toBe(
      "https://opendoor-gcp.web.app/ai/demo",
    );
    expect(safeReturnUrl("http://localhost:3010/ai/demo")).toBe("http://localhost:3010/ai/demo");
    expect(safeReturnUrl("http://evil.example/ai/demo")).toBeNull();
  });

  test("httpAuthorizationUrl still rejects AuthKit objects as paths", () => {
    expect(httpAuthorizationUrl("[object Object]")).toBeNull();
    expect(httpAuthorizationUrl({ url: "/[object Object]" })).toBeNull();
    expect(httpAuthorizationUrl("https://api.workos.com/user_management/authorize")).toBe(
      "https://api.workos.com/user_management/authorize",
    );
  });
});
