import { createHash, randomBytes } from "crypto";

export {
  API_KEY_NAME_MAX,
  BYOK_PROVIDER_SLUGS,
  BYOK_SECRET_MIN,
  apiKeyLimitMessage,
  apiKeyQuota,
  byokKeyPrefix,
  isByokProviderSlug,
  parseApiKeyCreateBody,
  parseByokCreateBody,
  publicApiKeyRow,
  publicByokRow,
  type ApiKeyQuota,
  type PublicApiKey,
  type PublicByokKey,
} from "@opendoor/shared";

export type MintedOpenDoorApiKey = {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
};

/** Dashboard + gateway share this format: `opd_` + 64 hex, SHA-256 hash, first 16 chars as prefix. */
export function mintOpenDoorApiKey(): MintedOpenDoorApiKey {
  const rawKey = `opd_${randomBytes(32).toString("hex")}`;
  return {
    rawKey,
    keyPrefix: rawKey.slice(0, 16),
    keyHash: createHash("sha256").update(rawKey).digest("hex"),
  };
}

export function hashOpenDoorApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function isOpenDoorApiKeySecret(value: string): boolean {
  return /^opd_[a-f0-9]{64}$/.test(value);
}
