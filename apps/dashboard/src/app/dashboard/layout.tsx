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

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = getDb();
  const [org, user] = await Promise.all([
    db.query.organizations.findFirst({
      where: eq(organizations.id, session.orgId as string),
      columns: { onboardingSegment: true },
    }),
    db.query.users.findFirst({
      where: eq(users.id, session.userId),
      columns: { name: true, email: true },
    }),
  ]);
  const email = user?.email || session.email;
  const displayName = user?.name || email;

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--paper)" }}>
      <PostHogIdentify
        userId={session.userId}
        email={session.email}
        orgId={session.orgId}
        role={session.role}
        isSiteAdmin={session.isSiteAdmin}
        impersonatingOrgId={session.impersonatingOrgId as string | undefined}
        onboardingSegment={org?.onboardingSegment}
      />
      <SessionNavBar email={email} displayName={displayName} />
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
