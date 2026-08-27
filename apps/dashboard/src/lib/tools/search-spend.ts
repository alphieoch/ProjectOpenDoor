import {
  SEARCH_TOOL_ID,
  decideToolCharge,
  getPlatformTool,
  usesWebSearchAddon,
} from "@opendoor/shared";
import type { SearchSpendGate } from "@opendoor/shared/agent-tools";
import { assertOrgCanSpend, spendableFromWaterfall } from "@/lib/credits";
import { chargeToolUsage, orgHasToolEnabled } from "@/lib/tools/entitlements";
import { loadWebSearchEntitlement } from "@/lib/web-search/entitlement";
import type { SessionPayload } from "@/lib/auth";

export async function authorizeOpenDoorSearch(input: {
  orgId: string;
  userId?: string | null;
  isSiteAdmin?: boolean;
  session?: SessionPayload;
  units?: number;
}): Promise<
  | { ok: true; chargeCents: number; coveredByAddon: boolean }
  | { ok: false; status: 402 | 404; error: string }
> {
  const tool = getPlatformTool(SEARCH_TOOL_ID);
  if (!tool) return { ok: false, status: 404, error: "Tool not found" };

  const addon = usesWebSearchAddon(tool)
    ? await loadWebSearchEntitlement(input.orgId, input.session)
    : null;
  const enabled = await orgHasToolEnabled(input.orgId, SEARCH_TOOL_ID);
  if (!enabled && !addon?.active) {
    return {
      ok: false,
      status: 402,
      error: `Enable ${tool.name} on Tools first, or subscribe to the monthly add-on.`,
    };
  }

  const afford = await assertOrgCanSpend(input.orgId, tool.family, {
    isSiteAdmin: input.isSiteAdmin,
    userId: input.userId,
  });
  const spendable = afford.ok ? spendableFromWaterfall(afford.waterfall, tool.family) : 0;
  const decision = decideToolCharge({
    tool,
    unlimited: Boolean(afford.ok && afford.unlimited),
    coveredByAddon: Boolean(addon?.active),
    spendableCents: spendable,
    units: input.units,
  });
  if (!decision.ok) return { ok: false, status: 402, error: decision.error };
  return {
    ok: true,
    chargeCents: decision.chargeCents,
    coveredByAddon: Boolean(addon?.active),
  };
}

export async function settleOpenDoorSearch(input: {
  orgId: string;
  userId?: string | null;
  isSiteAdmin?: boolean;
  coveredByAddon: boolean;
  units?: number;
}) {
  return chargeToolUsage({
    orgId: input.orgId,
    toolId: SEARCH_TOOL_ID,
    userId: input.userId,
    isSiteAdmin: input.isSiteAdmin,
    coveredByAddon: input.coveredByAddon,
    units: input.units,
  });
}

export function openDoorSearchSpend(input: {
  orgId: string;
  userId?: string | null;
  isSiteAdmin?: boolean;
  session?: SessionPayload;
}): SearchSpendGate {
  return {
    authorize: async () => {
      const gate = await authorizeOpenDoorSearch(input);
      if (!gate.ok) return { ok: false, error: gate.error };
      return { ok: true, chargeCents: gate.chargeCents };
    },
    settle: async () => {
      const gate = await authorizeOpenDoorSearch(input);
      if (!gate.ok) throw new Error(gate.error);
      const charge = await settleOpenDoorSearch({
        orgId: input.orgId,
        userId: input.userId,
        isSiteAdmin: input.isSiteAdmin,
        coveredByAddon: gate.coveredByAddon,
      });
      if ("error" in charge) throw new Error(charge.error);
    },
  };
}
