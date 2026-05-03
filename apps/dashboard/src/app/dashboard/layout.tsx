import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SessionNavBar } from "@/components/ui/sidebar";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { PostHogIdentify } from "@/components/PostHogIdentify";
import DashboardTopBar from "@/components/DashboardTopBar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--paper)" }}>
      <PostHogIdentify
        userId={session.userId}
        email={session.email}
        orgId={session.orgId}
        role={session.role}
        isSiteAdmin={session.isSiteAdmin}
        impersonatingOrgId={session.impersonatingOrgId as string | undefined}
      />
      <SessionNavBar />
      <div style={{ marginLeft: 248, flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {session.impersonatingOrgId && <ImpersonationBanner />}
        <DashboardTopBar />
        <main style={{ flex: 1, overflowY: "auto", padding: "40px 56px 80px", background: "var(--paper)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
