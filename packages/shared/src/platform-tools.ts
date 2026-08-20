/**
 * First-party tools OpenDoor ships (workflow + gateway plugins).
 * Dashboard Tools and the workflow editor share these ids — do not fork a second catalog.
 */

import { WEB_SEARCH_ADDON } from "./plans.js";

export type ToolBillingKind = "per_call" | "per_1k" | "monthly";
export type ToolFamily = "closed" | "open_weight";
export type ToolEntitlementStatus = "enabled" | "disabled";

export type PlatformTool = {
  id: string;
  name: string;
  description: string;
  group: "plugins" | "compute" | "media" | "files" | "ai";
  endpoint: string;
  family: ToolFamily;
  billing: {
    kind: ToolBillingKind;
    amountCents: number;
    unitLabel: string;
  };
  monthlyAddonId?: "web_search";
};

/** First-party OpenDoor Search — billed on org credits, run on our GCP Vertex stack. */
export const SEARCH_TOOL_ID = "search" as const;

/**
 * Vertex list (Google Cloud Agent Platform, Aug 2026) for `gemini-2.5-flash`
 * + Grounding with Google Search on project-800192c2-3ecc-4889-8f7.
 *
 * Flash: $0.30 / 1M input, $2.50 / 1M output (thinking included).
 * Grounding (Flash): $35 / 1,000 prompts after 1,500/day free = $0.035 / grounded prompt.
 * Typical call ≈ 1 grounding prompt + ~1.5k in / ~2.5k out ≈ $0.042.
 * List is $0.10 (~2.4×) so OpenDoor is not at a loss. Not a free-credit giveaway.
 */
export const SEARCH_GCP_FLASH_INPUT_PER_MILLION_USD = 0.3;
export const SEARCH_GCP_FLASH_OUTPUT_PER_MILLION_USD = 2.5;
export const SEARCH_GCP_GROUNDING_PER_PROMPT_USD = 0.035;
export const SEARCH_GCP_EXPECTED_COST_USD = 0.042;
export const SEARCH_QUERY_LIST_CENTS = 10;

/** Same ids as the workflow Tool node (`apps/dashboard/.../workflow/[id]/page.tsx`). */
export const PLATFORM_TOOLS: readonly PlatformTool[] = [
  {
    id: SEARCH_TOOL_ID,
    name: "OpenDoor Search",
    description:
      "Synthesize an answer with citations on OpenDoor’s GCP Vertex stack. Billed on your plan credits — no third-party search keys.",
    group: "ai",
    endpoint: "POST /api/tools/search",
    family: "closed",
    billing: { kind: "per_call", amountCents: SEARCH_QUERY_LIST_CENTS, unitLabel: "query" },
    monthlyAddonId: "web_search",
  },
  {
    id: "web_search",
    name: "Web Search",
    description: "Live Google results via Vertex AI Grounding on GCP.",
    group: "plugins",
    endpoint: "POST /v1/plugins/web-search",
    family: "closed",
    billing: { kind: "per_call", amountCents: SEARCH_QUERY_LIST_CENTS, unitLabel: "call" },
    monthlyAddonId: "web_search",
  },
  {
    id: "code_execution",
    name: "Code Execution",
    description: "Run JavaScript or Python in the workflow jail (gVisor / Firecracker / local).",
    group: "compute",
    endpoint: "POST /v1/workflows/:id/run",
    family: "open_weight",
    billing: { kind: "per_call", amountCents: 1, unitLabel: "run" },
  },
  {
    id: "document_analysis",
    name: "Document Analysis",
    description: "Read text from a file already stored on the gateway Files API (GCS).",
    group: "files",
    endpoint: "GET /v1/files/:id/content",
    family: "open_weight",
    billing: { kind: "per_call", amountCents: 1, unitLabel: "file" },
  },
  {
    id: "image_generation",
    name: "Image Generation",
    description: "Generate an image through the live gateway (Vertex / Studio path).",
    group: "media",
    endpoint: "POST /v1/images/generations",
    family: "closed",
    billing: { kind: "per_call", amountCents: 4, unitLabel: "image" },
  },
  {
    id: "data_extraction",
    name: "Data Extraction",
    description: "Embed text through the gateway Embeddings API for extraction and search.",
    group: "ai",
    endpoint: "POST /v1/embeddings",
    family: "closed",
    billing: { kind: "per_call", amountCents: 1, unitLabel: "request" },
  },
] as const;

export type PlatformToolId = (typeof PLATFORM_TOOLS)[number]["id"];

const TOOL_ID_ALIASES: Record<string, string> = {
  web_rag: SEARCH_TOOL_ID,
  answer_search: SEARCH_TOOL_ID,
};

export function resolvePlatformToolId(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return TOOL_ID_ALIASES[id] || id;
}

export function getPlatformTool(id: string | null | undefined): PlatformTool | undefined {
  const canonical = resolvePlatformToolId(id);
  if (!canonical) return undefined;
  return PLATFORM_TOOLS.find((tool) => tool.id === canonical);
}

export function isRagSearchToolId(id: string | null | undefined): boolean {
  return getPlatformTool(id)?.id === SEARCH_TOOL_ID;
}

export function ragSearchCoveredByTool(toolId: string | null | undefined): boolean {
  const id = resolvePlatformToolId(toolId);
  return id === SEARCH_TOOL_ID || id === "web_search";
}

