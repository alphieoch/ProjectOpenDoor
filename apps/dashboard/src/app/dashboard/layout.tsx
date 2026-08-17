import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SessionNavBar } from "@/components/ui/sidebar";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { PostHogIdentify } from "@/components/PostHogIdentify";
import DashboardTopBar from "@/components/DashboardTopBar";
import { PageTransition } from "@/components/PageTransition";
import { getDb } from "@/lib/db";
import { organizations, users } from "@opendoor/database";
import { eq } from "drizzle-orm";

interface LayoutProfileCache {
  onboardingSegment?: string;
  email: string;
  displayName: string;
  enterpriseLocked: boolean;
  protectedChild: boolean;
  expiresAt: number;
}

const profileCache = new Map<string, LayoutProfileCache>();

async function getCachedProfile(session: {
  userId: string;
  orgId: string;
  email: string;
  isSiteAdmin?: boolean;
}) {
  const cacheKey = `${session.userId}:${session.orgId}:${session.isSiteAdmin}`;
  const hit = profileCache.get(cacheKey);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return hit;
  }

  let onboardingSegment: string | undefined;
  let email = session.email;
  let displayName = session.email;
  let enterpriseLocked = !session.isSiteAdmin;
  let protectedChild = false;

  try {
    const db = getDb();
    const [org, user] = await Promise.all([
      db.query.organizations.findFirst({
        where: eq(organizations.id, session.orgId),
        columns: { onboardingSegment: true, plan: true },
      }),
      db.query.users.findFirst({
        where: eq(users.id, session.userId),
        columns: { name: true, email: true, protectedChild: true },
      }),
    ]);
    onboardingSegment = org?.onboardingSegment;
    email = user?.email || session.email;
    displayName = user?.name || email;
    enterpriseLocked = !session.isSiteAdmin && (org?.plan || "").toLowerCase() !== "enterprise";
    protectedChild = Boolean(user?.protectedChild);
  } catch (err) {
    console.error("[dashboard layout] database unavailable", err);
  }

  const result: LayoutProfileCache = {
    onboardingSegment,
    email,
    displayName,
    enterpriseLocked,
    protectedChild,
    expiresAt: now + 60_000, // 60s fast-path cache
  };
  profileCache.set(cacheKey, result);
  return result;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { onboardingSegment, email, displayName, enterpriseLocked, protectedChild } = await getCachedProfile({
    userId: session.userId,
    orgId: session.orgId as string,
    email: session.email,
    isSiteAdmin: session.isSiteAdmin,
  });

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--paper)" }}>
      <PostHogIdentify
        userId={session.userId}
        email={session.email}
        orgId={session.orgId}
        role={session.role}
        isSiteAdmin={session.isSiteAdmin}
        impersonatingOrgId={session.impersonatingOrgId as string | undefined}
        onboardingSegment={onboardingSegment}
      />
      <SessionNavBar
        email={email}
        displayName={displayName}
        enterpriseLocked={enterpriseLocked}
        protectedChild={protectedChild}
        isSiteAdmin={session.isSiteAdmin}
      />
      <div style={{ marginLeft: "3.05rem", flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {session.impersonatingOrgId && <ImpersonationBanner />}
        <DashboardTopBar />
        <main
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background:
              "radial-gradient(1200px 480px at 10% -10%, color-mix(in srgb, var(--md-primary) 8%, transparent), transparent 60%), var(--paper)",
          }}
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
