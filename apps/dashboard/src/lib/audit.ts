import { getDb } from "@/lib/db";
import { auditLogs } from "@opendoor/database";

export type AuditAction =
  | "api_key.created"
  | "api_key.revoked"
  | "user.login"
  | "user.logout"
  | "user.invited"
  | "user.invitation_accepted"
  | "sso.enabled"
  | "sso.disabled"
  | "sso.configured"
  | "billing.checkout_started"
  | "billing.subscription_updated"
  | "billing.portal_opened"
  | "organization.updated"
  | "settings.updated"
  | "deployment.created"
  | "deployment.updated"
  | "deployment.deleted"
  | "deployment.lora_loaded"
  | "deployment.lora_unloaded"
  | "deployment.router_created"
  | "deployment.router_deleted"
  | "governance.policy.created"
  | "governance.policy.updated"
  | "governance.policy.deleted"
  | "governance.approval.requested"
  | "governance.approval.reviewed"
  | "governance.violation.resolved"
  | "governance.model.created"
  | "governance.model.updated"
  | "governance.model.deleted"
  | "governance.evaluation.created"
  | "governance.compliance.updated"
  | "governance.compliance.report.generated"
  | "governance.sector_template.created"
  | "governance.sector_pack.applied"
  | "device_inventory.consented"
  | "device_inventory.withdrawn"
  | "agent.created"
  | "agent.updated"
  | "agent.started"
  | "agent.stopped"
  | "agent.deleted";

export interface AuditLogInput {
  organizationId: string;
  userId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAuditEvent(input: AuditLogInput) {
  try {
    const db = getDb();
    await db.insert(auditLogs).values({
      organizationId: input.organizationId,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  } catch (err) {
    // Audit logging should never break the main flow
    console.error("Failed to write audit log:", err);
  }
}
