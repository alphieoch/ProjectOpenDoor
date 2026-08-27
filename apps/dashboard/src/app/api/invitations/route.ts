import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { invitations, users, organizations } from "@opendoor/database";
import { eq, and, isNull, gt } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { sendEmail, buildInviteEmail } from "@/lib/email";
import { assertOrgCanInvite } from "@/lib/seat-allocation";
import { randomBytes } from "crypto";

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;

    const db = getDb();
    const rows = await db.query.invitations.findMany({
      where: and(
        eq(invitations.organizationId, orgId),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date())
      ),
      orderBy: (invitations, { desc }) => [desc(invitations.createdAt)],
    });

    return NextResponse.json({ invitations: rows });
  } catch (error: any) {
    console.error("Fetch invitations error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;

    // Only admins can invite
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email, role } = await req.json();
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const cap = await assertOrgCanInvite(orgId);
    if (!cap.ok) {
      return NextResponse.json(
        { error: cap.decision.error, code: cap.decision.code, useBilling: true },
        { status: 400 },
      );
    }

    const db = getDb();

    // Check if user already exists in org
    const existingUser = await db.query.users.findFirst({
      where: and(eq(users.email, email), eq(users.organizationId, orgId)),
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "User already in organization" },
        { status: 409 }
      );
    }

    // Check for existing pending invitation
    const existingInvite = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.email, email),
        eq(invitations.organizationId, orgId),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date())
      ),
    });
    if (existingInvite) {
      return NextResponse.json(
        { error: "Pending invitation already exists" },
        { status: 409 }
      );
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invite] = await db
      .insert(invitations)
      .values({
        organizationId: orgId,
        email,
        role: role || "member",
        token,
        invitedBy: session.sub as string,
        expiresAt,
      })
      .returning();

    // Send invitation email
    try {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { name: true },
      });
      const inviter = await db.query.users.findFirst({
        where: eq(users.id, session.sub as string),
        columns: { name: true, email: true },
      });

      const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite?token=${token}`;
      const { subject, html, text } = buildInviteEmail({
        inviteeEmail: email,
        orgName: org?.name || "OpenDoor",
        invitedByName: inviter?.name || inviter?.email || "A team member",
        inviteLink,
        role: role || "member",
      });

      await sendEmail({ to: email, subject, html, text });
    } catch (emailErr) {
      console.error("Failed to send invitation email:", emailErr);
      // Don't fail the invitation creation if email fails
    }

    await logAuditEvent({
      organizationId: orgId,
      userId: session.sub as string,
      action: "user.invited",
      entityType: "invitation",
      entityId: invite.id,
      metadata: { email, role: role || "member" },
    });

    return NextResponse.json({ invitation: invite });
  } catch (error: any) {
    console.error("Create invitation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create invitation" },
      { status: 500 }
    );
  }
}
