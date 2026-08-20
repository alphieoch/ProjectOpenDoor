import { describe, expect, test } from "bun:test";
import { asUuid } from "./provider-id.js";

describe("asUuid", () => {
  test("never treats a provider slug as providerId", () => {
    expect(asUuid("together")).toBeNull();
    expect(asUuid("openai")).toBeNull();
    expect(asUuid("vertex")).toBeNull();
    expect(asUuid(null)).toBeNull();
    expect(asUuid(undefined)).toBeNull();
  });

  test("accepts a UUID", () => {
    expect(asUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000"
    );
  });
});
