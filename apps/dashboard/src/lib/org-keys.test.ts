import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import {
  hashOpenDoorApiKey,
  isOpenDoorApiKeySecret,
  mintOpenDoorApiKey,
} from "./org-keys";

describe("mint OpenDoor API key", () => {
  test("secret is shown-once format: opd_ + 64 hex, prefix is first 16, hash is SHA-256", () => {
    const minted = mintOpenDoorApiKey();
    expect(isOpenDoorApiKeySecret(minted.rawKey)).toBe(true);
    expect(minted.keyPrefix).toBe(minted.rawKey.slice(0, 16));
    expect(minted.keyPrefix).toHaveLength(16);
    expect(minted.keyPrefix.startsWith("opd_")).toBe(true);
    expect(minted.keyHash).toBe(createHash("sha256").update(minted.rawKey).digest("hex"));
    expect(minted.keyHash).toBe(hashOpenDoorApiKey(minted.rawKey));
    expect(minted.rawKey.includes(minted.keyHash)).toBe(false);
  });

  test("two mints are unique", () => {
    const a = mintOpenDoorApiKey();
    const b = mintOpenDoorApiKey();
    expect(a.rawKey).not.toBe(b.rawKey);
    expect(a.keyPrefix).not.toBe(b.keyPrefix);
  });
});
