/**
 * Fireworks-style spend unlocks: higher lifetime spend → higher TPM.
 * Key-level spendUsedUsdCents drives unlocks; plan applies a floor multiplier.
 */
import { getPlan } from "@opendoor/shared";

export interface SpendTierInput {
  spendUsedUsdCents: number;
  plan: string;
  keyTpm: number | null | undefined;
  keyRpm: number | null | undefined;
  serviceTier?: "standard" | "priority";
}

/** USD cents thresholds → TPM floor */
const TPM_UNLOCKS: Array<{ minCents: number; tpm: number; rpm: number }> = [
  { minCents: 0, tpm: 100_000, rpm: 60 },
  { minCents: 1_000, tpm: 300_000, rpm: 120 }, // $10
  { minCents: 10_000, tpm: 1_000_000, rpm: 300 }, // $100
  { minCents: 100_000, tpm: 5_000_000, rpm: 600 }, // $1,000
  { minCents: 1_000_000, tpm: 20_000_000, rpm: 1200 }, // $10,000
];

function planMultiplier(plan: string): number {
  return getPlan(plan).rateLimitMultiplier;
}

export function resolveRateLimits(input: SpendTierInput): {
  tpm: number;
  rpm: number;
  unlockTierCents: number;
} {
  let unlocked = TPM_UNLOCKS[0]!;
  for (const tier of TPM_UNLOCKS) {
    if (input.spendUsedUsdCents >= tier.minCents) unlocked = tier;
  }

  const mult = planMultiplier(input.plan);
  const priorityMult = input.serviceTier === "priority" ? 2 : 1;

  const fromSpendTpm = Math.floor(unlocked.tpm * mult * priorityMult);
  const fromSpendRpm = Math.floor(unlocked.rpm * mult * priorityMult);
  const keyTpm = input.keyTpm ?? 100_000;
  const keyRpm = input.keyRpm ?? 60;

  return {
    tpm: Math.max(keyTpm, fromSpendTpm),
    rpm: Math.max(keyRpm, fromSpendRpm),
    unlockTierCents: unlocked.minCents,
  };
}
