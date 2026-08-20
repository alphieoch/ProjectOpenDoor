import {
  formatToolCost,
  monthlyAddonLabel,
  usageCostCents,
  type PlatformTool,
  type ToolEntitlementStatus,
} from "@opendoor/shared";

export function publicToolRow(
  tool: PlatformTool,
  entitlement: { status: ToolEntitlementStatus; enabledAt?: Date | string | null } | null,
  opts?: { addonActive?: boolean }
) {
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
      amountCents: tool.billing.amountCents,
      unitLabel: tool.billing.unitLabel,
      label: formatToolCost(tool),
      perCallCents: usageCostCents(tool, 1),
    },
    monthlyAddon: monthlyAddonLabel(tool),
    addonActive: Boolean(opts?.addonActive && tool.monthlyAddonId),
    status: enabled ? ("enabled" as const) : ("available" as const),
    enabledAt: entitlement?.enabledAt ? new Date(entitlement.enabledAt).toISOString() : null,
  };
}
