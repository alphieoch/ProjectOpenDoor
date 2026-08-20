import { isInternalApiKeyName } from "@/lib/onboarding";

export const RECENT_ACTIVITY_LIMIT = 10;

export type ActivityKind =
  | "audit"
  | "request"
  | "agent"
  | "training"
  | "workflow"
  | "chat";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  href: string;
  actor: string | null;
  detail: string | null;
};

export type AuditActivityRow = {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: unknown;
  createdAt: Date | string;
  userName?: string | null;
  userEmail?: string | null;
};

export type RequestActivityRow = {
  id: string;
  modelId: string;
  requestType: string;
  status: string;
  createdAt: Date | string;
  apiKeyName?: string | null;
};

export type AgentActivityRow = {
  id: string;
  name: string;
  runtime: string;
  lastUsedAt: Date | string | null;
};

export type TrainingActivityRow = {
  id: string;
  name: string;
  status: string;
  method?: string | null;
  baseModelId?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
  finishedAt?: Date | string | null;
};

export type WorkflowActivityRow = {
  id: string;
  status: string;
  workflowId: string;
  workflowName: string;
  createdAt: Date | string;
  completedAt?: Date | string | null;
};

export type ChatActivityRow = {
  id: string;
  chatTitle?: string | null;
  createdAt: Date | string;
  userName?: string | null;
  userEmail?: string | null;
};

const AUDIT_TITLES: Record<string, string> = {
  "api_key.created": "Created an API key",
  "api_key.revoked": "Revoked an API key",
  "user.login": "Signed in",
  "user.logout": "Signed out",
  "user.invited": "Invited a teammate",
  "user.invitation_accepted": "Accepted an invitation",
  "sso.enabled": "Enabled SSO",
  "sso.disabled": "Disabled SSO",
  "sso.configured": "Configured SSO",
  "billing.checkout_started": "Started checkout",
  "billing.subscription_updated": "Updated the subscription",
  "billing.portal_opened": "Opened the billing portal",
  "organization.updated": "Updated the organization",
  "settings.updated": "Updated settings",
  "deployment.created": "Created a deployment",
  "deployment.updated": "Updated a deployment",
  "deployment.deleted": "Deleted a deployment",
  "deployment.lora_loaded": "Loaded a LoRA on a deployment",
  "deployment.lora_unloaded": "Unloaded a LoRA from a deployment",
  "deployment.router_created": "Created a router",
  "deployment.router_deleted": "Deleted a router",
  "governance.policy.created": "Created a governance policy",
  "governance.policy.updated": "Updated a governance policy",
  "governance.policy.deleted": "Deleted a governance policy",
  "governance.approval.requested": "Requested a model approval",
  "governance.approval.reviewed": "Reviewed a model approval",
  "governance.violation.resolved": "Resolved a policy violation",
  "governance.model.created": "Added a governed model",
  "governance.model.updated": "Updated a governed model",
  "governance.model.deleted": "Removed a governed model",
  "governance.evaluation.created": "Started a governance evaluation",
  "governance.compliance.updated": "Updated compliance settings",
  "governance.compliance.report.generated": "Generated a compliance report",
  "governance.sector_template.created": "Created a sector template",
  "governance.sector_pack.applied": "Applied a sector pack",
  "device_inventory.consented": "Granted device inventory access",
  "device_inventory.withdrawn": "Withdrew device inventory access",
  "agent.created": "Created a coworker",
  "agent.updated": "Updated a coworker",
  "agent.started": "Started a coworker",
  "agent.stopped": "Stopped a coworker",
  "agent.deleted": "Removed a coworker",
  "agent.restored": "Restored a coworker",
  "byok.created": "Added a BYOK credential",
  "byok.revoked": "Revoked a BYOK credential",
  "premium.rental.created": "Started a premium rental",
  "premium.rental.stopped": "Stopped a premium rental",
  "tool.enabled": "Enabled a tool",
  "tool.disabled": "Disabled a tool",
};

const SESSION_AUDIT_ACTIONS = new Set(["user.login", "user.logout"]);

export function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

export function actorLabel(name?: string | null, email?: string | null): string | null {
  const display = (name || "").trim() || (email || "").trim();
  return display || null;
}

