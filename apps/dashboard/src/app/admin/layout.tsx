import { getSession, requireSiteAdmin } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { PostHogIdentify } from "@/components/PostHogIdentify";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSiteAdmin();
  const session = await getSession();

  return (
    <div className="flex min-h-screen">
      {session ? (
        <PostHogIdentify
          userId={session.userId}
          email={session.email}
          orgId={session.orgId}
          role={session.role}
          isSiteAdmin={session.isSiteAdmin}
          impersonatingOrgId={session.impersonatingOrgId as string | undefined}
        />
      ) : null}
      <Sidebar isSiteAdmin={true} />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
