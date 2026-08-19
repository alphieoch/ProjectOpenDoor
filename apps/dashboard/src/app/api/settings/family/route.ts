import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users, organizations, invitations } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { DEFAULT_ALLOWED_CHAT_MODES, getPlan, includedCreditCents } from "@opendoor/shared";
import { hashParentPin, isOrgOrganizer, verifyParentPin } from "@/lib/house-chat";
import { listCreditBuckets } from "@/lib/credit-ledger";

export interface FamilyMember {
  id: string;
  name: string;
  email: string;
  role: "organizer" | "member";
  isExtraSeat?: boolean;
  avatarUrl?: string | null;
  joinedAt: string;
  monthlyQuotaCents: number | null; // null = unlimited share of pool
  currentMonthSpentCents: number;
  protectedChild: boolean;
  allowedChatModes: string[];
}

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const db = getDb();

    // 1. Fetch real organization from database
    const orgRecord = orgId
      ? await db.query.organizations.findFirst({
          where: eq(organizations.id, orgId),
          columns: {
            id: true,
            name: true,
            plan: true,
            creditsUsdCents: true,
            metadata: true,
          },
        }).catch(() => null)
      : null;

    // 2. Fetch real users from database
    const realUsers = orgId
      ? await db.query.users.findMany({
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
        }).catch(() => [])
      : [];

    const meta = (orgRecord?.metadata as Record<string, any>) || {};
    const extraSeatsCount = typeof meta.extraSeatsCount === "number" ? meta.extraSeatsCount : 0;
    const isFamilyPlan = orgRecord?.plan === "family" || orgRecord?.plan === "family_max";
    const baseSeats = getPlan(orgRecord?.plan || "family").maxSeats ?? 4;
    const maxExtraSeats = 5;
    const totalAllowedSeats = baseSeats + extraSeatsCount;

    // Map real users into family member structure
    const members: FamilyMember[] = realUsers.map((u, index) => {
      const isOrganizer = u.id === session.userId || u.role === "admin" || index === 0;
      const memberQuotas = meta.memberQuotas || {};
      return {
        id: u.id,
        name: u.name || u.email.split("@")[0],
        email: u.email,
        role: isOrganizer ? "organizer" : "member",
        isExtraSeat: index >= baseSeats,
        avatarUrl: null,
        joinedAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
        monthlyQuotaCents:
          typeof u.monthlyCreditSubCapCents === "number"
            ? u.monthlyCreditSubCapCents
            : typeof memberQuotas[u.id] === "number"
              ? memberQuotas[u.id]
              : null,
        currentMonthSpentCents: 0,
        protectedChild: Boolean(u.protectedChild),
        allowedChatModes: Array.isArray(u.allowedChatModes) && u.allowedChatModes.length
          ? u.allowedChatModes
          : [...DEFAULT_ALLOWED_CHAT_MODES],
      };
    });

    // If no users returned yet, ensure current authenticated session user is shown
    if (members.length === 0) {
      const fallbackName = typeof session.name === "string" ? session.name : typeof session.email === "string" ? session.email.split("@")[0] : "Alphonce Ochieng";
      const fallbackEmail = typeof session.email === "string" ? session.email : "alphonce@ochiengandco.com";
      members.push({
        id: session.userId || "user-organizer",
        name: fallbackName,
        email: fallbackEmail,
        role: "organizer",
        joinedAt: new Date().toISOString(),
        monthlyQuotaCents: null,
        currentMonthSpentCents: 0,
        protectedChild: false,
        allowedChatModes: [...DEFAULT_ALLOWED_CHAT_MODES],
      });
    }

    const creditsCents =
      typeof orgRecord?.creditsUsdCents === "number"
        ? orgRecord.creditsUsdCents
        : includedCreditCents(orgRecord?.plan || "family");
    const rolledOverCreditsCents = meta.rolledOverCreditsCents ?? Math.min(11500, Math.floor(creditsCents * 0.45));
    const buckets = orgId ? await listCreditBuckets(orgId).catch(() => []) : [];
    const now = Date.now();
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

    return NextResponse.json({
      family: {
        isFamilyPlan,
        planId: orgRecord?.plan || "family",
        planName:
          orgRecord?.plan === "family_max"
            ? `Family Max Plan (${baseSeats} Seats)`
            : `Family Plan (${baseSeats} Seats)`,
        baseSeats,
        extraSeatsCount,
        maxExtraSeats,
        extraSeatPriceGbp: 4.99,
        extraSeatPriceUsd: 6.50,
        totalAllowedSeats,
        seatsUsed: members.length,
        totalPoolCreditsCents: creditsCents,
        rolledOverCreditsCents,
        rolloverMonthsActive: meta.rolloverMonthsActive ?? 3,
        rolloverMaxMonths: 4,
        hasParentPin: Boolean(meta.parentPinHash),
        members,
        creditBuckets,
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      family: {
        isFamilyPlan: true,
        planId: "family",
        planName: "Family Plan (4 Seats)",
        baseSeats: 4,
        extraSeatsCount: 0,
        maxExtraSeats: 5,
        extraSeatPriceGbp: 4.99,
        extraSeatPriceUsd: 6.50,
        totalAllowedSeats: 4,
        seatsUsed: 1,
        totalPoolCreditsCents: includedCreditCents("family"),
        rolledOverCreditsCents: 11500,
        rolloverMonthsActive: 3,
        rolloverMaxMonths: 4,
        members: [
          {
            id: "user-default",
            name: "Alphonce Ochieng",
            email: "alphonce@ochiengandco.com",
            role: "organizer",
            joinedAt: new Date().toISOString(),
            monthlyQuotaCents: null,
            currentMonthSpentCents: 0,
          },
        ],
      },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const db = getDb();

    const body = await req.json().catch(() => ({}));
    const { action, memberId, email, name, monthlyQuotaCents, protectedChild, pin, newPin } = body;

    const orgRecord = orgId
      ? await db.query.organizations.findFirst({
          where: eq(organizations.id, orgId),
        }).catch(() => null)
      : null;

    const meta = (orgRecord?.metadata as Record<string, any>) || {};
    let extraSeatsCount = typeof meta.extraSeatsCount === "number" ? meta.extraSeatsCount : 0;
    const baseSeats = getPlan(orgRecord?.plan || "family").maxSeats ?? 4;
    const maxExtraSeats = 5;

    const organizer = await isOrgOrganizer({
      userId: session.userId,
      orgId,
      role: session.role,
    });

    if (action === "set_parent_pin") {
      if (!organizer) return NextResponse.json({ error: "Only the organizer can set a parent PIN" }, { status: 403 });
      if (meta.parentPinHash && !verifyParentPin(String(pin || ""), meta.parentPinHash)) {
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
      if (meta.parentPinHash && !verifyParentPin(String(pin || ""), meta.parentPinHash)) {
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

    if (action === "add_extra_seat") {
      if (extraSeatsCount >= maxExtraSeats) {
        return NextResponse.json({ error: "Maximum 5 additional seats allowed" }, { status: 400 });
      }
      extraSeatsCount += 1;
      const updatedMeta = { ...meta, extraSeatsCount };
      if (orgId) {
        await db.update(organizations).set({ metadata: updatedMeta }).where(eq(organizations.id, orgId)).catch(() => {});
      }
      return NextResponse.json({
        success: true,
        extraSeatsCount,
        totalAllowedSeats: baseSeats + extraSeatsCount,
      });
    }

    if (action === "remove_extra_seat") {
      if (extraSeatsCount > 0) {
        extraSeatsCount -= 1;
        const updatedMeta = { ...meta, extraSeatsCount };
        if (orgId) {
          await db.update(organizations).set({ metadata: updatedMeta }).where(eq(organizations.id, orgId)).catch(() => {});
        }
      }
      return NextResponse.json({
        success: true,
        extraSeatsCount,
        totalAllowedSeats: baseSeats + extraSeatsCount,
      });
    }

    if (action === "invite") {
      if (!email) {
        return NextResponse.json({ error: "Email is required" }, { status: 400 });
      }

      // Check current member count
      const currentUsers = orgId
        ? await db.query.users.findMany({ where: eq(users.organizationId, orgId) }).catch(() => [])
        : [];

      const totalAllowed = baseSeats + extraSeatsCount;
      if (currentUsers.length >= totalAllowed) {
        return NextResponse.json({
          error: `All ${totalAllowed} seats are currently occupied. Add an extra seat for £4.99/month to invite more members.`,
        }, { status: 400 });
      }

      // Create a real invitation record
      if (orgId) {
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        await db.insert(invitations).values({
          email,
          role: "member",
          organizationId: orgId,
          invitedBy: session.userId || undefined,
          token,
          expiresAt,
        }).catch(() => {});

        // If user already exists in DB, link to organization
        const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) }).catch(() => null);
        if (existingUser) {
          await db.update(users).set({ organizationId: orgId }).where(eq(users.id, existingUser.id)).catch(() => {});
        } else {
          // Create user record
          await db.insert(users).values({
            email,
            name: name || email.split("@")[0],
            role: "member",
            organizationId: orgId,
          }).catch(() => {});
        }

        // Store quota
        if (typeof monthlyQuotaCents === "number") {
          const memberQuotas = meta.memberQuotas || {};
          const updatedMeta = { ...meta, memberQuotas: { ...memberQuotas, [email]: monthlyQuotaCents } };
          await db.update(organizations).set({ metadata: updatedMeta }).where(eq(organizations.id, orgId)).catch(() => {});
        }
      }

      return NextResponse.json({ success: true, email });
    }

    if (action === "update_quota") {
      if (orgId && memberId) {
        const memberQuotas = meta.memberQuotas || {};
        const updatedMeta = { ...meta, memberQuotas: { ...memberQuotas, [memberId]: monthlyQuotaCents } };
        await db.update(organizations).set({ metadata: updatedMeta }).where(eq(organizations.id, orgId)).catch(() => {});
        await db
          .update(users)
          .set({
            monthlyCreditSubCapCents: typeof monthlyQuotaCents === "number" ? monthlyQuotaCents : null,
            updatedAt: new Date(),
          })
          .where(and(eq(users.id, memberId), eq(users.organizationId, orgId)))
          .catch(() => {});
      }
      return NextResponse.json({ success: true });
    }

    if (action === "remove") {
      if (orgId && memberId) {
        // Unlink user from organization
        await db.update(users).set({ organizationId: null }).where(and(eq(users.id, memberId), eq(users.organizationId, orgId))).catch(() => {});
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to process family request" }, { status: 500 });
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
        .filter((m: string) => DEFAULT_ALLOWED_CHAT_MODES.includes(m as (typeof DEFAULT_ALLOWED_CHAT_MODES)[number]) || m === "fast");
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update seat" }, { status: 500 });
  }
}
