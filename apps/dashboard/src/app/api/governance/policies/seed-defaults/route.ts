import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelPolicies } from "@opendoor/database";
import { eq, count } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { orgActorId } from "@/lib/governance/actor";
import { governanceSession, unauthorized } from "@/lib/governance/http";

const DEFAULTS = [
  {
    name: "Block Restricted Data",
    description: "Prevents all models from processing restricted-classification data. Hardest guardrail — no exceptions without a more specific allow policy at higher priority.",
    dataClass: "restricted" as const,
    action: "deny" as const,
    modelIdPattern: "*",
    priority: 10,
    requireHumanApproval: false,
  },
  {
    name: "Block Non-Western Models on Internal Data",
    description: "Prevents DeepSeek, Qwen, and other non-Western AI providers from processing internal business data. Reduces data sovereignty risk.",
    dataClass: "internal" as const,
    action: "deny" as const,
    modelIdPattern: "deepseek-*|qwen-*",
    priority: 15,
    requireHumanApproval: false,
  },
  {
    name: "Require Human Approval for Confidential Data",
    description: "All requests involving confidential-classification data must be reviewed by a human before proceeding. Applies across all models.",
    dataClass: "confidential" as const,
    action: "require_approval" as const,
    modelIdPattern: "*",
    priority: 20,
    requireHumanApproval: true,
  },
  {
    name: "Allow Internal Data — Approved Models",
    description: "Standard baseline policy permitting approved Western models to process internal data. Override with higher-priority deny rules as needed.",
    dataClass: "internal" as const,
    action: "allow" as const,
    modelIdPattern: "gpt-*|claude-*|mistral-*|gemini-*|command-*|azure-*",
    priority: 100,
    requireHumanApproval: false,
  },
  {
    name: "Allow Public Data — All Models",
    description: "Permits any model to process publicly available data. Lowest risk; no approval required.",
    dataClass: "public" as const,
    action: "allow" as const,
    modelIdPattern: "*",
    priority: 100,
    requireHumanApproval: false,
  },
] as const;

export async function POST() {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;

  const db = getDb();

  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(modelPolicies)
    .where(eq(modelPolicies.organizationId, orgId));

  if (Number(existing) > 0) {
    return NextResponse.json({ skipped: true, reason: "Policies already exist" });
  }

  const created = [];
  for (const d of DEFAULTS) {
    const [policy] = await db
      .insert(modelPolicies)
      .values({
        organizationId: orgId,
        name: d.name,
        description: d.description,
        dataClass: d.dataClass,
        action: d.action,
        modelIdPattern: d.modelIdPattern,
        priority: d.priority,
        requireHumanApproval: d.requireHumanApproval,
        scope: "organization",
        enabled: true,
        metadata: { source: "baseline_defaults" },
      })
      .returning();
    created.push(policy.id);
  }

  const actorId = await orgActorId(session);
  await logAuditEvent({
    organizationId: orgId,
    userId: actorId ?? undefined,
    action: "governance.policy.created",
    entityType: "model_policy",
    entityId: orgId,
    metadata: { source: "seed_defaults", count: created.length },
  });

  return NextResponse.json({ seeded: true, count: created.length });
}
