import {
  formatAllowanceCountdown,
  getMinutesRemaining,
  getWindowMs,
  houseChatAllowanceForPlan,
  isWindowExpired,
  type HouseChatMode,
} from "@opendoor/shared";
import { getDb } from "@/lib/db";
import { houseChatUsage, organizations, users } from "@opendoor/database";
import { eq, sql } from "drizzle-orm";
import { createHash, timingSafeEqual } from "crypto";

export type HouseChatAllowanceStatus = {
  periodWindow: string;
  periodUsed: number;
  periodLimit: number;
  periodRemaining: number;
  periodMinutesRemaining: number | null;
  weeklyUsed: number;
  weeklyLimit: number;
  weeklyRemaining: number;
  weeklyMinutesRemaining: number | null;
  allowed: boolean;
  reason: "ok" | "period_limit" | "weekly_limit";
  refillLabel: string | null;
  unlimited?: boolean;
};

const SITE_ADMIN_UNLIMITED: HouseChatAllowanceStatus = {
  periodWindow: "weekly",
  periodUsed: 0,
  periodLimit: 0,
  periodRemaining: 0,
  periodMinutesRemaining: null,
  weeklyUsed: 0,
  weeklyLimit: 0,
  weeklyRemaining: 0,
  weeklyMinutesRemaining: null,
  allowed: true,
  reason: "ok",
  refillLabel: null,
  unlimited: true,
};

export function normalizeHouseChatMode(raw: unknown): HouseChatMode {
  const m = typeof raw === "string" ? raw.toLowerCase() : "";
  if (m === "thinking" || m === "fast" || m === "max" || m === "auto") return m;
  return "auto";
}

export async function loadOrgPlan(orgId: string): Promise<string> {
  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { plan: true },
  });
  return org?.plan || "free";
}

export async function loadProtectedChild(userId: string): Promise<boolean> {
  const db = getDb();
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { protectedChild: true },
  });
  return Boolean(row?.protectedChild);
}

export async function isOrgOrganizer(opts: {
  userId: string;
  orgId: string;
  role?: string;
}): Promise<boolean> {
  if (opts.role === "admin" || opts.role === "owner") return true;
  const db = getDb();
  const members = await db.query.users.findMany({
    where: eq(users.organizationId, opts.orgId),
    columns: { id: true, role: true, createdAt: true },
    orderBy: (u, { asc }) => [asc(u.createdAt)],
  });
  if (!members.length) return true;
  const first = members[0];
  if (first?.id === opts.userId) return true;
  const me = members.find((m) => m.id === opts.userId);
  return me?.role === "admin" || me?.role === "owner";
}

export function hashParentPin(pin: string): string {
  return createHash("sha256").update(`opendoor-parent-pin:${pin}`).digest("hex");
}

export function verifyParentPin(pin: string, hash: string | null | undefined): boolean {
  if (!hash || !pin) return false;
  const a = Buffer.from(hashParentPin(pin));
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Make sure the signed-in seat exists in this database so usage rows can be written. */
export async function ensureHouseChatSeat(session: {
  userId: string;
  orgId: string;
  email?: string;
}) {
  const db = getDb();
  let org = await db.query.organizations.findFirst({
    where: eq(organizations.id, session.orgId),
    columns: { id: true },
  });
  if (!org) {
    const base = `seat-${session.orgId.replace(/-/g, "").slice(0, 12)}`;
    let created = false;
    for (let i = 0; i < 6 && !created; i++) {
      const slug = i === 0 ? base : `${base}-${i}`;
      try {
        await db.insert(organizations).values({
          id: session.orgId,
          name: session.email?.split("@")[0] || "OpenDoor Chat",
          slug,
          plan: "free",
        });
        created = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!/unique|duplicate/i.test(message)) throw err;
      }
    }
    org = await db.query.organizations.findFirst({
      where: eq(organizations.id, session.orgId),
      columns: { id: true },
    });
    if (!org) throw new Error("Could not create organization for OpenDoor Chat");
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: { id: true },
  });
  if (existing) return;

  const email =
    session.email?.toLowerCase().trim() || `${session.userId}@local.opendoor`;
  const taken = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });
  await db
    .insert(users)
    .values({
      id: session.userId,
      email: taken ? `${session.userId}@local.opendoor` : email,
      name: session.email?.split("@")[0] || "Member",
      organizationId: session.orgId,
      role: "admin",
    })
    .onConflictDoNothing();
}

