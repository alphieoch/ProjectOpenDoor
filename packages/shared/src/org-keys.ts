import { SYSTEM_ASSISTANT_KEY_NAME, getPlan } from "./plans.js";

/** Upstream providers the gateway can instantiate from `organization_provider_keys`. */
export const BYOK_PROVIDER_SLUGS = [
  "vertex",
  "together",
  "openai",
  "anthropic",
  "google",
  "cohere",
  "mistral",
  "deepseek",
  "qwen",
  "groq",
  "xai",
  "azure-foundry",
  "cerebras",
  "perplexity",
] as const;

export type ByokProviderSlug = (typeof BYOK_PROVIDER_SLUGS)[number];

export const API_KEY_NAME_MAX = 80;
export const BYOK_SECRET_MIN = 8;

export type PublicApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  allowedModels: string[] | null;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
};

export type PublicByokKey = {
  id: string;
  providerSlug: string;
  label: string | null;
  keyPrefix: string;
  alwaysUse: boolean;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
};

export type ApiKeyQuota = {
  used: number;
  max: number;
  remaining: number;
  atLimit: boolean;
  planId: string;
  planName: string;
};

export type ParsedApiKeyCreate =
  | { ok: true; name: string; allowedModels: string[] | null }
  | { ok: false; error: string; status: 400 };

export type ParsedByokCreate =
  | {
      ok: true;
      providerSlug: ByokProviderSlug;
      apiKey: string;
      label: string | null;
      alwaysUse: boolean;
    }
  | { ok: false; error: string; status: 400 };

export function isByokProviderSlug(value: unknown): value is ByokProviderSlug {
  return typeof value === "string" && (BYOK_PROVIDER_SLUGS as readonly string[]).includes(value);
}

/** Masked hint stored and shown after save. Never the full secret. */
export function byokKeyPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}••••`;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function publicApiKeyRow(row: {
  id: string;
  name: string;
  keyPrefix: string;
  allowedModels?: unknown;
  createdAt: Date | string;
  lastUsedAt?: Date | string | null;
}): PublicApiKey {
  const allowed = Array.isArray(row.allowedModels)
    ? row.allowedModels.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : null;
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    allowedModels: allowed && allowed.length > 0 ? allowed : null,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? null,
  };
}

/** Drop ciphertext / IVs so list and create responses never echo the secret. */
export function publicByokRow(row: {
  id: string;
  providerSlug: string;
  label?: string | null;
  keyPrefix: string;
  alwaysUse?: boolean | null;
  createdAt: Date | string;
  lastUsedAt?: Date | string | null;
}): PublicByokKey {
  return {
    id: row.id,
    providerSlug: row.providerSlug,
    label: row.label ?? null,
    keyPrefix: row.keyPrefix,
    alwaysUse: Boolean(row.alwaysUse),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? null,
  };
}

export function publicRecordHasSecret(row: Record<string, unknown>): boolean {
  const banned = ["keyCiphertext", "keyIv", "keyTag", "keyHash", "apiKey", "secret", "key"];
  return banned.some((field) => field in row && row[field] != null && String(row[field]).length > 8);
}

export function apiKeyQuota(used: number, plan: string | null | undefined): ApiKeyQuota {
  const def = getPlan(plan);
  const max = def.maxApiKeys;
  const safeUsed = Math.max(0, used);
  return {
    used: safeUsed,
    max,
    remaining: Math.max(0, max - safeUsed),
    atLimit: safeUsed >= max,
    planId: def.id,
    planName: def.name,
  };
}

export function apiKeyLimitMessage(planName: string, max: number): string {
  return `${planName} includes ${max} API keys. Upgrade to add more.`;
}

export function parseApiKeyName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > API_KEY_NAME_MAX) return null;
  if (name === SYSTEM_ASSISTANT_KEY_NAME) return null;
  return name;
}

export function parseAllowedModels(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const models = value
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);
  return models.length > 0 ? models : null;
}

export function parseApiKeyCreateBody(body: unknown): ParsedApiKeyCreate {
  const row = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const name = parseApiKeyName(row.name);
  if (!name) {
    return { ok: false, error: "Name is required (max 80 characters).", status: 400 };
  }
  if (row.allowedModels != null && !Array.isArray(row.allowedModels)) {
    return { ok: false, error: "allowedModels must be an array of model ids.", status: 400 };
  }
  return { ok: true, name, allowedModels: parseAllowedModels(row.allowedModels) };
}

export function parseByokCreateBody(body: unknown): ParsedByokCreate {
  const row = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const providerSlug = typeof row.providerSlug === "string" ? row.providerSlug.trim() : typeof row.provider === "string" ? row.provider.trim() : "";
  if (!isByokProviderSlug(providerSlug)) {
    return {
      ok: false,
      error: `Invalid providerSlug. Allowed: ${BYOK_PROVIDER_SLUGS.join(", ")}`,
      status: 400,
    };
  }
  const raw =
    (typeof row.apiKey === "string" && row.apiKey) ||
    (typeof row.secret === "string" && row.secret) ||
    "";
  const apiKey = raw.trim();
  if (apiKey.length < BYOK_SECRET_MIN) {
    return { ok: false, error: `apiKey must be at least ${BYOK_SECRET_MIN} characters`, status: 400 };
  }
  const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : null;
  return {
    ok: true,
    providerSlug,
    apiKey,
    label,
    alwaysUse: row.alwaysUse === true || row.alwaysUse === "true",
  };
}
