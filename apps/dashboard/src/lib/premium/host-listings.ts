import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { gpuHostShares, premiumRentals } from "@opendoor/database";
import { getDb } from "@/lib/db";
import { orgHasUnlimitedSpend, debitOrgUsage } from "@/lib/credits";
import { detectGpuStatus, type GpuStatus } from "@/lib/gpu/detect";
import {
  THIS_HOST_KEY,
  SHARED_METAL_DEFAULT_HOURLY_USD,
  clampSharedHourlyUsd,
  earningsCentsForElapsed,
  evaluateHostShareEligibility,
  type HostEligibility,
  type HostShareCapabilities,
} from "@/lib/premium/host-share";
import { ensurePremiumGpuSchema } from "@/lib/premium/schema";

export { ensurePremiumGpuSchema as ensureGpuHostSharesTable } from "@/lib/premium/schema";

export function capabilitiesFromDetect(
  status: GpuStatus,
  studioLive: boolean,
): HostShareCapabilities {
  return {
    appleSilicon: status.local.appleSilicon,
    gpuName: status.local.hardware.gpuName,
    chip: status.local.hardware.chip,
    memoryGb: status.local.hardware.memoryGb,
    gpuMemoryGb: status.local.hardware.gpuMemoryGb,
    usableMemoryGb: status.local.hardware.usableMemoryGb,
    ollamaInstalled: status.local.ollamaInstalled,
    ollamaRunning: status.local.ollamaRunning,
    studioLive,
  };
}

export function publicListing(
  row: typeof gpuHostShares.$inferSelect,
  extra?: { inUse?: boolean; activeRentalCount?: number; isOwn?: boolean },
) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    status: row.status,
    sku: row.sku,
    hourlyUsd: Number(row.hourlyUsd),
    displayName: row.displayName,
    chip: row.chip,
    gpuName: row.gpuName,
    memoryGb: row.memoryGb,
    workerKind: row.workerKind,
    isDemo: row.isDemo,
    earningsCents: row.earningsCents ?? 0,
    listedAt: row.listedAt,
    unlistedAt: row.unlistedAt,
    inUse: Boolean(extra?.inUse),
    activeRentalCount: extra?.activeRentalCount ?? 0,
    isOwn: Boolean(extra?.isOwn),
  };
}

async function occupancyByShare(shareIds: string[]) {
  const map = new Map<string, number>();
  if (shareIds.length === 0) return map;
  const db = getDb();
  const rows = await db.query.premiumRentals.findMany({
    where: inArray(premiumRentals.hostShareId, shareIds),
    columns: { hostShareId: true, status: true },
  });
  for (const row of rows) {
    if (!row.hostShareId) continue;
    if (row.status !== "active" && row.status !== "pending") continue;
    map.set(row.hostShareId, (map.get(row.hostShareId) || 0) + 1);
  }
  return map;
}

export async function getOrgListing(orgId: string) {
  await ensurePremiumGpuSchema();
  const db = getDb();
  return db.query.gpuHostShares.findFirst({
    where: and(eq(gpuHostShares.organizationId, orgId), eq(gpuHostShares.hostKey, THIS_HOST_KEY)),
  });
}

export async function listMarketplaceHosts(orgId: string) {
  await ensurePremiumGpuSchema();
  await settleOpenShareEarnings();
  const db = getDb();
  const rows = await db.query.gpuHostShares.findMany({
    where: eq(gpuHostShares.status, "listed"),
    orderBy: [desc(gpuHostShares.listedAt)],
  });
  const occ = await occupancyByShare(rows.map((r) => r.id));
  return rows.map((row) =>
    publicListing(row, {
      inUse: (occ.get(row.id) || 0) > 0,
      activeRentalCount: occ.get(row.id) || 0,
      isOwn: row.organizationId === orgId,
    }),
  );
}

export async function inboundShareRentals(orgId: string) {
  const listing = await getOrgListing(orgId);
  if (!listing) return [];
  const db = getDb();
  return db.query.premiumRentals.findMany({
    where: eq(premiumRentals.hostShareId, listing.id),
    orderBy: [desc(premiumRentals.createdAt)],
  });
}

export async function loadHostSharePage(orgId: string, studioLive: boolean) {
  await ensurePremiumGpuSchema();
  await settleOpenShareEarnings();
  const status = await detectGpuStatus();
  const capabilities = capabilitiesFromDetect(status, studioLive);
  const eligibility = evaluateHostShareEligibility(capabilities);
  const listing = await getOrgListing(orgId);
  const occ = listing ? await occupancyByShare([listing.id]) : new Map<string, number>();
  const activeRentalCount = listing ? occ.get(listing.id) || 0 : 0;
  const inbound = listing ? await inboundShareRentals(orgId) : [];
  return {
    eligibility,
    capabilities,
    listing: listing
      ? publicListing(listing, {
          inUse: activeRentalCount > 0,
          activeRentalCount,
          isOwn: true,
        })
      : null,
    inbound: inbound.map((row) => ({
      id: row.id,
      status: row.status,
      hourlyRate: Number(row.hourlyRate),
      earningsCents: row.earningsCents ?? 0,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      organizationId: row.organizationId,
      isPreview: row.organizationId === orgId,
    })),
  };
}

export async function listThisHost(input: {
  orgId: string;
  userId: string;
  isSiteAdmin?: boolean;
  hourlyUsd?: number;
  studioLive: boolean;
}): Promise<
  | { listing: ReturnType<typeof publicListing>; eligibility: HostEligibility; demo: boolean }
  | { error: string; status: 400 | 409; eligibility: HostEligibility }
