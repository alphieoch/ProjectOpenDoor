/** Normalize OpenAI-compatible usage blobs (incl. cached prompt tokens). */

export interface NormalizedUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
}

export function extractCachedTokens(usage: any): number {
  if (!usage || typeof usage !== "object") return 0;
  if (typeof usage.cached_tokens === "number") return Math.max(0, usage.cached_tokens);
  const details = usage.prompt_tokens_details;
  if (details && typeof details.cached_tokens === "number") {
    return Math.max(0, details.cached_tokens);
  }
  // Anthropic-style
  if (typeof usage.cache_read_input_tokens === "number") {
    return Math.max(0, usage.cache_read_input_tokens);
  }
  return 0;
}

export function normalizeUsage(usage: any): NormalizedUsage {
  const prompt = Number(usage?.prompt_tokens || 0);
  const completion = Number(usage?.completion_tokens || 0);
  const total = Number(usage?.total_tokens || prompt + completion);
  const cached = Math.min(extractCachedTokens(usage), prompt);
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    cached_tokens: cached,
  };
}
