import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { invitations, users } from "@opendoor/database";
import { eq, and, isNull, gt } from "drizzle-orm";
import { createToken } from "@/lib/auth";
import { applySessionCookies, cookieSecureFromRequest } from "@/lib/session-cookie";
import { publicErrorMessage } from "@/lib/client-error";
import { logAuditEvent } from "@/lib/audit";
import { evaluateSeatInvite } from "@opendoor/shared";
import { loadOrgSeatState } from "@/lib/seat-allocation";

export async function POST(req: NextRequest) {
  try {
    const { token: inviteToken, name, password } = await req.json();

    if (!inviteToken || !name || !password) {
      return NextResponse.json(
        { error: "Token, name, and password are required" },
        { status: 400 }
      );
    }

    const db = getDb();

    const invite = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.token, inviteToken),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date())
      ),
    });

    if (!invite) {
      return NextResponse.json(
      { error: "Invalid or expired invitation" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, invite.email),
    });

    const alreadyInOrg = existingUser?.organizationId === invite.organizationId;
    if (!alreadyInOrg) {
      const seats = await loadOrgSeatState(invite.organizationId);
      if (seats) {
        const decision = evaluateSeatInvite({
          memberCount: seats.memberCount,
          pendingInviteCount: Math.max(0, seats.pendingInviteCount - 1),
          maxSeats: seats.maxSeats,
        });
        if (!decision.ok) {
          return NextResponse.json(
            { error: decision.error, code: decision.code, useBilling: true },
            { status: 400 },
          );
        }
      }
    }

    let user = existingUser;

    if (!user) {
      // Create new user
      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(password, 12);

      const [newUser] = await db
        .insert(users)
        .values({
          email: invite.email,
          name,
          passwordHash,
          organizationId: invite.organizationId,
          role: invite.role,
        })
        .returning();

      user = newUser;
    } else if (user.organizationId !== invite.organizationId) {
      return NextResponse.json(
        { error: "User already belongs to another organization" },
        { status: 409 }
      );
    }

    // Mark invitation as accepted
    await db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invite.id));

    await logAuditEvent({
      organizationId: invite.organizationId,
      userId: user.id,
      action: "user.invitation_accepted",
      entityType: "invitation",
      entityId: invite.id,
      metadata: { email: invite.email },
    });

    // Create session
    const token = await createToken({
      sub: user.id,
      email: user.email,
      orgId: user.organizationId,
      role: user.role,
    });

    const response = NextResponse.json({ success: true });
    applySessionCookies(response, token, 60 * 60 * 24 * 7, cookieSecureFromRequest(req));

    return response;
  } catch (error: unknown) {
    console.error("Accept invitation error:", error);
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to accept invitation") },
      { status: 500 }
    );
  }
}
