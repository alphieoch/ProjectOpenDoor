import { describe, expect, test } from "bun:test";
import { resolveGatewayCorsOrigin } from "./cors-origin.js";

describe("gateway CORS", () => {
  test("allows the dashboard and rejects arbitrary sites", () => {
    expect(resolveGatewayCorsOrigin("https://opendoor-gcp.web.app")).toBe(
      "https://opendoor-gcp.web.app",
    );
    expect(resolveGatewayCorsOrigin("http://localhost:3010")).toBe("http://localhost:3010");
    expect(resolveGatewayCorsOrigin("https://evil.example")).toBe("");
    expect(resolveGatewayCorsOrigin("*")).toBe("");
  });
});
