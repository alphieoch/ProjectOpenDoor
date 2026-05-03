import { getSession, requireSiteAdmin } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { PostHogIdentify } from "@/components/PostHogIdentify";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSiteAdmin();
  const session = await getSession();
  const db = getDb();
  const org = session
    ? await db.query.organizations.findFirst({
        where: eq(organizations.id, session.orgId as string),
        columns: { onboardingSegment: true },
      })
    : null;

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
          onboardingSegment={org?.onboardingSegment}
        />
      ) : null}
      <Sidebar isSiteAdmin={true} />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
