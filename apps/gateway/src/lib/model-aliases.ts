import { db, pricingRules, providers } from "@opendoor/database";
import type { ProviderPreferences, ProviderSort } from "@opendoor/shared";
import { and, eq, or } from "drizzle-orm";
import { resolveAutoRoute } from "./auto-router.js";

const ROUTING_SUFFIXES = ["nitro", "floor", "free"] as const;
export type RoutingSuffix = (typeof ROUTING_SUFFIXES)[number];

const AUTO_MODEL_IDS = new Set(["openrouter/auto", "opendoor/auto", "auto"]);

/** Closed marketplace slugs ignored when `:free` cannot see $0 catalog rows. */
export const EXPENSIVE_CLOSED_SLUGS = [
  "openai",
  "anthropic",
  "azure-foundry",
  "google",
] as const;

export interface ParsedModelAlias {
  raw: string;
  modelId: string;
  isAuto: boolean;
  suffix: RoutingSuffix | null;
  providerHints: ProviderPreferences;
}

const SUFFIX_RE = /:(nitro|floor|free)$/i;

export function parseModelAlias(raw: string): ParsedModelAlias {
  let modelId = String(raw || "").trim();
  let suffix: RoutingSuffix | null = null;
  const seen = new Set<RoutingSuffix>();

  while (true) {
    const match = modelId.match(SUFFIX_RE);
    if (!match) break;
    const key = match[1].toLowerCase() as RoutingSuffix;
    modelId = modelId.slice(0, -match[0].length);
    seen.add(key);
    if (!suffix) suffix = key;
  }

  const providerHints: ProviderPreferences = {};
  if (suffix === "nitro") providerHints.sort = "throughput";
  if (suffix === "floor") providerHints.sort = "price";
  if (seen.has("free")) {
    providerHints.sort = providerHints.sort ?? "price";
    providerHints.ignore = [...EXPENSIVE_CLOSED_SLUGS];
  }
  if (seen.has("nitro") && !providerHints.sort) {
    providerHints.sort = "throughput";
  }

  return {
    raw,
    modelId,
    isAuto: AUTO_MODEL_IDS.has(modelId.toLowerCase()),
    suffix,
    providerHints,
  };
}

export function mergeProviderPreferences(
  existing: ProviderPreferences | undefined,
  hints: ProviderPreferences
): ProviderPreferences {
  if (!existing) return { ...hints };
  const ignore = Array.from(
    new Set([...(hints.ignore || []), ...(existing.ignore || [])])
  );
  return {
    ...hints,
    ...existing,
    sort: existing.sort ?? hints.sort,
    order: existing.order ?? hints.order,
    allow_fallbacks: existing.allow_fallbacks ?? hints.allow_fallbacks,
    only: existing.only ?? hints.only,
    ignore: ignore.length ? ignore : undefined,
  };
}

async function resolveFreeProviderHints(
  modelId: string,
  base: ProviderPreferences
): Promise<ProviderPreferences> {
  try {
    const rows = await db
      .select({
        slug: providers.slug,
        input: pricingRules.inputCostPer1K,
        output: pricingRules.outputCostPer1K,
      })
      .from(pricingRules)
      .innerJoin(providers, eq(pricingRules.providerId, providers.id))
      .where(
        and(
          eq(pricingRules.modelId, modelId),
          eq(providers.enabled, true),
          or(eq(pricingRules.region, "global"), eq(pricingRules.region, "us"))
        )
      );

    const freeSlugs = Array.from(
      new Set(
        rows
          .filter((r) => Number(r.input) === 0 && Number(r.output) === 0)
          .map((r) => r.slug)
      )
    );
    if (freeSlugs.length > 0) {
      return {
        ...base,
        sort: (base.sort ?? "price") as ProviderSort,
        only: freeSlugs,
        ignore: undefined,
      };
    }
  } catch {
    /* catalog pricing optional */
  }
  return {
    ...base,
    sort: (base.sort ?? "price") as ProviderSort,
    ignore: Array.from(
      new Set([...(base.ignore || []), ...EXPENSIVE_CLOSED_SLUGS])
    ),
  };
}

export function normalizeAllowlist(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const ids = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return ids.length ? ids : undefined;
}

/** True if `modelId` (raw or suffix-stripped) is on the key allowlist. Auto ids are allowed. */
export function isModelAllowed(
  modelId: string,
  allowedModels: string[] | null | undefined
): boolean {
  if (!allowedModels || allowedModels.length === 0) return true;
  const parsed = parseModelAlias(modelId);
  if (parsed.isAuto) return true;
  const needle = parsed.modelId.toLowerCase();
  for (const raw of allowedModels) {
    if (typeof raw !== "string") continue;
    if (raw === modelId) return true;
    if (parseModelAlias(raw).modelId.toLowerCase() === needle) return true;
  }
  return false;
}

function allowlistCandidates(allowedModels: string[] | undefined): string[] | undefined {
  if (!allowedModels?.length) return undefined;
  const ids = allowedModels
    .map((id) => parseModelAlias(id).modelId)
    .filter((id) => id && !AUTO_MODEL_IDS.has(id.toLowerCase()));
  return ids.length ? ids : undefined;
}

/** Strip suffixes, resolve `opendoor/auto`, merge sort/ignore without wiping caller order. */
export async function applyModelRouting(
  body: {
    model?: string;
    provider?: ProviderPreferences;
  },
  opts?: { allowedModels?: string[] | null }
): Promise<void> {
  if (typeof body.model !== "string" || !body.model) return;

  const parsed = parseModelAlias(body.model);
  let hints = { ...parsed.providerHints };
  if (parsed.suffix === "free" || parsed.providerHints.ignore) {
    hints = await resolveFreeProviderHints(parsed.modelId, hints);
  }

  if (parsed.isAuto) {
    const routed = await resolveAutoRoute({
      candidates: allowlistCandidates(normalizeAllowlist(opts?.allowedModels)),
    });
    body.model = routed.modelId;
    body.provider = mergeProviderPreferences(body.provider, {
      ...routed.providerHints,
      ...hints,
    });
    return;
  }

  body.model = parsed.modelId;
  if (Object.keys(hints).length > 0) {
    body.provider = mergeProviderPreferences(body.provider, hints);
  }
}
