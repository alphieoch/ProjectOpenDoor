import { getDb } from "@/lib/db";
import { users, organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { createToken, type SessionPayload } from "@/lib/auth";

export type WorkOSAuthUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

function displayName(user: WorkOSAuthUser) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email.split("@")[0] || user.email;
}

/**
 * Upsert an OpenDoor user/org from a WorkOS AuthKit user and return a JWT session.
 * Keeps the rest of the dashboard on the existing `session` cookie contract.
 */
export async function syncWorkOSUserToSession(
  workosUser: WorkOSAuthUser
): Promise<{ token: string; session: SessionPayload; isNew: boolean }> {
  const db = getDb();
  const email = workosUser.email.toLowerCase().trim();
  const name = displayName(workosUser);

  let user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  let isNew = false;

  if (!user) {
    isNew = true;
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    let slug = baseSlug || "org";
    let suffix = 1;
    while (true) {
      const existingOrg = await db.query.organizations.findFirst({
        where: eq(organizations.slug, slug),
      });
      if (!existingOrg) break;
      slug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    const [org] = await db
      .insert(organizations)
      .values({
        name: `${name}'s Organization`,
        slug,
        plan: "free",
        creditsUsdCents: 0,
        welcomeCreditsUsdCents: 0,
        signupCreditGranted: false,
        metadata: {
          onboarding_checklist: {},
          provisioned_via: "workos_authkit",
          workos_user_id: workosUser.id,
        },
      })
      .returning();

    const [created] = await db
      .insert(users)
      .values({
        email,
        name,
        organizationId: org.id,
        role: "admin",
        passwordHash: null,
      })
      .returning();
    user = created;
  } else if (!user.name && name) {
    await db
      .update(users)
      .set({ name, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    user = { ...user, name };
  }

  if (!user.organizationId) {
    throw new Error("User has no organization");
  }

  const session: SessionPayload = {
    userId: user.id,
    email: user.email,
    orgId: user.organizationId,
    role: user.role,
    isSiteAdmin: user.isSiteAdmin ?? false,
  };

  const token = await createToken({
    sub: user.id,
    userId: user.id,
    email: user.email,
    orgId: user.organizationId,
    role: user.role,
    isSiteAdmin: user.isSiteAdmin ?? false,
  });

  return { token, session, isNew };
}

export function sessionCookieOptions(maxAge = 60 * 60 * 24 * 7) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}
