import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { isEnterprisePlan, workspaceHasEnterpriseTools } from "@opendoor/shared";
import type { SessionPayload } from "@/lib/auth";

export { isEnterprisePlan, workspaceHasEnterpriseTools };

export async function loadEnterpriseAccess(
  orgId: string,
  session?: Pick<SessionPayload, "isSiteAdmin">,
) {
  if (session?.isSiteAdmin) {
    return { active: true, plan: "enterprise", viaAdmin: true };
  }
  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { plan: true },
  });
  const plan = org?.plan || "free";
  return {
    active: workspaceHasEnterpriseTools({ plan }),
    plan,
    viaAdmin: false,
  };
}

export function enterpriseRequiredResponse() {
  return NextResponse.json(
    {
      error: "This is for Enterprise users only. Upgrade your plan to gain access.",
      code: "enterprise_required",
      upgrade: "/dashboard/settings?tab=billing",
      sales: "mailto:sales@opendoor.ai?subject=OpenDoor%20Enterprise",
    },
    { status: 403 },
  );
}
