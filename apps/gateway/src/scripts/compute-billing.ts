// @ts-nocheck
// Compute billing — on-demand GPU-second rates from gpu_skus (Fireworks-style dedicated table).
// Usage: bun apps/gateway/src/scripts/compute-billing.ts

import { db, deployments, gpuSkus } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { debitCredits } from "../utils/billing.js";

/** Map deployment.gpuType → gpu_skus.sku (metal = own hardware, $0). */
const GPU_TYPE_TO_SKU: Record<string, string | null> = {
  none: null,
  metal: null,
  "nvidia-l4": "nvidia-l4",
  "nvidia-t4": "nvidia-l4", // bill T4 at L4 list until a T4 SKU exists
  "nvidia-a100": "nvidia-a100",
  "nvidia-h100": "nvidia-h100",
};

async function loadRates(): Promise<Map<string, { hourly: number; regionMult: number }>> {
  const rows = await db.select().from(gpuSkus).where(eq(gpuSkus.enabled, true));
  const map = new Map<string, { hourly: number; regionMult: number }>();
  for (const r of rows) {
    map.set(r.sku, {
      hourly: Number(r.hourlyUsd),
      regionMult: Number(r.regionMultiplier || 1),
    });
  }
  return map;
}

function hourlyRate(
  gpuType: string,
  rates: Map<string, { hourly: number; regionMult: number }>,
  regionLocked: boolean
): number {
  const sku = GPU_TYPE_TO_SKU[gpuType];
  if (!sku) return 0;
  const row = rates.get(sku);
  if (!row) return 0;
  const mult = regionLocked ? row.regionMult : 1;
  return row.hourly * mult;
}

async function runBilling() {
  const rates = await loadRates();
  const runningDeployments = await db.query.deployments.findMany({
    where: eq(deployments.status, "running"),
  });

  const now = new Date();
  let totalBilled = 0;

  for (const deployment of runningDeployments) {
    const startedAt = deployment.startedAt ? new Date(deployment.startedAt) : now;
    const totalHoursSinceStart =
      (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60);
    const alreadyBilled = parseFloat(deployment.computeHoursBilled || "0");
    const hoursToBill = Math.max(0, totalHoursSinceStart - alreadyBilled);

    if (hoursToBill <= 0) continue;

    const regionLocked = Boolean(
      (deployment as any).regionLocked ||
        (deployment as any).metadata?.region_lock
    );
    const rate = hourlyRate(deployment.gpuType || "none", rates, regionLocked);
    const gpuCount = Math.max(1, deployment.gpuCount || 1);
    // Per-second metering: hourly × hours × GPU count (replicas share one GPU unless gpuCount set)
    const periodCost = rate * hoursToBill * gpuCount;

    const currentCost = parseFloat(deployment.computeCostUsd || "0");

    const costCents = Math.max(0, Math.ceil(periodCost * 100));
    if (costCents > 0 && deployment.organizationId) {
      try {
        await debitCredits(deployment.organizationId, costCents);
      } catch {
        await db
          .update(deployments)
          .set({
            status: "stopped",
            statusMessage: "Stopped — prepaid credit could not cover GPU time. Top up on Billing.",
            stoppedAt: now,
            updatedAt: now,
          })
          .where(eq(deployments.id, deployment.id));
        console.log(`Stopped ${deployment.name}: insufficient credits for $${periodCost.toFixed(4)}`);
        continue;
      }
    }

    await db
      .update(deployments)
      .set({
        computeHoursBilled: (alreadyBilled + hoursToBill).toFixed(6),
        computeCostUsd: (currentCost + periodCost).toFixed(6),
        updatedAt: now,
      })
      .where(eq(deployments.id, deployment.id));

    totalBilled += periodCost;
    const perSecond = rate / 3600;
    console.log(
      `Billed ${deployment.name} (${deployment.gpuType}): ${hoursToBill.toFixed(6)}h × $${rate}/hr ($${perSecond.toFixed(6)}/s) = $${periodCost.toFixed(6)}`
    );
  }

  console.log(`Total GPU compute billed: $${totalBilled.toFixed(6)}`);
  process.exit(0);
}

runBilling().catch((err) => {
  console.error("Billing failed:", err);
  process.exit(1);
});