export function isPlatformToolId(id: string): id is PlatformToolId {
  return Boolean(getPlatformTool(id));
}

export function isSearchToolId(id: string | null | undefined): id is typeof SEARCH_TOOL_ID {
  return getPlatformTool(id)?.id === SEARCH_TOOL_ID;
}

/** Search + live web results ship in the Enterprise tools pack. */
export const ENTERPRISE_INCLUDED_TOOL_IDS = [SEARCH_TOOL_ID, "web_search"] as const;

/** Web Search add-on (or Enterprise) covers OpenDoor Search and live web results. */
export function usesWebSearchAddon(tool: PlatformTool | undefined): boolean {
  return tool?.monthlyAddonId === "web_search";
}

export function toolIncludedWithEnterprise(tool: PlatformTool | undefined): boolean {
  return usesWebSearchAddon(tool);
}

export function formatUsdCents(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "$0";
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatToolCost(tool: PlatformTool): string {
  const amount = formatUsdCents(tool.billing.amountCents);
  if (tool.billing.kind === "per_1k") return `${amount} / 1k ${tool.billing.unitLabel}`;
  if (tool.billing.kind === "monthly") return `${amount} / month`;
  return `${amount} / ${tool.billing.unitLabel}`;
}

export function usageCostCents(tool: PlatformTool, units = 1): number {
  const n = Number.isFinite(units) ? Math.max(0, units) : 0;
  if (n <= 0) return 0;
  if (tool.billing.kind === "per_1k") {
    return Math.ceil(n / 1000) * tool.billing.amountCents;
  }
  return tool.billing.amountCents * Math.ceil(n);
}

export function searchQueryListCents(): number {
  return SEARCH_QUERY_LIST_CENTS;
}

/** Fail closed: unpaid orgs cannot run a search they cannot cover. Admins / add-on are $0. */
export function decideToolCharge(input: {
  tool: PlatformTool | undefined;
  unlimited?: boolean;
  coveredByAddon?: boolean;
  spendableCents: number;
  units?: number;
}): { ok: true; chargeCents: number } | { ok: false; error: string } {
  if (!input.tool) return { ok: false, error: "Tool not found" };
  if (input.unlimited || input.coveredByAddon) return { ok: true, chargeCents: 0 };
  const chargeCents = usageCostCents(input.tool, input.units ?? 1);
  if (chargeCents <= 0) return { ok: true, chargeCents: 0 };
  if (input.spendableCents >= chargeCents) return { ok: true, chargeCents };
  return {
    ok: false,
    error: `${input.tool.name} needs ${formatUsdCents(chargeCents)} spendable credit. Top up on Billing.`,
  };
}

export function monthlyAddonLabel(
  tool: PlatformTool,
  opts?: { includedInPlan?: boolean }
): string | null {
  if (tool.monthlyAddonId !== "web_search") return null;
  if (opts?.includedInPlan) return "Included with Enterprise";
  return `or $${WEB_SEARCH_ADDON.amountUsd}/month add-on`;
}

export function canConfirmEnable(input: {
  unlimited?: boolean;
  coveredByAddon?: boolean;
  spendableCents: number;
  usageCostCents: number;
  enableFeeCents?: number;
}): { ok: true } | { ok: false; error: string } {
  if (input.unlimited || input.coveredByAddon) return { ok: true };
  const fee = Math.max(0, input.enableFeeCents ?? 0);
  const need = fee + Math.max(0, input.usageCostCents);
  if (input.spendableCents >= need) return { ok: true };
  return {
    ok: false,
    error:
      need > 0
        ? `This tool needs at least ${formatUsdCents(need)} spendable credit. Top up on Billing.`
        : "Organization cannot spend.",
  };
}

export function decideToolEnable(input: {
  tool: PlatformTool | undefined;
  currentStatus: ToolEntitlementStatus | null;
  unlimited?: boolean;
  coveredByAddon?: boolean;
  spendableCents: number;
  enableFeeCents?: number;
}):
  | { ok: true; alreadyEnabled: boolean }
  | { ok: false; status: 404 | 402; error: string } {
  if (!input.tool) return { ok: false, status: 404, error: "Tool not found" };
  if (input.currentStatus === "enabled") return { ok: true, alreadyEnabled: true };
  const gate = canConfirmEnable({
    unlimited: input.unlimited,
    coveredByAddon: input.coveredByAddon,
    spendableCents: input.spendableCents,
    usageCostCents: usageCostCents(input.tool, 1),
    enableFeeCents: input.enableFeeCents,
  });
  if (!gate.ok) return { ok: false, status: 402, error: gate.error };
  return { ok: true, alreadyEnabled: false };
}

export function decideToolDisable(input: {
  currentStatus: ToolEntitlementStatus | null;
}): { ok: true; alreadyDisabled: boolean } | { ok: false; status: 404; error: string } {
  if (!input.currentStatus) return { ok: false, status: 404, error: "Tool is not enabled for this org" };
  if (input.currentStatus === "disabled") return { ok: true, alreadyDisabled: true };
  return { ok: true, alreadyDisabled: false };
}

export function nextToolStatus(
  current: ToolEntitlementStatus | null,
  action: "enable" | "disable"
): ToolEntitlementStatus {
  if (action === "enable") return "enabled";
  return current === "enabled" ? "disabled" : "disabled";
}
