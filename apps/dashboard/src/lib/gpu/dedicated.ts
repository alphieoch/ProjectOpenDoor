import { and, eq, inArray } from "drizzle-orm";
import { deployments, organizations } from "@opendoor/database";
import { ACTIVE_DEPLOYMENT_STATUSES, getPlan } from "@opendoor/shared";
import { getDb } from "@/lib/db";
import type { GpuStatus } from "./detect";

/** Floor of free unified / GPU memory before dedicated metals stay a valid option. */
export const DEDICATED_MIN_FREE_GB = 8;
const OS_RESERVE_GB = 4;

export type DedicatedMetalsCapacity = {
  present: boolean;
  available: boolean;
  reason: string;
  label: string;
  usableMemoryGb: number | null;
  usedMemoryGb: number;
  remainingMemoryGb: number | null;
  usedPercent: number | null;
  slotsUsed: number;
  slotsMax: number;
  slotsRemaining: number;
  runningLocal: number;
};

function hardwareLabel(status: GpuStatus): string {
  const hw = status.local.hardware;
  if (status.local.appleSilicon) return "Apple Silicon · Metal";
  if (hw.gpuName) return hw.gpuName;
  return "No dedicated metals on this machine";
}

export async function summarizeDedicatedMetals(
  orgId: string,
  status: GpuStatus
): Promise<DedicatedMetalsCapacity> {
  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { plan: true },
  });
  const limits = getPlan(org?.plan);

  const active = await db.query.deployments.findMany({
    where: and(
      eq(deployments.organizationId, orgId),
      inArray(deployments.status, [...ACTIVE_DEPLOYMENT_STATUSES])
    ),
    columns: {
      target: true,
      gpuType: true,
      memoryGb: true,
      replicas: true,
    },
  });

  const localActive = active.filter((d) => d.target === "local" || d.gpuType === "metal");
  const usedByDeployments = localActive.reduce((sum, d) => {
    const mem = Number(d.memoryGb) || 0;
    const replicas = Math.max(1, d.replicas || 1);
    return sum + mem * replicas;
  }, 0);

  const usable = status.local.hardware.usableMemoryGb;
  const usedMemoryGb = Math.round(usedByDeployments * 10) / 10;
  const remainingMemoryGb =
    usable != null ? Math.max(0, Math.round((usable - usedMemoryGb - OS_RESERVE_GB) * 10) / 10) : null;
  const usedPercent =
    usable != null && usable > 0
      ? Math.min(100, Math.round(((usedMemoryGb + OS_RESERVE_GB) / usable) * 100))
      : null;

  const slotsUsed = active.length;
  const slotsMax = limits.maxActiveDeployments;
  const slotsRemaining = Math.max(0, slotsMax - slotsUsed);
  const present = Boolean(status.local.appleSilicon || status.local.hardware.gpuName);
  const label = hardwareLabel(status);

  let available = false;
  let reason = "";
  if (!present) {
    reason = "No dedicated metals on this machine. Use Ochieng & Co cloud services.";
  } else if (!status.local.ollamaInstalled) {
    reason = `${label} is here, but Ollama is not installed. Dedicated metals stay unavailable until it is.`;
  } else if (slotsRemaining <= 0) {
    reason = `No dedicated slots left (${slotsUsed} of ${slotsMax} in use). Stop a deployment before this is a valid option.`;
  } else if (remainingMemoryGb != null && remainingMemoryGb < DEDICATED_MIN_FREE_GB) {
    reason = `${remainingMemoryGb} GB free — below the ${DEDICATED_MIN_FREE_GB} GB needed. Dedicated metals are not a valid option until you free memory.`;
  } else {
    available = true;
    reason =
      remainingMemoryGb != null
        ? `${remainingMemoryGb} GB free of ${usable} GB · ${slotsRemaining} of ${slotsMax} slots open.`
        : `${label} is ready · ${slotsRemaining} of ${slotsMax} slots open.`;
  }

  return {
    present,
    available,
    reason,
    label,
    usableMemoryGb: usable,
    usedMemoryGb,
    remainingMemoryGb,
    usedPercent,
    slotsUsed,
    slotsMax,
    slotsRemaining,
    runningLocal: localActive.length,
  };
}
