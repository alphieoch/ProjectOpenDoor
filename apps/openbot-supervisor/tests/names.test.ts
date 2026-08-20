import { describe, expect, test } from "bun:test";
import { namesFor } from "../src/names";

describe("namesFor", () => {
  test("accepts a uuid-shaped agent id", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const parsed = namesFor(id);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.names.container).toContain(id);
      expect(parsed.names.workspaceVolume).toContain(id);
      expect(parsed.names.profileVolume).toContain(id);
    }
  });

  test("rejects path traversal and punctuation", () => {
    expect(namesFor("../etc").ok).toBe(false);
    expect(namesFor("bot.prod").ok).toBe(false);
    expect(namesFor("bot:latest").ok).toBe(false);
    expect(namesFor("").ok).toBe(false);
  });
});
