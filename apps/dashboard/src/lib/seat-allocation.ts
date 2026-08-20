import { invitations, organizations, users } from "@opendoor/database";
import {
  extraSeatsFromMetadata,
  getPlan,
  occupiedSeats,
  paidSeatsFromMetadata,
  resolveMaxSeats,
  evaluateSeatInvite,
  type SeatInviteDecision,
} from "@opendoor/shared";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

const g = global as typeof global & { _paidSeatQuantityColReady?: boolean };

export async function ensurePaidSeatQuantityColumn() {
  if (g._paidSeatQuantityColReady) return;
  const db = getDb();
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS paid_seat_quantity integer NOT NULL DEFAULT 1`);
  g._paidSeatQuantityColReady = true;
}

export async function persistPaidSeatQuantity(orgId: string, seats: number) {
  const qty = Math.max(1, Math.round(seats || 1));
  await ensurePaidSeatQuantityColumn();
  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { metadata: true },
  });
  const meta = (org?.metadata as Record<string, unknown>) || {};
  await db
    .update(organizations)
    .set({
      paidSeatQuantity: qty,
      metadata: { ...meta, paidSeatQuantity: qty },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
  return qty;
}

export function readPaidSeatQuantity(org: {
  paidSeatQuantity?: number | null;
  metadata?: unknown;
}): number {
  const fromCol = Number(org.paidSeatQuantity);
  if (Number.isFinite(fromCol) && fromCol > 0) return Math.round(fromCol);
  return paidSeatsFromMetadata(org.metadata) ?? 1;
}

export async function countOrgMembers(orgId: string) {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.organizationId, orgId));
  return Number(row?.n || 0);
}

export async function listPendingInvites(orgId: string) {
  const db = getDb();
  return db.query.invitations.findMany({
    where: and(eq(invitations.organizationId, orgId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())),
    columns: { id: true, email: true, role: true, token: true, createdAt: true, expiresAt: true },
  });
}

export async function countPendingInvitesNotInOrg(orgId: string, memberEmails?: Set<string>) {
  const pending = await listPendingInvites(orgId);
  if (!memberEmails) {
    const db = getDb();
    const members = await db.query.users.findMany({
      where: eq(users.organizationId, orgId),
      columns: { email: true },
    });
    memberEmails = new Set(members.map((m) => m.email.toLowerCase()));
  }
  return pending.filter((inv) => !memberEmails!.has(inv.email.toLowerCase())).length;
}

export async function loadOrgSeatState(orgId: string) {
  await ensurePaidSeatQuantityColumn();
  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      id: true,
      name: true,
      plan: true,
      paidSeatQuantity: true,
      metadata: true,
    },
  });
  if (!org) return null;

  const members = await db.query.users.findMany({
    where: eq(users.organizationId, orgId),
    columns: { id: true, email: true },
  });
  const memberEmails = new Set(members.map((m) => m.email.toLowerCase()));
  const pendingInviteCount = await countPendingInvitesNotInOrg(orgId, memberEmails);
  const extraSeatsCount = extraSeatsFromMetadata(org.metadata);
  const paidSeatQuantity = readPaidSeatQuantity(org);
  const plan = getPlan(org.plan);
  const maxSeats = resolveMaxSeats({
    plan: org.plan,
    extraSeatsCount,
    paidSeatQuantity,
  });
  const memberCount = members.length;
  const seatsUsed = occupiedSeats({ memberCount, pendingInviteCount });

  return {
    org,
    plan,
    extraSeatsCount,
    paidSeatQuantity,
    memberCount,
    pendingInviteCount,
    seatsUsed,
    maxSeats,
    atCap: seatsUsed >= maxSeats,
  };
}

export async function assertOrgCanInvite(orgId: string): Promise<
  | { ok: true; state: NonNullable<Awaited<ReturnType<typeof loadOrgSeatState>>> }
  | { ok: false; status: 400; decision: Extract<SeatInviteDecision, { ok: false }> }
> {
  const state = await loadOrgSeatState(orgId);
  if (!state) {
    return {
      ok: false,
      status: 400,
      decision: {
        ok: false,
        seatsUsed: 0,
        maxSeats: 0,
        error: "Organization not found",
        code: "seat_cap",
        useBilling: true,
      },
    };
  }
  const decision = evaluateSeatInvite({
    memberCount: state.memberCount,
    pendingInviteCount: state.pendingInviteCount,
    maxSeats: state.maxSeats,
  });
  if (!decision.ok) return { ok: false, status: 400, decision };
  return { ok: true, state };
}
