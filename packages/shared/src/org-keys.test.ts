import { describe, expect, test } from "bun:test";
import { SYSTEM_ASSISTANT_KEY_NAME } from "./plans";
import {
  BYOK_PROVIDER_SLUGS,
  apiKeyLimitMessage,
  apiKeyQuota,
  byokKeyPrefix,
  isByokProviderSlug,
  parseApiKeyCreateBody,
  parseByokCreateBody,
  publicApiKeyRow,
  publicByokRow,
  publicRecordHasSecret,
} from "./org-keys";

describe("BYOK provider slugs", () => {
  test("accepts openai and anthropic; rejects empty and unknown", () => {
    expect(isByokProviderSlug("openai")).toBe(true);
    expect(isByokProviderSlug("anthropic")).toBe(true);
    expect(isByokProviderSlug("together")).toBe(true);
    expect(isByokProviderSlug("not-a-provider")).toBe(false);
    expect(isByokProviderSlug("")).toBe(false);
    expect(BYOK_PROVIDER_SLUGS).toContain("openai");
  });
});

describe("BYOK prefix never stores the full secret", () => {
  test("masks long and short secrets", () => {
    expect(byokKeyPrefix("sk-proj-abcdefghijklmnopqrstuvwxyz")).toBe("sk-p…wxyz");
    expect(byokKeyPrefix("abcd1234")).toBe("ab••••");
    expect(byokKeyPrefix("  sk-ant-secret-key  ")).not.toContain("secret-key");
  });
});

describe("public key rows", () => {
  test("API key list shape omits the hash", () => {
    const row = publicApiKeyRow({
      id: "k1",
      name: "Production",
      keyPrefix: "opd_abc123def456",
      allowedModels: ["gpt-4o"],
      createdAt: "2026-01-01",
      lastUsedAt: null,
    });
    expect(row).toEqual({
      id: "k1",
      name: "Production",
      keyPrefix: "opd_abc123def456",
      allowedModels: ["gpt-4o"],
      createdAt: "2026-01-01",
      lastUsedAt: null,
    });
    expect(publicRecordHasSecret({ ...row, keyHash: "deadbeef".repeat(8) })).toBe(true);
    expect(publicRecordHasSecret(row as unknown as Record<string, unknown>)).toBe(false);
  });

  test("BYOK list shape drops ciphertext fields", () => {
    const row = publicByokRow({
      id: "b1",
      providerSlug: "openai",
      label: "Prod",
      keyPrefix: "sk-p…wxyz",
      alwaysUse: true,
      createdAt: "2026-01-01",
      lastUsedAt: null,
    });
    expect(row.keyPrefix).toBe("sk-p…wxyz");
    expect(row).not.toHaveProperty("keyCiphertext");
    expect(row).not.toHaveProperty("apiKey");
    expect(publicRecordHasSecret({ ...row, keyCiphertext: "base64-cipher-value" })).toBe(true);
  });
});

describe("plan maxApiKeys", () => {
  test("getPlan limits are enforced by quota", () => {
    expect(apiKeyQuota(0, "free")).toMatchObject({ max: 3, remaining: 3, atLimit: false, planName: "Starter Free" });
    expect(apiKeyQuota(3, "starter")).toMatchObject({ max: 3, remaining: 0, atLimit: true });
    expect(apiKeyQuota(10, "pro")).toMatchObject({ max: 10, atLimit: true });
    expect(apiKeyQuota(9, "pro")).toMatchObject({ remaining: 1, atLimit: false });
    expect(apiKeyQuota(0, "not-a-plan").max).toBe(3);
    expect(apiKeyLimitMessage("Pro Studio", 10)).toBe("Pro Studio includes 10 API keys. Upgrade to add more.");
  });
});

describe("create body parsers", () => {
  test("API key name is required and cannot be the system assistant name", () => {
    expect(parseApiKeyCreateBody({}).ok).toBe(false);
    expect(parseApiKeyCreateBody({ name: "   " }).ok).toBe(false);
    expect(parseApiKeyCreateBody({ name: SYSTEM_ASSISTANT_KEY_NAME }).ok).toBe(false);
    expect(parseApiKeyCreateBody({ name: " Production ", allowedModels: ["a", ""] })).toEqual({
      ok: true,
      name: "Production",
      allowedModels: ["a"],
    });
  });

  test("BYOK accepts apiKey or secret and never treats a short string as valid", () => {
    expect(parseByokCreateBody({ providerSlug: "openai", apiKey: "short" }).ok).toBe(false);
    expect(parseByokCreateBody({ provider: "openai", secret: "sk-live-abcdef" })).toEqual({
      ok: true,
      providerSlug: "openai",
      apiKey: "sk-live-abcdef",
      label: null,
      alwaysUse: false,
    });
    expect(parseByokCreateBody({ providerSlug: "nope", apiKey: "sk-live-abcdef" }).ok).toBe(false);
  });
});