export function formatActivityWhen(
  iso: string,
  nowMs = Date.now()
): { label: string; absolute: string } {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return { label: "Unknown time", absolute: "" };
  }
  const absolute = new Date(then).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const diff = Math.max(0, nowMs - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return { label: "Just now", absolute };
  if (diff < hour) return { label: `${Math.floor(diff / minute)}m ago`, absolute };
  if (diff < day) return { label: `${Math.floor(diff / hour)}h ago`, absolute };
  if (diff < 7 * day) return { label: `${Math.floor(diff / day)}d ago`, absolute };
  return { label: absolute, absolute };
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function humanizeAction(action: string): string {
  return action
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function auditActivityHref(
  action: string,
  opts?: { entityId?: string | null; metadata?: unknown }
): string {
  if (action.startsWith("api_key.")) return "/dashboard/api-keys";
  if (action.startsWith("billing.")) return "/dashboard/billing";
  if (action.startsWith("user.invit")) return "/dashboard/team";
  if (
    action.startsWith("sso.") ||
    action.startsWith("settings.") ||
    action.startsWith("organization.") ||
    action.startsWith("byok.") ||
    action.startsWith("device_inventory.")
  ) {
    return "/dashboard/settings";
  }
  if (action.startsWith("deployment.")) return "/dashboard/deployments";
  if (action.startsWith("premium.")) return "/dashboard/premium";
  if (action.startsWith("tool.")) return "/dashboard/tools";
  if (action.startsWith("governance.")) {
    if (action.includes("approval")) return "/dashboard/governance/approvals";
    if (action.includes("violation")) return "/dashboard/governance/violations";
    return "/dashboard/governance";
  }
  if (action.startsWith("agent.")) {
    const runtime = String(metadataRecord(opts?.metadata).runtime || "");
    if (opts?.entityId && action !== "agent.deleted") {
      return runtime === "openbot"
        ? `/dashboard/openbot/${opts.entityId}`
        : `/dashboard/agents/${opts.entityId}`;
    }
    return "/dashboard/openbot";
  }
  return "/dashboard/audit-logs";
}

export function activityFromAudit(row: AuditActivityRow): ActivityItem | null {
  if (SESSION_AUDIT_ACTIONS.has(row.action)) return null;
  const at = toIso(row.createdAt);
  if (!at) return null;
  const meta = metadataRecord(row.metadata);
  const named = typeof meta.name === "string" ? meta.name.trim() : "";
  return {
    id: `audit:${row.id}`,
    kind: "audit",
    at,
    title: AUDIT_TITLES[row.action] || humanizeAction(row.action),
    href: auditActivityHref(row.action, { entityId: row.entityId, metadata: row.metadata }),
    actor: actorLabel(row.userName, row.userEmail),
    detail: named || (row.entityType ? row.entityType : null),
  };
}

export function isGatewayRequestVisible(apiKeyName?: string | null): boolean {
  return !isInternalApiKeyName(apiKeyName);
}

export function activityFromRequest(row: RequestActivityRow): ActivityItem | null {
  if (!isGatewayRequestVisible(row.apiKeyName)) return null;
  const at = toIso(row.createdAt);
  if (!at) return null;
  const model = row.modelId || "a model";
  const titles: Record<string, string> = {
    image: `Generated an image with ${model}`,
    embedding: `Embedded text with ${model}`,
    rerank: `Reranked results with ${model}`,
    completion: `Completed a prompt with ${model}`,
    chat: `Called ${model}`,
  };
  return {
    id: `request:${row.id}`,
    kind: "request",
    at,
    title: titles[row.requestType] || `Used ${model}`,
    href: row.requestType === "image" ? "/dashboard/studio" : "/dashboard/logs",
    actor: row.apiKeyName?.trim() || null,
    detail: row.status === "success" ? null : row.status,
  };
}

export function activityFromAgent(row: AgentActivityRow): ActivityItem | null {
  const at = toIso(row.lastUsedAt);
  if (!at) return null;
  return {
    id: `agent:${row.id}`,
    kind: "agent",
    at,
    title: `Used ${row.name}`,
    href: row.runtime === "openbot" ? `/dashboard/openbot/${row.id}` : `/dashboard/agents/${row.id}`,
    actor: null,
    detail: row.runtime === "openbot" ? "OpenBot" : row.runtime,
  };
}

export function activityFromTrainingJob(row: TrainingActivityRow): ActivityItem | null {
  const at = toIso(row.finishedAt) || toIso(row.updatedAt) || toIso(row.createdAt);
  if (!at) return null;
  const status = (row.status || "updated").replace(/_/g, " ");
  return {
    id: `training:${row.id}`,
    kind: "training",
    at,
    title: `${row.name} ${status}`,
    href: "/dashboard/training",
    actor: null,
    detail: [row.method, row.baseModelId].filter(Boolean).join(" · ") || null,
  };
}

export function activityFromWorkflowRun(row: WorkflowActivityRow): ActivityItem | null {
  const at = toIso(row.completedAt) || toIso(row.createdAt);
  if (!at) return null;
  return {
    id: `workflow:${row.id}`,
    kind: "workflow",
    at,
    title: `Ran ${row.workflowName}`,
    href: `/dashboard/workflow/${row.workflowId}`,
    actor: null,
    detail: row.status || null,
  };
}

export function activityFromHouseChat(row: ChatActivityRow): ActivityItem | null {
  const at = toIso(row.createdAt);
  if (!at) return null;
  const title = (row.chatTitle || "").trim();
  return {
    id: `chat:${row.id}`,
    kind: "chat",
    at,
    title: title ? `Messaged in ${title}` : "Sent a message in Chat",
    href: "/dashboard/chat",
    actor: actorLabel(row.userName, row.userEmail),
    detail: null,
  };
}

export function mergeRecentActivity(
  items: Array<ActivityItem | null | undefined>,
  limit = RECENT_ACTIVITY_LIMIT
): ActivityItem[] {
  return items
    .filter((item): item is ActivityItem => Boolean(item && toIso(item.at)))
    .sort((a, b) => {
      const delta = new Date(b.at).getTime() - new Date(a.at).getTime();
      if (delta !== 0) return delta;
      return a.id.localeCompare(b.id);
    })
    .slice(0, Math.max(0, limit));
}
