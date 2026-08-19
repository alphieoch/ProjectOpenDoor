import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import DashboardSidebar from "@/components/ui/dashboard-sidebar";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { PostHogIdentify } from "@/components/PostHogIdentify";
import DashboardTools from "@/components/DashboardTopBar";
import { PageTransition } from "@/components/PageTransition";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { getDb } from "@/lib/db";
import { organizations, users } from "@opendoor/database";
import { eq } from "drizzle-orm";

interface LayoutProfileCache {
  onboardingSegment?: string;
  email: string;
  displayName: string;
  workspaceName: string;
  planLabel: string;
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
  let workspaceName = "OpenDoor";
  let planLabel = "Free plan";
  let enterpriseLocked = !session.isSiteAdmin;
  let protectedChild = false;

  try {
    const db = getDb();
    const [org, user] = await Promise.all([
      db.query.organizations.findFirst({
        where: eq(organizations.id, session.orgId),
        columns: { onboardingSegment: true, plan: true, name: true },
      }),
      db.query.users.findFirst({
        where: eq(users.id, session.userId),
        columns: { name: true, email: true, protectedChild: true },
      }),
    ]);
    onboardingSegment = org?.onboardingSegment;
    email = user?.email || session.email;
    displayName = user?.name || email;
    workspaceName = org?.name || displayName;
    const plan = (org?.plan || "free").trim();
    planLabel = `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan`;
    enterpriseLocked = !session.isSiteAdmin && plan.toLowerCase() !== "enterprise";
    protectedChild = Boolean(user?.protectedChild);
  } catch (err) {
    console.error("[dashboard layout] database unavailable", err);
  }

  const result: LayoutProfileCache = {
    onboardingSegment,
    email,
    displayName,
    workspaceName,
    planLabel,
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

  const { onboardingSegment, email, displayName, workspaceName, planLabel, enterpriseLocked, protectedChild } = await getCachedProfile({
    userId: session.userId,
    orgId: session.orgId as string,
    email: session.email,
    isSiteAdmin: session.isSiteAdmin,
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <PostHogIdentify
        userId={session.userId}
        email={session.email}
        orgId={session.orgId}
        role={session.role}
        isSiteAdmin={session.isSiteAdmin}
        impersonatingOrgId={session.impersonatingOrgId as string | undefined}
        onboardingSegment={onboardingSegment}
      />
      <DashboardSidebar
        email={email}
        displayName={displayName}
        workspaceName={workspaceName}
        planLabel={planLabel}
        enterpriseLocked={enterpriseLocked}
        protectedChild={protectedChild}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:ml-[260px]">
        {session.impersonatingOrgId && <ImpersonationBanner />}
        <DashboardTools />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background max-md:pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <MobileBottomNav
        email={email}
        displayName={displayName}
        enterpriseLocked={enterpriseLocked}
        protectedChild={protectedChild}
      />
    </div>
  );
}
