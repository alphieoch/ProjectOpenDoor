import {
  SEARCH_TOOL_ID,
  formatToolCost,
  monthlyAddonLabel,
  toolIncludedWithEnterprise,
  usageCostCents,
  type PlatformTool,
  type ToolEntitlementStatus,
} from "@opendoor/shared";

export { SEARCH_TOOL_ID };

export function publicToolRow(
  tool: PlatformTool,
  entitlement: { status: ToolEntitlementStatus; enabledAt?: Date | string | null } | null,
  opts?: { addonActive?: boolean; includedInPlan?: boolean }
) {
  const included = Boolean(opts?.includedInPlan && toolIncludedWithEnterprise(tool));
  const enabled = entitlement?.status === "enabled";
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    group: tool.group,
    endpoint: tool.endpoint,
    family: tool.family,
    cost: {
      kind: tool.billing.kind,
      amountCents: included ? 0 : tool.billing.amountCents,
      unitLabel: tool.billing.unitLabel,
      label: included ? "Included" : formatToolCost(tool),
      perCallCents: included ? 0 : usageCostCents(tool, 1),
    },
    monthlyAddon: monthlyAddonLabel(tool, { includedInPlan: included }),
    addonActive: Boolean((opts?.addonActive || included) && tool.monthlyAddonId),
    includedInPlan: included,
    status: enabled ? ("enabled" as const) : ("available" as const),
    enabledAt: entitlement?.enabledAt ? new Date(entitlement.enabledAt).toISOString() : null,
  };
}
