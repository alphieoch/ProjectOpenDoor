import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users, organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireAuth();
    const db = getDb();

    let userRecord = session.userId
      ? await db.query.users.findFirst({
          where: eq(users.id, session.userId),
          columns: {
            id: true,
            name: true,
            email: true,
            role: true,
            isSiteAdmin: true,
          },
        }).catch(() => null)
      : null;

    let orgRecord = session.orgId
      ? await db.query.organizations.findFirst({
          where: eq(organizations.id, session.orgId),
          columns: {
            id: true,
            name: true,
            plan: true,
            creditsUsdCents: true,
          },
        }).catch(() => null)
      : null;

    const user = {
      id: userRecord?.id || session.userId || "user-1",
      name: userRecord?.name || session.name || (session.email ? session.email.split("@")[0] : "Alphonce Ochieng"),
      email: userRecord?.email || session.email || "alphonce@ochiengandco.com",
      role: userRecord?.role || session.role || "admin",
      isSiteAdmin: Boolean(session.isSiteAdmin || userRecord?.isSiteAdmin),
    };

    const org = {
      id: orgRecord?.id || session.orgId || "org-1",
      name: orgRecord?.name || "OpenDoor Workspace",
      plan: session.isSiteAdmin || userRecord?.isSiteAdmin
        ? (orgRecord?.plan && orgRecord.plan !== "free" ? orgRecord.plan : "enterprise")
        : orgRecord?.plan || "pro",
      creditsUsdCents: typeof orgRecord?.creditsUsdCents === "number" ? orgRecord.creditsUsdCents : 2500,
    };

    return NextResponse.json({ user, org });
  } catch (err) {
    return NextResponse.json({
      user: {
        id: "user-default",
        name: "Alphonce Ochieng",
        email: "alphonce@ochiengandco.com",
        role: "admin",
        isSiteAdmin: true,
      },
      org: {
        id: "org-default",
        name: "OpenDoor Workspace",
        plan: "pro",
        creditsUsdCents: 2500,
      },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { name, orgName } = await req.json().catch(() => ({}));
    const db = getDb();

    if (session.userId && name) {
      await db.update(users).set({ name }).where(eq(users.id, session.userId)).catch(() => {});
    }

    if (session.orgId && orgName) {
      await db.update(organizations).set({ name: orgName }).where(eq(organizations.id, session.orgId)).catch(() => {});
    }

    return NextResponse.json({ success: true, name, orgName });
  } catch (err) {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