> {
  await ensurePremiumGpuSchema();
  const status = await detectGpuStatus();
  const capabilities = capabilitiesFromDetect(status, input.studioLive);
  const eligibility = evaluateHostShareEligibility(capabilities);
  const demo = !eligibility.eligible && Boolean(input.isSiteAdmin);
  if (!eligibility.eligible && !input.isSiteAdmin) {
    return {
      error: eligibility.reasons[0] || "This machine is not powerful enough to list.",
      status: 400,
      eligibility,
    };
  }

  const hourlyUsd = clampSharedHourlyUsd(input.hourlyUsd ?? SHARED_METAL_DEFAULT_HOURLY_USD);
  const existing = await getOrgListing(input.orgId);
  const occ = existing ? await occupancyByShare([existing.id]) : new Map<string, number>();
  const inUse = existing ? (occ.get(existing.id) || 0) > 0 : false;
  if (existing?.status === "listed" && inUse && Number(existing.hourlyUsd) !== hourlyUsd) {
    return { error: "Unlist after the current rental stops before changing the rate.", status: 409, eligibility };
  }

  const db = getDb();
  const now = new Date();
  const actor = /^[0-9a-f-]{36}$/i.test(input.userId) ? input.userId : null;
  const memoryGb = capabilities.usableMemoryGb ?? capabilities.memoryGb ?? capabilities.gpuMemoryGb;
  const values = {
    organizationId: input.orgId,
    hostKey: THIS_HOST_KEY,
    status: "listed" as const,
    sku: "metal",
    hourlyUsd: hourlyUsd.toFixed(4),
    displayName: eligibility.label,
    chip: capabilities.chip,
    gpuName: capabilities.gpuName,
    memoryGb: memoryGb != null ? Math.round(memoryGb) : null,
    workerKind: eligibility.workerKind ?? (demo ? "demo" : null),
    isDemo: demo,
    listedBy: actor,
    listedAt: existing?.listedAt && existing.status === "listed" ? existing.listedAt : now,
    unlistedAt: null,
    updatedAt: now,
  };

  if (existing) {
    const [row] = await db
      .update(gpuHostShares)
      .set(values)
      .where(eq(gpuHostShares.id, existing.id))
      .returning();
    return {
      listing: publicListing(row, { inUse, activeRentalCount: occ.get(existing.id) || 0, isOwn: true }),
      eligibility,
      demo,
    };
  }

  const [row] = await db.insert(gpuHostShares).values(values).returning();
  return { listing: publicListing(row, { inUse: false, activeRentalCount: 0, isOwn: true }), eligibility, demo };
}

export async function unlistThisHost(orgId: string): Promise<
  | { listing: ReturnType<typeof publicListing> }
  | { error: string; status: 404 | 409 }
> {
  await ensurePremiumGpuSchema();
  const existing = await getOrgListing(orgId);
  if (!existing) return { error: "No listing on this host.", status: 404 };
  const occ = await occupancyByShare([existing.id]);
  if ((occ.get(existing.id) || 0) > 0) {
    return { error: "A renter is still using this host. Stop that rental before unlisting.", status: 409 };
  }
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(gpuHostShares)
    .set({ status: "unlisted", unlistedAt: now, updatedAt: now })
    .where(eq(gpuHostShares.id, existing.id))
    .returning();
  return { listing: publicListing(row, { inUse: false, activeRentalCount: 0, isOwn: true }) };
}

export async function settleOpenShareEarnings() {
  await ensurePremiumGpuSchema();
  const db = getDb();
  const open = await db.query.premiumRentals.findMany({
    where: and(
      isNotNull(premiumRentals.hostShareId),
      inArray(premiumRentals.status, ["active", "pending", "stopped"]),
    ),
  });
  for (const row of open) {
    if (!row.hostShareId || !row.startedAt) continue;
    if (row.status === "pending" && !row.startedAt) continue;
    try {
      await settleOneRental(row);
    } catch (err) {
      console.error("[premium] settle rental", row.id, err);
    }
  }
}

async function settleOneRental(row: typeof premiumRentals.$inferSelect) {
  if (!row.hostShareId || !row.startedAt) return row;
  const end = row.endedAt || new Date();
  const owed = earningsCentsForElapsed(Number(row.hourlyRate), row.startedAt, end);
  const already = row.earningsCents ?? 0;
  const delta = owed - already;
  if (delta <= 0) return row;
  const db = getDb();
  const listing = await db.query.gpuHostShares.findFirst({
    where: eq(gpuHostShares.id, row.hostShareId),
  });
  if (!listing) return row;

  await db
    .update(premiumRentals)
    .set({ earningsCents: already + delta, updatedAt: new Date() })
    .where(eq(premiumRentals.id, row.id));
  await db
    .update(gpuHostShares)
    .set({
      earningsCents: (listing.earningsCents ?? 0) + delta,
      updatedAt: new Date(),
    })
    .where(eq(gpuHostShares.id, listing.id));

  const preview = row.organizationId === listing.organizationId;
  if (!preview && !(await orgHasUnlimitedSpend(row.organizationId))) {
    await debitOrgUsage(row.organizationId, delta, undefined, {
      source: `gpu-share:${listing.id}`,
    });
  }
  return row;
}

export async function settleRentalById(rentalId: string) {
  await ensurePremiumGpuSchema();
  const db = getDb();
  const row = await db.query.premiumRentals.findFirst({
    where: eq(premiumRentals.id, rentalId),
  });
  if (!row) return null;
  return settleOneRental(row);
}
