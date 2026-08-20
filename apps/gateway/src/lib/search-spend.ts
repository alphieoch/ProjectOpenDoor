import { db, organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import {
  SEARCH_TOOL_ID,
  decideToolCharge,
  getPlatformTool,
  splitCreditBuckets,
  spendableCents,
} from "@opendoor/shared";
import type { SearchSpendGate } from "@opendoor/shared/agent-tools";
import { webSearchAccess, webSearchAddonRequiredBody } from "./web-search-entitlement.js";
import { centsToUsd, debitUsage, orgHasUnlimitedSpend } from "../utils/billing.js";

type OrgRef = { id: string; plan?: string | null };

export async function orgSpendableClosedCents(orgId: string): Promise<number> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      creditsUsdCents: true,
      welcomeCreditsUsdCents: true,
      welcomeExpiresAt: true,
    },
  });
  if (!org) return 0;
  return spendableCents(splitCreditBuckets(org), false);
}

export async function authorizeGatewaySearch(org: OrgRef): Promise<
  | { ok: true; chargeCents: number; coveredByAddon: boolean }
  | { ok: false; status: 402; body: Record<string, unknown> }
> {
  const access = await webSearchAccess(org.id, org.plan);
  if (!access.ok) {
    return { ok: false, status: 402, body: webSearchAddonRequiredBody() };
  }
  const tool = getPlatformTool(SEARCH_TOOL_ID);
  const unlimited = await orgHasUnlimitedSpend(org);
  const coveredByAddon = access.via === "addon";
  const decision = decideToolCharge({
    tool,
    unlimited,
    coveredByAddon,
    spendableCents: await orgSpendableClosedCents(org.id),
  });
  if (!decision.ok) {
    return { ok: false, status: 402, body: { error: decision.error } };
  }
  return { ok: true, chargeCents: decision.chargeCents, coveredByAddon };
}

export async function settleGatewaySearch(org: OrgRef, chargeCents: number) {
  if (chargeCents <= 0) return;
  if (await orgHasUnlimitedSpend(org)) return;
  await debitUsage(org.id, centsToUsd(chargeCents), undefined, {
    plan: org.plan,
    family: "closed",
    providerSlug: "vertex",
    useFromPlan: false,
    useFromCredits: true,
  });
}

export function gatewaySearchSpend(org: OrgRef): SearchSpendGate {
  return {
    authorize: async () => {
      const gate = await authorizeGatewaySearch(org);
      if (!gate.ok) {
        const error =
          typeof gate.body.error === "string"
            ? gate.body.error
            : "OpenDoor Search needs spendable credit. Top up on Billing.";
        return { ok: false, error };
      }
      return { ok: true, chargeCents: gate.chargeCents };
    },
    settle: async (chargeCents) => {
      await settleGatewaySearch(org, chargeCents);
    },
  };
}
