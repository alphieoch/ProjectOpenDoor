import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users, organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { getPlan, persistWorldPreference } from "@opendoor/shared";
import { applyWorldCookies } from "@/lib/i18n/cookies";
import { persistWorldToWorkspace, worldFromOrg } from "@/lib/i18n/persist";

export async function GET() {
  try {
    const session = await requireAuth();
    const db = getDb();

    const userRecord = session.userId
      ? await db.query.users.findFirst({
          where: eq(users.id, session.userId),
          columns: {
            id: true,
            name: true,
            email: true,
            role: true,
            isSiteAdmin: true,
          },
        })
      : null;

    const orgRecord = session.orgId
      ? await db.query.organizations.findFirst({
          where: eq(organizations.id, session.orgId),
          columns: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            creditsUsdCents: true,
            ssoEnabled: true,
            ssoDefaultRole: true,
            workosOrganizationId: true,
            workosConnectionId: true,
            customDomain: true,
            customDomainVerified: true,
            emailNotificationsEnabled: true,
            notifyOnInvites: true,
            notifyOnBillingAlerts: true,
            metadata: true,
          },
        })
      : null;

    const world = worldFromOrg(orgRecord);
    return NextResponse.json({
      user: {
        id: userRecord?.id || session.userId,
        name: userRecord?.name || (typeof session.name === "string" ? session.name : null),
        email: userRecord?.email || session.email,
        role: userRecord?.role || session.role,
        isSiteAdmin: Boolean(session.isSiteAdmin || userRecord?.isSiteAdmin),
        locale: world.locale,
      },
      org: orgRecord
        ? {
            ...orgRecord,
            planName: getPlan(orgRecord.plan).name,
            region: world.region,
            country: world.country,
          }
        : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load profile";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { name, orgName, locale, region, country } = await req.json().catch(() => ({}));
    const db = getDb();

    if (session.userId && name) {
      await db
        .update(users)
        .set({ name: String(name), updatedAt: new Date() })
        .where(eq(users.id, session.userId));
    }
    if (session.orgId && orgName) {
      await db
        .update(organizations)
        .set({ name: String(orgName), updatedAt: new Date() })
        .where(eq(organizations.id, session.orgId));
    }
    if (locale !== undefined || region !== undefined || country !== undefined) {
      const preference = persistWorldPreference({ locale, region, country });
      await persistWorldToWorkspace({
        userId: session.userId,
        orgId: session.orgId,
        preference,
      });
      const response = NextResponse.json({ success: true, ...preference });
      applyWorldCookies(response, preference, req.nextUrl.protocol === "https:");
      return response;
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
