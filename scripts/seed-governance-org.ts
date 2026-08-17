/**
 * Org-scoped governance defaults: policies, pending approvals, sample
 * violations, and automated compliance rules. Idempotent per organisation.
 */
import { db } from "../packages/database/src/index.ts";
import {
  complianceRules,
  modelApprovals,
  modelGovernance,
  modelPolicies,
  organizations,
  policyViolations,
  users,
} from "../packages/database/src/index.ts";
import { and, eq } from "drizzle-orm";

const DEFAULT_POLICIES = [
  { name: "Block Restricted Data", description: "No model may process restricted-classification data without a tighter allow rule.", dataClass: "restricted" as const, action: "deny" as const, modelIdPattern: "*", priority: 10, requireHumanApproval: false },
  { name: "Block Non-Western Models on Internal Data", description: "DeepSeek and Qwen cannot process internal data until approved.", dataClass: "internal" as const, action: "deny" as const, modelIdPattern: "deepseek-*|qwen-*", priority: 15, requireHumanApproval: false },
  { name: "Require Approval for Confidential Data", description: "Confidential requests need a human before they run.", dataClass: "confidential" as const, action: "require_approval" as const, modelIdPattern: "*", priority: 20, requireHumanApproval: true },
  { name: "Allow Internal Data — Approved Models", description: "Approved Western models may process internal data.", dataClass: "internal" as const, action: "allow" as const, modelIdPattern: "gpt-*|claude-*|mistral-*|gemini-*|command-*", priority: 100, requireHumanApproval: false },
  { name: "Allow Public Data — All Models", description: "Any model may process public data.", dataClass: "public" as const, action: "allow" as const, modelIdPattern: "*", priority: 100, requireHumanApproval: false },
];

const DEFAULT_RULES = [
  { name: "Approved models only", description: "Production traffic should use an approved registry model.", framework: "nist_ai_rmf" as const, controlCode: "NIST-1", ruleType: "model_attribute", severity: "high", recommendation: "Request approval before enabling the model.", referenceName: "NIST AI RMF — Govern", ruleConfig: { attribute: "approvalStatus", operator: "eq", expected: "approved", message: "Model is not approved for production use." } },
  { name: "Bias review completed", description: "Models need a completed bias review before they handle personal data.", framework: "ico_uk" as const, controlCode: "ICO-2", ruleType: "model_attribute", severity: "high", recommendation: "Complete a bias audit and mark biasReviewed.", referenceName: "ICO Fairness by Design", ruleConfig: { attribute: "biasReviewed", operator: "eq", expected: true, message: "Bias review is not marked complete." } },
  { name: "Safety review completed", description: "Safety review must be on file before production use.", framework: "eu_ai_act" as const, controlCode: "AIACT-4", ruleType: "model_attribute", severity: "high", recommendation: "Run a safety review and mark safetyReviewed.", referenceName: "EU AI Act — Accuracy, Robustness, Cybersecurity", ruleConfig: { attribute: "safetyReviewed", operator: "eq", expected: true, message: "Safety review is not marked complete." } },
  { name: "UK/EU residency", description: "Allowed regions should include the UK for personal data.", framework: "ico_uk" as const, controlCode: "ICO-3", ruleType: "model_attribute", severity: "medium", recommendation: "Restrict the model to UK/EU regions.", referenceName: "ICO Data Residency", ruleConfig: { attribute: "allowedRegions", operator: "contains", expected: ["uk"] } },
  { name: "Safety evaluation score", description: "Latest safety evaluation must meet the 75% threshold.", framework: "nist_ai_rmf" as const, controlCode: "NIST-3", ruleType: "evaluation_score", severity: "medium", recommendation: "Run a safety evaluation and attach the score.", referenceName: "NIST AI RMF — Measure", ruleConfig: { evaluationType: "safety", minScore: 75 } },
];

async function seedOrg(orgId: string, userId: string | null) {
  const existingPolicies = await db.select({ id: modelPolicies.id }).from(modelPolicies).where(eq(modelPolicies.organizationId, orgId)).limit(1);
  if (existingPolicies.length === 0) {
    for (const d of DEFAULT_POLICIES) {
      await db.insert(modelPolicies).values({
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
      });
    }
    console.log(`  policies seeded for ${orgId}`);
  }

  if (userId) {
    const pending = await db.select().from(modelGovernance).where(eq(modelGovernance.approvalStatus, "pending"));
    for (const model of pending) {
      const existing = await db
        .select({ id: modelApprovals.id })
        .from(modelApprovals)
        .where(and(eq(modelApprovals.modelGovernanceId, model.id), eq(modelApprovals.organizationId, orgId)))
        .limit(1);
      if (existing.length > 0) continue;
      await db.insert(modelApprovals).values({
        modelGovernanceId: model.id,
        organizationId: orgId,
        requestedBy: userId,
        status: "pending",
        reviewNotes: "Seeded from the Trust Center so this model can be reviewed.",
      });
    }
  }

  const existingRules = await db.select({ id: complianceRules.id }).from(complianceRules).where(eq(complianceRules.organizationId, orgId)).limit(1);
  if (existingRules.length === 0) {
    for (const rule of DEFAULT_RULES) {
      await db.insert(complianceRules).values({
        organizationId: orgId,
        ...rule,
        enabled: true,
      });
    }
    console.log(`  rules seeded for ${orgId}`);
  }

  const existingViolations = await db.select({ id: policyViolations.id }).from(policyViolations).where(eq(policyViolations.organizationId, orgId)).limit(1);
  if (existingViolations.length === 0) {
    const [denyPolicy] = await db
      .select()
      .from(modelPolicies)
      .where(and(eq(modelPolicies.organizationId, orgId), eq(modelPolicies.action, "deny")))
      .limit(1);
    const samples = [
      { modelId: "deepseek-chat", dataClass: "internal" as const, violationType: "unapproved_model", severity: "high" as const, actionTaken: "blocked", details: { reason: "Model is not approved for internal data.", source: "seed", live: false } },
      { modelId: "gpt-4o", dataClass: "restricted" as const, violationType: "data_class_mismatch", severity: "critical" as const, actionTaken: "blocked", details: { reason: "Restricted data is denied by policy.", source: "seed", live: false } },
      { modelId: "qwen-plus", dataClass: "confidential" as const, violationType: "unapproved_model", severity: "medium" as const, actionTaken: "flagged", details: { reason: "Confidential request needs approval.", source: "seed", live: false } },
    ];
    for (const sample of samples) {
      await db.insert(policyViolations).values({
        organizationId: orgId,
        policyId: denyPolicy?.id,
        ...sample,
      });
    }
    console.log(`  violations seeded for ${orgId}`);
  }
}

async function main() {
  process.env.INSTANCE_CONNECTION_NAME = "";
  process.env.CLOUDSQL_CONNECTION_NAME = "";
  const orgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
  for (const org of orgs) {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.organizationId, org.id)).limit(1);
    console.log(`Seeding ${org.name}`);
    await seedOrg(org.id, user?.id ?? null);
  }
  console.log("Org governance seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
