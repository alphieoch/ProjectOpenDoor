import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users, organizations, invitations, creditTransactions } from "@opendoor/database";
import { and, eq, gte, sql } from "drizzle-orm";
import { DEFAULT_ALLOWED_CHAT_MODES, getPlan, resolveMaxSeats, extraSeatsFromMetadata } from "@opendoor/shared";
import { hashParentPin, isOrgOrganizer, verifyParentPin } from "@/lib/house-chat";
import { listCreditBuckets } from "@/lib/credit-ledger";
import { assertOrgCanInvite, countPendingInvitesNotInOrg } from "@/lib/seat-allocation";

export interface FamilyMember {
  id: string;
  name: string;
  email: string;
  role: "organizer" | "member";
  isExtraSeat?: boolean;
  avatarUrl?: string | null;
  joinedAt: string;
  monthlyQuotaCents: number | null;
  currentMonthSpentCents: number;
  protectedChild: boolean;
  allowedChatModes: string[];
}

function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const db = getDb();

    const orgRecord = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        id: true,
        name: true,
        plan: true,
        creditsUsdCents: true,
        metadata: true,
      },
    });

    if (!orgRecord) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const realUsers = await db.query.users.findMany({
      where: eq(users.organizationId, orgId),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        protectedChild: true,
        monthlyCreditSubCapCents: true,
        allowedChatModes: true,
      },
      orderBy: (users, { asc }) => [asc(users.createdAt)],
    });

    const plan = getPlan(orgRecord.plan);
    const meta = (orgRecord.metadata as Record<string, unknown>) || {};
    const extraSeatsCount = extraSeatsFromMetadata(meta);
    const isFamilyPlan = Boolean(plan.isPool);
    const baseSeats = plan.maxSeats ?? 1;
    const pendingInviteCount = await countPendingInvitesNotInOrg(
      orgId,
      new Set(realUsers.map((u) => u.email.toLowerCase())),
    );
    const totalAllowedSeats = resolveMaxSeats({
      plan: orgRecord.plan,
      extraSeatsCount,
    });
    const organizer = await isOrgOrganizer({
      userId: session.userId,
      orgId,
      role: session.role,
    });

    const spendRows = await db
      .select({
        userId: sql<string>`${creditTransactions.metadata}->>'userId'`,
        spent: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.amountCents} < 0 THEN -${creditTransactions.amountCents} ELSE 0 END), 0)`,
      })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.organizationId, orgId),
          gte(creditTransactions.createdAt, monthStartUtc()),
        ),
      )
      .groupBy(sql`${creditTransactions.metadata}->>'userId'`);
    const spentByUser = new Map(
      spendRows
        .filter((row) => row.userId)
        .map((row) => [row.userId, Number(row.spent || 0)]),
    );

    const members: FamilyMember[] = realUsers.map((u, index) => {
      const memberQuotas = (meta.memberQuotas as Record<string, number> | undefined) || {};
      return {
        id: u.id,
        name: u.name || u.email.split("@")[0],
        email: u.email,
        role: u.id === session.userId || u.role === "admin" || index === 0 ? "organizer" : "member",
        isExtraSeat: index >= baseSeats,
        avatarUrl: null,
        joinedAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
        monthlyQuotaCents:
          typeof u.monthlyCreditSubCapCents === "number"
            ? u.monthlyCreditSubCapCents
            : typeof memberQuotas[u.id] === "number"
              ? memberQuotas[u.id]
              : null,
        currentMonthSpentCents: spentByUser.get(u.id) || 0,
        protectedChild: Boolean(u.protectedChild),
        allowedChatModes:
          Array.isArray(u.allowedChatModes) && u.allowedChatModes.length
            ? u.allowedChatModes
            : [...DEFAULT_ALLOWED_CHAT_MODES],
      };
    });

    const buckets = await listCreditBuckets(orgId).catch(() => []);
    const now = Date.now();
    const monthStart = monthStartUtc().getTime();
    const creditBuckets = buckets.map((b) => ({
      id: b.id,
      bucketType: b.bucketType,
      initialAmountCents: b.initialAmountCents,
      remainingAmountCents: b.remainingAmountCents,
      currency: b.currency,
      expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
      createdAt: b.createdAt.toISOString(),
      expired: Boolean(b.expiresAt && b.expiresAt.getTime() <= now),
    }));
    const rolledOverCreditsCents = creditBuckets
      .filter(
        (b) =>
          b.bucketType === "subscription_grant" &&
          !b.expired &&
          b.remainingAmountCents > 0 &&
          new Date(b.createdAt).getTime() < monthStart,
      )
      .reduce((sum, b) => sum + b.remainingAmountCents, 0);

    return NextResponse.json({
      family: {
        isFamilyPlan,
        planId: orgRecord.plan,
        planName: plan.name,
        baseSeats,
        maxSeats: totalAllowedSeats,
        extraSeatsCount,
        maxExtraSeats: 0,
        extraSeatPriceGbp: null,
        extraSeatPriceUsd: null,
        totalAllowedSeats,
        seatsUsed: members.length + pendingInviteCount,
        pendingInviteCount,
        isOrganizer: organizer,
        totalPoolCreditsCents: Number(orgRecord.creditsUsdCents || 0),
        rolledOverCreditsCents,
        rolloverMonthsActive: plan.rolloverMonths ?? 0,
        rolloverMaxMonths: plan.rolloverMonths ?? 0,
        hasParentPin: Boolean(meta.parentPinHash),
        members,
        creditBuckets,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load family";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const db = getDb();

    const body = await req.json().catch(() => ({}));
    const { action, memberId, email, name, monthlyQuotaCents, protectedChild, pin, newPin } = body;

    const orgRecord = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!orgRecord) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const meta = (orgRecord.metadata as Record<string, unknown>) || {};

    const organizer = await isOrgOrganizer({
      userId: session.userId,
      orgId,
      role: session.role,
    });

    if (action === "set_parent_pin") {
      if (!organizer) return NextResponse.json({ error: "Only the organizer can set a parent PIN" }, { status: 403 });
      if (meta.parentPinHash && !verifyParentPin(String(pin || ""), String(meta.parentPinHash))) {
        return NextResponse.json({ error: "Current parent PIN is required" }, { status: 403 });
      }
      const next = String(newPin || pin || "");
      if (!/^\d{4,8}$/.test(next)) {
        return NextResponse.json({ error: "PIN must be 4–8 digits" }, { status: 400 });
      }
      const updatedMeta = { ...meta, parentPinHash: hashParentPin(next) };
      await db.update(organizations).set({ metadata: updatedMeta }).where(eq(organizations.id, orgId));
      return NextResponse.json({ success: true, hasParentPin: true });
    }

    if (action === "set_child") {
      if (!organizer) return NextResponse.json({ error: "Only the organizer can change child protection" }, { status: 403 });
      if (!memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });
      if (memberId === session.userId) {
        return NextResponse.json({ error: "You cannot mark yourself as a protected child" }, { status: 400 });
      }
      if (meta.parentPinHash && !verifyParentPin(String(pin || ""), String(meta.parentPinHash))) {
        return NextResponse.json({ error: "Parent PIN required" }, { status: 403 });
      }
      const target = await db.query.users.findFirst({
        where: and(eq(users.id, memberId), eq(users.organizationId, orgId)),
        columns: { id: true },
      });
      if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
      await db
        .update(users)
        .set({ protectedChild: Boolean(protectedChild), updatedAt: new Date() })
        .where(eq(users.id, memberId));
      return NextResponse.json({ success: true, protectedChild: Boolean(protectedChild) });
    }

    if (action === "add_extra_seat" || action === "remove_extra_seat") {
      return NextResponse.json(
        {
          error: "Extra seats are billed through a plan upgrade. Open Billing to change seats.",
          useBilling: true,
        },
        { status: 400 },
      );
    }

    if (action === "invite") {
      if (!organizer) {
        return NextResponse.json({ error: "Only the organizer can invite household members" }, { status: 403 });
      }
      if (!email) {
        return NextResponse.json({ error: "Email is required" }, { status: 400 });
      }

      const cap = await assertOrgCanInvite(orgId);
      if (!cap.ok) {
        return NextResponse.json(
          { error: cap.decision.error, code: cap.decision.code, useBilling: true },
          { status: 400 },
        );
      }

      const quotaCents =
        typeof monthlyQuotaCents === "number" && Number.isFinite(monthlyQuotaCents)
          ? Math.max(0, Math.round(monthlyQuotaCents))
          : null;

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(invitations).values({
        email,
        role: "member",
        organizationId: orgId,
        invitedBy: session.userId || undefined,
        token,
        expiresAt,
      });

      const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });
      let memberId = existingUser?.id;
      if (existingUser) {
        await db
          .update(users)
          .set({
            organizationId: orgId,
            monthlyCreditSubCapCents: quotaCents,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id));
      } else {
        const [created] = await db
          .insert(users)
          .values({
            email,
            name: name || email.split("@")[0],
            role: "member",
            organizationId: orgId,
            monthlyCreditSubCapCents: quotaCents,
          })
          .returning({ id: users.id });
        memberId = created?.id;
      }

      if (quotaCents != null) {
        const memberQuotas = (meta.memberQuotas as Record<string, number> | undefined) || {};
        const updatedMeta = {
          ...meta,
          memberQuotas: {
            ...memberQuotas,
            [email]: quotaCents,
            ...(memberId ? { [memberId]: quotaCents } : {}),
          },
        };
        await db.update(organizations).set({ metadata: updatedMeta }).where(eq(organizations.id, orgId));
      }

      return NextResponse.json({ success: true, email, monthlyQuotaCents: quotaCents });
    }

    if (action === "update_quota") {
      if (!organizer) {
        return NextResponse.json({ error: "Only the organizer can update seat caps" }, { status: 403 });
      }
      if (memberId) {
        const memberQuotas = (meta.memberQuotas as Record<string, number> | undefined) || {};
        const updatedMeta = { ...meta, memberQuotas: { ...memberQuotas, [memberId]: monthlyQuotaCents } };
        await db.update(organizations).set({ metadata: updatedMeta }).where(eq(organizations.id, orgId));
        await db
          .update(users)
          .set({
            monthlyCreditSubCapCents: typeof monthlyQuotaCents === "number" ? monthlyQuotaCents : null,
            updatedAt: new Date(),
          })
          .where(and(eq(users.id, memberId), eq(users.organizationId, orgId)));
      }
      return NextResponse.json({ success: true });
    }

    if (action === "remove") {
      if (!organizer) {
        return NextResponse.json({ error: "Only the organizer can remove household members" }, { status: 403 });
      }
      if (memberId) {
        await db
          .update(users)
          .set({ organizationId: null })
          .where(and(eq(users.id, memberId), eq(users.organizationId, orgId)));
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process family request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const db = getDb();
    const organizer = await isOrgOrganizer({
      userId: session.userId,
      orgId,
      role: session.role,
    });
    if (!organizer) {
      return NextResponse.json({ error: "Only the organizer can update seat controls" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    if (!memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });

    const target = await db.query.users.findFirst({
      where: and(eq(users.id, memberId), eq(users.organizationId, orgId)),
      columns: { id: true, allowedChatModes: true, monthlyCreditSubCapCents: true },
    });
    if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    const updates: {
      monthlyCreditSubCapCents?: number | null;
      allowedChatModes?: string[];
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if ("monthlyCreditSubCapCents" in body || "monthlyQuotaCents" in body) {
      const raw = body.monthlyCreditSubCapCents ?? body.monthlyQuotaCents;
      updates.monthlyCreditSubCapCents =
        raw == null || raw === "" ? null : Math.max(0, Math.round(Number(raw)));
    }
    if (Array.isArray(body.allowedChatModes)) {
      const next = body.allowedChatModes
        .map((m: unknown) => String(m).toLowerCase())
        .filter(
          (m: string) =>
            DEFAULT_ALLOWED_CHAT_MODES.includes(m as (typeof DEFAULT_ALLOWED_CHAT_MODES)[number]) ||
            m === "fast",
        );
      updates.allowedChatModes = next.length ? next : [...DEFAULT_ALLOWED_CHAT_MODES];
    }

    await db.update(users).set(updates).where(eq(users.id, memberId));
    const saved = await db.query.users.findFirst({
      where: eq(users.id, memberId),
      columns: {
        id: true,
        monthlyCreditSubCapCents: true,
        allowedChatModes: true,
      },
    });
    return NextResponse.json({ success: true, member: saved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update seat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
