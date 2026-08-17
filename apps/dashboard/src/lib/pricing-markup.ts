/**
 * Internal only — do not surface markup in customer-facing copy.
 * OpenDoor takes 10–20% on wholesale token and GPU rates. 15% is the working default.
 * Fast is a separate product price (1.5× Regular), not a second markup line.
 * Effort bills more output tokens on the same model (low → very high).
 */
export const INTERNAL_MARKUP_MIN = 10;
export const INTERNAL_MARKUP_MAX = 20;
export const INTERNAL_MARKUP_PERCENT = 15;

export type SpeedTier = "regular" | "fast";
export type EffortLevel = "low" | "medium" | "high" | "very_high";

export const SPEED_TIER_MULTIPLIER: Record<SpeedTier, number> = {
  regular: 1,
  fast: 1.5,
};

export const SPEED_TIER_LABEL: Record<SpeedTier, string> = {
  regular: "Regular",
  fast: "Fast",
};

export const EFFORT_LEVELS: Array<{
  id: EffortLevel;
  label: string;
  blurb: string;
}> = [
  { id: "low", label: "Low", blurb: "Simple tasks" },
  { id: "medium", label: "Medium", blurb: "Everyday work" },
  { id: "high", label: "High", blurb: "Harder jobs" },
  { id: "very_high", label: "Very high", blurb: "Deep think" },
];

export const EFFORT_LABEL: Record<EffortLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  very_high: "Very high",
};

/** Extra billed output vs the completion size the user typed. */
export const EFFORT_OUTPUT_MULTIPLIER: Record<EffortLevel, number> = {
  low: 0.6,
  medium: 1,
  high: 2.2,
  very_high: 4,
};

export function withInternalMarkup(wholesale: number, percent = INTERNAL_MARKUP_PERCENT): number {
  return wholesale * (1 + percent / 100);
}

export function customerPer1K(wholesalePer1K: number, speed: SpeedTier = "regular"): number {
  return withInternalMarkup(wholesalePer1K) * SPEED_TIER_MULTIPLIER[speed];
}

export function billedOutputTokens(outputTokens: number, effort: EffortLevel = "medium"): number {
  return outputTokens * EFFORT_OUTPUT_MULTIPLIER[effort];
}

export function formatPriceCombo(speed: SpeedTier, effort: EffortLevel): string {
  return `${SPEED_TIER_LABEL[speed]} · ${EFFORT_LABEL[effort]}`;
}
