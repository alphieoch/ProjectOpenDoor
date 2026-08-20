import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { invitations, users } from "@opendoor/database";
import { eq, and, isNull, gt } from "drizzle-orm";
import { createToken } from "@/lib/auth";
import { applySessionCookies } from "@/lib/session-cookie";
import { logAuditEvent } from "@/lib/audit";

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
    applySessionCookies(response, token);

    return response;
  } catch (error: any) {
    console.error("Accept invitation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
