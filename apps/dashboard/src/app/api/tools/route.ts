import { NextResponse } from "next/server";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { ensureEnterpriseToolBundle, listCatalogForOrg } from "@/lib/tools/entitlements";
import { loadWebSearchEntitlement } from "@/lib/web-search/entitlement";
import { assertOrgCanSpend, spendableFromWaterfall } from "@/lib/credits";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const [addon, afford] = await Promise.all([
    loadWebSearchEntitlement(orgId, session),
    assertOrgCanSpend(orgId, "closed", { isSiteAdmin: session.isSiteAdmin, userId: session.userId }),
  ]);
  if (addon.enterpriseTools) {
    await ensureEnterpriseToolBundle({
      orgId,
      userId: sessionActorId(session),
    });
  }
  const tools = await listCatalogForOrg(orgId, {
    addonActive: addon.active,
    includedInPlan: addon.includedInPlan,
    isSiteAdmin: session.isSiteAdmin,
  });
  return NextResponse.json({
    tools,
    spendableCents: afford.ok ? spendableFromWaterfall(afford.waterfall, "closed") : 0,
    unlimited: Boolean(afford.ok && afford.unlimited),
    webSearchAddon: addon,
    enterpriseTools: addon.enterpriseTools,
  });
}