async function ensureUsageRow(userId: string, orgId: string) {
  const db = getDb();
  const existing = await db.query.houseChatUsage.findFirst({
    where: eq(houseChatUsage.userId, userId),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(houseChatUsage)
    .values({
      userId,
      organizationId: orgId,
      periodMessagesUsed: 0,
      weeklyMessagesUsed: 0,
    })
    .onConflictDoNothing({ target: houseChatUsage.userId })
    .returning();
  if (created) return created;
  const raced = await db.query.houseChatUsage.findFirst({
    where: eq(houseChatUsage.userId, userId),
  });
  if (!raced) throw new Error("Could not create house chat usage row");
  return raced;
}

async function rollUsageWindows(
  userId: string,
  usage: typeof houseChatUsage.$inferSelect,
  periodMs: number,
  weeklyMs: number
) {
  const db = getDb();
  const now = new Date();
  const updates: Partial<typeof houseChatUsage.$inferInsert> = {};
  let next = usage;

  if (isWindowExpired(usage.periodWindowStartedAt, periodMs)) {
    updates.periodMessagesUsed = 0;
    updates.periodWindowStartedAt = now;
    next = { ...next, periodMessagesUsed: 0, periodWindowStartedAt: now };
  }
  if (isWindowExpired(usage.weekStartedAt, weeklyMs)) {
    updates.weeklyMessagesUsed = 0;
    updates.weekStartedAt = now;
    next = { ...next, weeklyMessagesUsed: 0, weekStartedAt: now };
  }
  if (Object.keys(updates).length > 0) {
    updates.updatedAt = now;
    await db.update(houseChatUsage).set(updates).where(eq(houseChatUsage.userId, userId));
  }
  return next;
}

export async function getHouseChatAllowance(
  userId: string,
  orgId: string,
  plan?: string,
  opts?: { unlimited?: boolean }
): Promise<HouseChatAllowanceStatus> {
  if (opts?.unlimited) return { ...SITE_ADMIN_UNLIMITED };
  const resolvedPlan = plan || (await loadOrgPlan(orgId));
  const caps = houseChatAllowanceForPlan(resolvedPlan);
  const periodMs = getWindowMs(caps.periodWindow)!;
  const weeklyMs = getWindowMs("weekly")!;

  const usage = await rollUsageWindows(
    userId,
    await ensureUsageRow(userId, orgId),
    periodMs,
    weeklyMs
  );

  const periodUsed = usage.periodMessagesUsed ?? 0;
  const weeklyUsed = usage.weeklyMessagesUsed ?? 0;
  const periodRemaining = Math.max(0, caps.periodMessageLimit - periodUsed);
  const weeklyRemaining = Math.max(0, caps.weeklyMessageLimit - weeklyUsed);

  if (weeklyUsed >= caps.weeklyMessageLimit) {
    const mins = getMinutesRemaining(usage.weekStartedAt, weeklyMs);
    return {
      periodWindow: caps.periodWindow,
      periodUsed,
      periodLimit: caps.periodMessageLimit,
      periodRemaining: 0,
      periodMinutesRemaining: getMinutesRemaining(usage.periodWindowStartedAt, periodMs),
      weeklyUsed,
      weeklyLimit: caps.weeklyMessageLimit,
      weeklyRemaining: 0,
      weeklyMinutesRemaining: mins,
      allowed: false,
      reason: "weekly_limit",
      refillLabel: `Weekly allowance resets in ${formatAllowanceCountdown(mins)}`,
    };
  }

  if (periodUsed >= caps.periodMessageLimit) {
    const mins = getMinutesRemaining(usage.periodWindowStartedAt, periodMs);
    return {
      periodWindow: caps.periodWindow,
      periodUsed,
      periodLimit: caps.periodMessageLimit,
      periodRemaining: 0,
      periodMinutesRemaining: mins,
      weeklyUsed,
      weeklyLimit: caps.weeklyMessageLimit,
      weeklyRemaining,
      weeklyMinutesRemaining: getMinutesRemaining(usage.weekStartedAt, weeklyMs),
      allowed: false,
      reason: "period_limit",
      refillLabel: `Refills in ${formatAllowanceCountdown(mins)}`,
    };
  }

  return {
    periodWindow: caps.periodWindow,
    periodUsed,
    periodLimit: caps.periodMessageLimit,
    periodRemaining,
    periodMinutesRemaining: getMinutesRemaining(usage.periodWindowStartedAt, periodMs),
    weeklyUsed,
    weeklyLimit: caps.weeklyMessageLimit,
    weeklyRemaining,
    weeklyMinutesRemaining: getMinutesRemaining(usage.weekStartedAt, weeklyMs),
    allowed: true,
    reason: "ok",
    refillLabel: null,
  };
}

/** Reserve one message against period + weekly counters. Call after allow check. */
export async function incrementHouseChatUsage(userId: string, orgId: string) {
  const db = getDb();
  const resolvedPlan = await loadOrgPlan(orgId);
  const caps = houseChatAllowanceForPlan(resolvedPlan);
  const periodMs = getWindowMs(caps.periodWindow)!;
  const weeklyMs = getWindowMs("weekly")!;
  await rollUsageWindows(userId, await ensureUsageRow(userId, orgId), periodMs, weeklyMs);
  const now = new Date();
  await db
    .update(houseChatUsage)
    .set({
      periodMessagesUsed: sql`${houseChatUsage.periodMessagesUsed} + 1`,
      weeklyMessagesUsed: sql`${houseChatUsage.weeklyMessagesUsed} + 1`,
      periodWindowStartedAt: sql`COALESCE(${houseChatUsage.periodWindowStartedAt}, NOW())`,
      weekStartedAt: sql`COALESCE(${houseChatUsage.weekStartedAt}, NOW())`,
      updatedAt: now,
    })
    .where(eq(houseChatUsage.userId, userId));
}
