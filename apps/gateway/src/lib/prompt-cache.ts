import { createHash } from "crypto";
import type { ChatMessage } from "@opendoor/shared";
import { flattenMessageText } from "@opendoor/shared";
import { createRedis } from "./redis.js";

const redis = createRedis();

const AFFINITY_TTL_SEC = Number(process.env.PROMPT_CACHE_AFFINITY_TTL_SEC || 3600);

/** Stable fingerprint of the prompt prefix used for session affinity. */
export function promptCacheFingerprint(
  model: string,
  messages: ChatMessage[],
  user?: string
): string {
  const prefix = messages
    .slice(0, 3)
    .map((m) => `${m.role}:${flattenMessageText(m.content).slice(0, 2000)}`)
    .join("\n");
  return createHash("sha256")
    .update(`${model}|${user || ""}|${prefix}`)
    .digest("hex")
    .slice(0, 32);
}

export async function rememberCacheAffinity(opts: {
  organizationId: string;
  model: string;
  fingerprint: string;
  providerSlug: string;
}): Promise<void> {
  const key = `promptcache:${opts.organizationId}:${opts.model}:${opts.fingerprint}`;
  try {
    await redis.set(key, opts.providerSlug, "EX", AFFINITY_TTL_SEC);
  } catch {
    /* redis optional for affinity */
  }
}

export async function lookupCacheAffinity(opts: {
  organizationId: string;
  model: string;
  fingerprint: string;
}): Promise<string | null> {
  const key = `promptcache:${opts.organizationId}:${opts.model}:${opts.fingerprint}`;
  try {
    const v = await redis.get(key);
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Prefer sticky provider when a prior request with the same prompt prefix
 * succeeded (Fireworks-style session affinity for prompt cache hits).
 */
export function applyAffinityToChain(
  chainSlugs: string[],
  preferredSlug: string | null
): string[] {
  if (!preferredSlug) return chainSlugs;
  if (!chainSlugs.includes(preferredSlug)) return chainSlugs;
  return [preferredSlug, ...chainSlugs.filter((s) => s !== preferredSlug)];
}
