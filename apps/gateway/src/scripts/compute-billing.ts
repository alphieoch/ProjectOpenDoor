// @ts-nocheck
// Compute billing script — run hourly to calculate compute costs for running deployments
// Usage: bun apps/gateway/src/scripts/compute-billing.ts

import { db, deployments } from "@opendoor/database";
import { eq } from "drizzle-orm";

// Compute pricing per hour (replicas × cpu × memoryGb × rate)
// These rates should match the dashboard UI and be configurable
const COMPUTE_RATES: Record<string, number> = {
  "0.50-1.0": 0.05,   // Small
  "1.00-2.0": 0.10,   // Medium
  "2.00-4.0": 0.20,   // Large
};

function getRate(cpu: string, memoryGb: string): number {
  const key = `${parseFloat(cpu).toFixed(2)}-${parseFloat(memoryGb).toFixed(1)}`;
  return COMPUTE_RATES[key] || parseFloat(cpu) * parseFloat(memoryGb) * 0.025;
}

async function runBilling() {
  const runningDeployments = await db.query.deployments.findMany({
    where: eq(deployments.status, "running"),
  });

  const now = new Date();
  let totalBilled = 0;

  for (const deployment of runningDeployments) {
    const startedAt = deployment.startedAt ? new Date(deployment.startedAt) : now;
    const hoursSinceLastBill =
      (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastBill <= 0) continue;

    const rate = getRate(deployment.cpu, deployment.memoryGb);
    const hourlyCost =
      deployment.replicas * parseFloat(deployment.cpu) * parseFloat(deployment.memoryGb) * rate;
    const periodCost = hourlyCost * hoursSinceLastBill;

    const currentHours = parseFloat(deployment.computeHoursBilled || "0");
    const currentCost = parseFloat(deployment.computeCostUsd || "0");

    await db
      .update(deployments)
      .set({
        computeHoursBilled: (currentHours + hoursSinceLastBill).toFixed(4),
        computeCostUsd: (currentCost + periodCost).toFixed(4),
        updatedAt: now,
      })
      .where(eq(deployments.id, deployment.id));

    totalBilled += periodCost;
    console.log(
      `Billed deployment ${deployment.name}: ${hoursSinceLastBill.toFixed(4)}h = $${periodCost.toFixed(4)}`
    );
  }

  console.log(`Total compute billed: $${totalBilled.toFixed(4)}`);
  process.exit(0);
}

runBilling().catch((err) => {
  console.error("Billing failed:", err);
  process.exit(1);
});
