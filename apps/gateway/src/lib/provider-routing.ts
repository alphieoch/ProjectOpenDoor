import type { ProviderPreferences } from "@opendoor/shared";
import type { RankedProvider } from "./smart-router.js";

const SLUG_ALIASES: Record<string, string> = {
  azure: "azure-foundry",
  "azure-openai": "azure-foundry",
  foundry: "azure-foundry",
  "azure-foundry": "azure-foundry",
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  gemini: "google",
  cohere: "cohere",
  mistral: "mistral",
  deepseek: "deepseek",
  qwen: "qwen",
  together: "together",
  groq: "groq",
  xai: "xai",
  grok: "xai",
  cerebras: "cerebras",
  perplexity: "perplexity",
  ollama: "ollama",
  custom: "custom",
};

export function normalizeProviderSlug(raw: string): string {
  const key = raw.trim().toLowerCase();
  return SLUG_ALIASES[key] || key;
}

export function applyProviderRouting(
  ranked: RankedProvider[],
  prefs: ProviderPreferences | undefined,
  extraSlugs: string[] = []
): string[] {
  const allowFallbacks = prefs?.allow_fallbacks !== false;
  const rankedMap = new Map(ranked.map((r) => [r.slug, r]));
  let slugs = ranked.map((r) => r.slug);

  for (const raw of extraSlugs) {
    const slug = normalizeProviderSlug(raw);
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }

  if (prefs?.only?.length) {
    const only = new Set(prefs.only.map(normalizeProviderSlug));
    slugs = slugs.filter((s) => only.has(s));
  }
  if (prefs?.ignore?.length) {
    const ignore = new Set(prefs.ignore.map(normalizeProviderSlug));
    slugs = slugs.filter((s) => !ignore.has(s));
  }

  if (prefs?.sort) {
    slugs = [...slugs].sort((a, b) => {
      const ra = rankedMap.get(a);
      const rb = rankedMap.get(b);
      if (prefs.sort === "price") {
        return (ra?.estimatedCostUsd ?? 999) - (rb?.estimatedCostUsd ?? 999);
      }
      if (prefs.sort === "latency") {
        return (ra?.health.avgLatencyMs ?? 9999) - (rb?.health.avgLatencyMs ?? 9999);
      }
      const ta = (ra?.health.successRate ?? 0) * 10_000 - (ra?.health.avgLatencyMs ?? 0);
      const tb = (rb?.health.successRate ?? 0) * 10_000 - (rb?.health.avgLatencyMs ?? 0);
      return tb - ta;
    });
  }

  if (prefs?.order?.length) {
    const ordered: string[] = [];
    for (const raw of prefs.order) {
      const slug = normalizeProviderSlug(raw);
      if (slug && slugs.includes(slug) && !ordered.includes(slug)) {
        ordered.push(slug);
      }
    }
    if (allowFallbacks) {
      for (const s of slugs) {
        if (!ordered.includes(s)) ordered.push(s);
      }
    }
    slugs = ordered;
  } else if (!allowFallbacks) {
    slugs = slugs.slice(0, 1);
  }

  return slugs;
}
