import { getPlan } from "./plans.js";

export const SEAT_CAP_UPGRADE_COPY = "Upgrade on Billing to add seats.";
export const MAX_CHECKOUT_SEATS = 500;

export type SeatInviteDecision =
  | { ok: true; seatsUsed: number; maxSeats: number }
  | { ok: false; seatsUsed: number; maxSeats: number; error: string; code: "seat_cap"; useBilling: true };

export function extraSeatsFromMetadata(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 0;
  const raw = (metadata as Record<string, unknown>).extraSeatsCount;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
}

export function paidSeatsFromMetadata(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).paidSeatQuantity;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  return null;
}

export function resolveMaxSeats(opts: {
  plan: string | null | undefined;
  extraSeatsCount?: number | null;
  paidSeatQuantity?: number | null;
}): number {
  const def = getPlan(opts.plan);
  if (def.perSeat) {
    return Math.max(1, Math.round(Number(opts.paidSeatQuantity || 1)));
  }
  const base = def.maxSeats ?? 1;
  return base + Math.max(0, Math.round(Number(opts.extraSeatsCount || 0)));
}

export function occupiedSeats(opts: {
  memberCount: number;
  pendingInviteCount?: number;
}): number {
  return Math.max(0, Math.round(opts.memberCount || 0)) + Math.max(0, Math.round(opts.pendingInviteCount || 0));
}

export function seatCapError(maxSeats: number): string {
  return `All ${Math.max(0, maxSeats)} seats are occupied. ${SEAT_CAP_UPGRADE_COPY}`;
}

export function evaluateSeatInvite(opts: {
  memberCount: number;
  pendingInviteCount?: number;
  maxSeats: number;
}): SeatInviteDecision {
  const seatsUsed = occupiedSeats({
    memberCount: opts.memberCount,
    pendingInviteCount: opts.pendingInviteCount,
  });
  const maxSeats = Math.max(0, Math.round(opts.maxSeats || 0));
  if (seatsUsed >= maxSeats) {
    return {
      ok: false,
      seatsUsed,
      maxSeats,
      error: seatCapError(maxSeats),
      code: "seat_cap",
      useBilling: true,
    };
  }
  return { ok: true, seatsUsed, maxSeats };
}

export function checkoutSeatQuantity(plan: string | null | undefined, requested?: number | null): number {
  const def = getPlan(plan);
  if (!def.perSeat) return 1;
  const n = Number(requested);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_CHECKOUT_SEATS, Math.max(1, Math.round(n)));
}

export type MonthlySeatCapDecision =
  | { ok: true; remainingCents: number | null; capCents: number | null; usedCents: number }
  | {
      ok: false;
      error: string;
      remainingCents: 0;
      capCents: number;
      usedCents: number;
      monthlyCreditSubCapCents: number;
    };

export function evaluateMonthlySeatCap(opts: {
  monthlyCreditSubCapCents: number | null | undefined;
  usedCents: number;
  estimatedCostCents?: number;
}): MonthlySeatCapDecision {
  const usedCents = Math.max(0, Math.round(opts.usedCents || 0));
  const estimated = Math.max(0, Math.round(opts.estimatedCostCents || 0));
  if (opts.monthlyCreditSubCapCents == null || !Number.isFinite(Number(opts.monthlyCreditSubCapCents))) {
    return { ok: true, remainingCents: null, capCents: null, usedCents };
  }
  const capCents = Math.max(0, Math.round(Number(opts.monthlyCreditSubCapCents)));
  const remainingCents = Math.max(0, capCents - usedCents);
  if (usedCents + estimated > capCents || (estimated === 0 && usedCents >= capCents)) {
    return {
      ok: false,
      error: "Monthly seat credit cap reached",
      remainingCents: 0,
      capCents,
      usedCents,
      monthlyCreditSubCapCents: capCents,
    };
  }
  return { ok: true, remainingCents, capCents, usedCents };
}
