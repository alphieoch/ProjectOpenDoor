import { getDb } from "@/lib/db";
import {
  complianceControls,
  complianceRules,
  modelApprovals,
  modelComplianceMappings,
  modelEvaluations,
  modelGovernance,
  modelPolicies,
  policyViolations,
  sectorTemplates,
} from "@opendoor/database";
import { eq, and, count } from "drizzle-orm";
import { ensureGovernanceSchema } from "./ensure-schema";

const emptyCreated = () => ({
  controls: 0,
  packs: 0,
  models: 0,
  policies: 0,
  approvals: 0,
  violations: 0,
  rules: 0,
});

async function alreadySeeded(orgId: string) {
  const db = getDb();
  const [[controls], [models], [packs], [policies]] = await Promise.all([
    db.select({ n: count() }).from(complianceControls),
    db.select({ n: count() }).from(modelGovernance),
    db.select({ n: count() }).from(sectorTemplates),
    db.select({ n: count() }).from(modelPolicies).where(eq(modelPolicies.organizationId, orgId)),
  ]);
  return Number(controls.n) >= 10 && Number(models.n) >= 3 && Number(packs.n) >= 6 && Number(policies.n) >= 1;
}

const CONTROLS = [
  { framework: "gdpr" as const, controlCode: "GDPR-1", controlName: "Lawful Basis for Processing", description: "Ensure AI processing has a lawful basis under GDPR Article 6.", requirementLevel: "required", guidance: "Document consent or legitimate interest assessment." },
  { framework: "gdpr" as const, controlCode: "GDPR-2", controlName: "Data Minimisation", description: "Only process personal data necessary for the specific purpose.", requirementLevel: "required", guidance: "Review training data and prompts for unnecessary PII." },
  { framework: "gdpr" as const, controlCode: "GDPR-3", controlName: "Right to Explanation", description: "Users can obtain meaningful information about logic involved.", requirementLevel: "required", guidance: "Provide model cards and decision rationale documentation." },
  { framework: "gdpr" as const, controlCode: "GDPR-4", controlName: "Data Subject Rights", description: "Support access, rectification, erasure, and portability.", requirementLevel: "required", guidance: "Implement data retention and deletion workflows." },
  { framework: "gdpr" as const, controlCode: "GDPR-5", controlName: "Data Protection Impact Assessment", description: "DPIA required for high-risk AI processing.", requirementLevel: "required", guidance: "Complete DPIA before production deployment." },
  { framework: "eu_ai_act" as const, controlCode: "AIACT-1", controlName: "Risk Classification", description: "Classify AI system risk level per EU AI Act.", requirementLevel: "required", guidance: "Map to limited risk, high risk, or unacceptable risk." },
  { framework: "eu_ai_act" as const, controlCode: "AIACT-2", controlName: "Transparency Obligations", description: "Notify users they are interacting with AI.", requirementLevel: "required", guidance: "Add disclosure in UI and API responses." },
  { framework: "eu_ai_act" as const, controlCode: "AIACT-3", controlName: "Human Oversight", description: "Enable effective oversight by natural persons.", requirementLevel: "required", guidance: "Implement human-in-the-loop for high-risk decisions." },
  { framework: "eu_ai_act" as const, controlCode: "AIACT-4", controlName: "Accuracy, Robustness, Cybersecurity", description: "Ensure appropriate levels for intended purpose.", requirementLevel: "required", guidance: "Run red-team evaluations and penetration tests." },
  { framework: "eu_ai_act" as const, controlCode: "AIACT-5", controlName: "Record-Keeping", description: "Maintain logs of operation for traceability.", requirementLevel: "required", guidance: "Retain request logs for minimum 6 years." },
  { framework: "ico_uk" as const, controlCode: "ICO-1", controlName: "AI Auditing Framework", description: "Follow ICO guidance on auditing AI systems.", requirementLevel: "recommended", guidance: "Use ICO's AI auditing framework checklist." },
  { framework: "ico_uk" as const, controlCode: "ICO-2", controlName: "Fairness by Design", description: "Assess and mitigate bias in AI decisions.", requirementLevel: "required", guidance: "Conduct bias audits and document mitigation." },
  { framework: "ico_uk" as const, controlCode: "ICO-3", controlName: "Data Residency", description: "UK personal data should remain in UK/EU.", requirementLevel: "required", guidance: "Ensure models and data processed in UK/EU regions." },
  { framework: "nist_ai_rmf" as const, controlCode: "NIST-1", controlName: "Govern", description: "Establish AI risk management policies.", requirementLevel: "required", guidance: "Define roles, responsibilities, and risk appetite." },
  { framework: "nist_ai_rmf" as const, controlCode: "NIST-2", controlName: "Map", description: "Identify context and risks for AI systems.", requirementLevel: "required", guidance: "Inventory all models, data sources, and use cases." },
  { framework: "nist_ai_rmf" as const, controlCode: "NIST-3", controlName: "Measure", description: "Quantify and evaluate AI risks.", requirementLevel: "required", guidance: "Use quantitative metrics for bias, safety, and security." },
  { framework: "nist_ai_rmf" as const, controlCode: "NIST-4", controlName: "Manage", description: "Prioritize and act on identified risks.", requirementLevel: "required", guidance: "Implement controls and monitor effectiveness." },
];

const PACKS = [
  { sector: "legal" as const, name: "Legal Services AI Pack", description: "Policies and controls for UK law firms — confidential work, human approval, PII block.", defaultModels: ["gpt-4o", "claude-3-5-sonnet-20241022", "mistral-large-latest"], defaultPolicies: { dataClass: "confidential", requireHumanApproval: true, bannedUses: ["unauthorized legal advice", "client data training"] }, promptTemplates: { contractReview: "Review the following contract for risks. Do not provide legal advice." }, guardrailConfig: { piiDetection: "block", promptInjection: "block", requireDisclosure: true }, complianceRequirements: ["GDPR-1", "GDPR-2", "GDPR-3", "ICO-1", "ICO-2"] },
  { sector: "finance" as const, name: "Financial Services AI Pack", description: "Banks, insurers, and fintech — restricted data, oversight on credit and advice.", defaultModels: ["gpt-4o", "mistral-large-latest"], defaultPolicies: { dataClass: "restricted", requireHumanApproval: true, bannedUses: ["investment advice without disclaimer", "credit scoring without oversight"] }, promptTemplates: { riskNote: "Summarise this credit file. Do not issue a lending decision." }, guardrailConfig: { piiDetection: "block", requireDisclosure: true }, complianceRequirements: ["GDPR-1", "GDPR-5", "AIACT-1", "AIACT-3", "ICO-3"] },
  { sector: "property" as const, name: "Property & Real Estate Pack", description: "Lease, service charge, and dilapidations workflows with UK residency.", defaultModels: ["gpt-4o", "claude-3-5-sonnet-20241022"], defaultPolicies: { dataClass: "confidential", requireHumanApproval: true, bannedUses: ["automated valuation without surveyor review"] }, promptTemplates: { leaseAbstract: "Abstract the key commercial terms from this lease." }, guardrailConfig: { piiDetection: "redact", requireDisclosure: true }, complianceRequirements: ["GDPR-1", "GDPR-2", "ICO-3"] },
  { sector: "healthcare" as const, name: "Healthcare & Life Sciences Pack", description: "Clinical-adjacent use with restricted data and no diagnosis.", defaultModels: ["gpt-4o", "claude-3-5-sonnet-20241022"], defaultPolicies: { dataClass: "restricted", requireHumanApproval: true, bannedUses: ["medical diagnosis", "treatment recommendation without clinician"] }, promptTemplates: { notes: "Summarise these clinical notes for a clinician. Do not diagnose." }, guardrailConfig: { piiDetection: "block", requireDisclosure: true }, complianceRequirements: ["GDPR-1", "GDPR-5", "AIACT-1", "AIACT-3"] },
  { sector: "government" as const, name: "Government & Public Sector Pack", description: "UK public-sector residency, transparency, and human oversight.", defaultModels: ["mistral-large-latest", "gpt-4o"], defaultPolicies: { dataClass: "confidential", requireHumanApproval: true, bannedUses: ["automated benefit decisions", "UK government data on non-approved models"] }, promptTemplates: { briefing: "Draft a factual briefing. Flag anything that needs a human decision." }, guardrailConfig: { piiDetection: "block", requireDisclosure: true }, complianceRequirements: ["GDPR-1", "AIACT-2", "AIACT-3", "ICO-3", "NIST-1"] },
  { sector: "general" as const, name: "Internal Tools Pack", description: "Everyday copilots on internal data. Cheaper default, no restricted classes.", defaultModels: ["gpt-4o-mini", "mistral-large-latest"], defaultPolicies: { dataClass: "internal", requireHumanApproval: false, bannedUses: ["processing confidential client data without approval"] }, promptTemplates: { meetingNotes: "Summarise this meeting into actions and decisions." }, guardrailConfig: { piiDetection: "redact", requireDisclosure: true }, complianceRequirements: ["GDPR-2", "ICO-2", "NIST-2"] },
  { sector: "insurance" as const, name: "Insurance Pack", description: "Claims and underwriting assistance with human approval on decisions.", defaultModels: ["gpt-4o", "mistral-large-latest"], defaultPolicies: { dataClass: "confidential", requireHumanApproval: true, bannedUses: ["automated claim denial"] }, promptTemplates: { claimNote: "Summarise this claim file. Do not decide the outcome." }, guardrailConfig: { piiDetection: "block" }, complianceRequirements: ["GDPR-1", "AIACT-3", "ICO-2"] },
  { sector: "education" as const, name: "Education Pack", description: "Student-safe defaults, no automated grading without review.", defaultModels: ["gpt-4o-mini", "claude-3-5-sonnet-20241022"], defaultPolicies: { dataClass: "internal", requireHumanApproval: true, bannedUses: ["automated grading without teacher review"] }, promptTemplates: { lesson: "Draft a lesson outline from these notes." }, guardrailConfig: { piiDetection: "redact" }, complianceRequirements: ["GDPR-1", "GDPR-4", "ICO-2"] },
  { sector: "energy" as const, name: "Energy & Utilities Pack", description: "Operational notes with restricted critical-infrastructure data.", defaultModels: ["gpt-4o", "mistral-large-latest"], defaultPolicies: { dataClass: "confidential", requireHumanApproval: true, bannedUses: ["unreviewed operational control changes"] }, promptTemplates: { incident: "Summarise this incident. Do not recommend control-room actions." }, guardrailConfig: { piiDetection: "block" }, complianceRequirements: ["GDPR-1", "AIACT-3", "NIST-1"] },
  { sector: "retail" as const, name: "Retail & Consumer Pack", description: "Customer-service copilots with PII redaction.", defaultModels: ["gpt-4o-mini", "gpt-4o"], defaultPolicies: { dataClass: "internal", requireHumanApproval: false, bannedUses: ["loyalty data export"] }, promptTemplates: { reply: "Draft a customer reply. Do not invent refunds or policy exceptions." }, guardrailConfig: { piiDetection: "redact", requireDisclosure: true }, complianceRequirements: ["GDPR-2", "GDPR-4", "ICO-2"] },
  { sector: "media" as const, name: "Media & Comms Pack", description: "Editorial assist with disclosure and no confidential source leaks.", defaultModels: ["claude-3-5-sonnet-20241022", "gpt-4o"], defaultPolicies: { dataClass: "confidential", requireHumanApproval: true, bannedUses: ["publishing source identities"] }, promptTemplates: { brief: "Turn these notes into a factual brief. Flag anything unverified." }, guardrailConfig: { requireDisclosure: true }, complianceRequirements: ["GDPR-1", "AIACT-2", "ICO-2"] },
  { sector: "transport" as const, name: "Transport & Logistics Pack", description: "Routing and ops assist with human approval on safety-critical advice.", defaultModels: ["gpt-4o", "mistral-large-latest"], defaultPolicies: { dataClass: "internal", requireHumanApproval: true, bannedUses: ["unreviewed safety-critical routing"] }, promptTemplates: { delay: "Summarise this disruption and list options for a human dispatcher." }, guardrailConfig: { piiDetection: "redact" }, complianceRequirements: ["GDPR-2", "AIACT-3", "NIST-2"] },
];

const MODELS = [
  { modelId: "gpt-4o", displayName: "GPT-4o", description: "OpenAI flagship multimodal model.", riskLevel: "medium" as const, businessLabels: ["general purpose", "multimodal"], allowedUseCases: ["internal copilots", "document drafting"], bannedUseCases: ["medical diagnosis", "credit scoring without oversight"], dataClassesAllowed: ["public", "internal", "confidential"], licenseType: "Proprietary (OpenAI)", provenanceVerified: true, biasReviewed: true, safetyReviewed: true, contextWindow: 128000, costTier: "premium", sectorTags: ["general", "legal", "finance"], ownerTeam: "Platform", businessCriticality: "standard", allowedRegions: ["uk", "eu", "us"], approvalStatus: "approved" as const },
  { modelId: "claude-3-5-sonnet-20241022", displayName: "Claude 3.5 Sonnet", description: "Anthropic balanced model with long context.", riskLevel: "medium" as const, businessLabels: ["long context", "safety-first"], allowedUseCases: ["document analysis", "research"], bannedUseCases: ["medical diagnosis"], dataClassesAllowed: ["public", "internal", "confidential"], licenseType: "Proprietary (Anthropic)", provenanceVerified: true, biasReviewed: true, safetyReviewed: true, contextWindow: 200000, costTier: "premium", sectorTags: ["general", "legal"], ownerTeam: "Legal Ops", businessCriticality: "high", allowedRegions: ["uk", "eu"], approvalStatus: "approved" as const },
  { modelId: "mistral-large-latest", displayName: "Mistral Large", description: "EU-hosted option for data sovereignty.", riskLevel: "low" as const, businessLabels: ["EU-based", "data sovereignty"], allowedUseCases: ["internal copilots", "drafting"], bannedUseCases: ["autonomous financial advice"], dataClassesAllowed: ["public", "internal", "confidential"], licenseType: "Apache-2.0", provenanceVerified: true, biasReviewed: true, safetyReviewed: true, contextWindow: 128000, costTier: "standard", sectorTags: ["general", "government"], ownerTeam: "Public Sector", businessCriticality: "standard", allowedRegions: ["uk", "eu"], approvalStatus: "approved" as const },
  { modelId: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", description: "Google long-context multimodal model.", riskLevel: "medium" as const, businessLabels: ["long context", "multimodal"], allowedUseCases: ["document analysis", "research"], bannedUseCases: ["facial recognition"], dataClassesAllowed: ["public", "internal"], licenseType: "Proprietary (Google)", provenanceVerified: true, biasReviewed: true, safetyReviewed: true, contextWindow: 2000000, costTier: "premium", sectorTags: ["general"], ownerTeam: "Research", businessCriticality: "standard", allowedRegions: ["uk", "eu"], approvalStatus: "approved" as const },
  { modelId: "deepseek-chat", displayName: "DeepSeek-V3", description: "Open-weight reasoning model. Pending approval for this workspace.", riskLevel: "high" as const, businessLabels: ["open-weight", "cost-efficient"], allowedUseCases: ["internal experimentation"], bannedUseCases: ["customer PII", "UK government data"], dataClassesAllowed: ["public", "internal"], licenseType: "MIT", provenanceVerified: true, biasReviewed: false, safetyReviewed: false, contextWindow: 64000, costTier: "standard", sectorTags: ["general"], ownerTeam: "Platform", businessCriticality: "low", allowedRegions: ["uk", "eu"], approvalStatus: "pending" as const },
];

const DEFAULT_POLICIES = [
  { name: "Block Restricted Data", description: "No model may process restricted-classification data without a tighter allow rule.", dataClass: "restricted" as const, action: "deny" as const, modelIdPattern: "*", priority: 10, requireHumanApproval: false },
  { name: "Block Non-Western Models on Internal Data", description: "DeepSeek and Qwen cannot process internal data until approved.", dataClass: "internal" as const, action: "deny" as const, modelIdPattern: "deepseek-*|qwen-*", priority: 15, requireHumanApproval: false },
  { name: "Require Approval for Confidential Data", description: "Confidential requests need a human before they run.", dataClass: "confidential" as const, action: "require_approval" as const, modelIdPattern: "*", priority: 20, requireHumanApproval: true },
  { name: "Allow Internal Data — Approved Models", description: "Approved Western models may process internal data.", dataClass: "internal" as const, action: "allow" as const, modelIdPattern: "gpt-*|claude-*|mistral-*|gemini-*|command-*", priority: 100, requireHumanApproval: false },
  { name: "Allow Public Data — All Models", description: "Any model may process public data.", dataClass: "public" as const, action: "allow" as const, modelIdPattern: "*", priority: 100, requireHumanApproval: false },
];

const DEFAULT_RULES = [
  {
    name: "Approved models only",
    description: "Production traffic should use an approved registry model.",
    framework: "nist_ai_rmf" as const,
    controlCode: "NIST-1",
    ruleType: "model_attribute",
    severity: "high",
    recommendation: "Request approval before enabling the model.",
    referenceName: "NIST AI RMF — Govern",
    ruleConfig: { attribute: "approvalStatus", operator: "eq", expected: "approved", message: "Model is not approved for production use." },
  },
  {
    name: "Bias review completed",
    description: "Models need a completed bias review before they handle personal data.",
    framework: "ico_uk" as const,
    controlCode: "ICO-2",
    ruleType: "model_attribute",
    severity: "high",
    recommendation: "Complete a bias audit and mark biasReviewed.",
    referenceName: "ICO Fairness by Design",
    ruleConfig: { attribute: "biasReviewed", operator: "eq", expected: true, message: "Bias review is not marked complete." },
  },
  {
    name: "Safety review completed",
    description: "Safety review must be on file before production use.",
    framework: "eu_ai_act" as const,
    controlCode: "AIACT-4",
    ruleType: "model_attribute",
    severity: "high",
    recommendation: "Run a safety review and mark safetyReviewed.",
    referenceName: "EU AI Act — Accuracy, Robustness, Cybersecurity",
    ruleConfig: { attribute: "safetyReviewed", operator: "eq", expected: true, message: "Safety review is not marked complete." },
  },
  {
    name: "UK/EU residency",
    description: "Allowed regions should include the UK for personal data.",
    framework: "ico_uk" as const,
    controlCode: "ICO-3",
    ruleType: "model_attribute",
    severity: "medium",
    recommendation: "Restrict the model to UK/EU regions.",
    referenceName: "ICO Data Residency",
    ruleConfig: { attribute: "allowedRegions", operator: "contains", expected: ["uk"] },
  },
  {
    name: "Safety evaluation score",
    description: "Latest safety evaluation must meet the 75% threshold.",
    framework: "nist_ai_rmf" as const,
    controlCode: "NIST-3",
    ruleType: "evaluation_score",
    severity: "medium",
    recommendation: "Run a safety evaluation and attach the score.",
    referenceName: "NIST AI RMF — Measure",
    ruleConfig: { evaluationType: "safety", minScore: 75 },
  },
];

export async function bootstrapGovernance(opts: { orgId: string; userId: string | null }) {
  try {
    if (await alreadySeeded(opts.orgId)) {
      return { ...emptyCreated(), skipped: true as const };
    }
  } catch {
    /* tables may be missing — fall through to schema ensure */
  }

  try {
    await ensureGovernanceSchema();
  } catch (err) {
    console.warn("Governance schema ensure failed:", err);
  }

  try {
    if (await alreadySeeded(opts.orgId)) {
      return { ...emptyCreated(), skipped: true as const };
    }
  } catch {
    /* continue seeding */
  }

  const db = getDb();
  const created = emptyCreated();

  for (const control of CONTROLS) {
    const existing = await db.select({ id: complianceControls.id }).from(complianceControls).where(eq(complianceControls.controlCode, control.controlCode)).limit(1);
    if (existing.length === 0) {
      await db.insert(complianceControls).values(control);
      created.controls++;
    }
  }

  for (const pack of PACKS) {
    try {
      const existing = await db.select({ id: sectorTemplates.id }).from(sectorTemplates).where(eq(sectorTemplates.name, pack.name)).limit(1);
      if (existing.length === 0) {
        await db.insert(sectorTemplates).values(pack);
        created.packs++;
      }
    } catch {
      /* sector enum may not include newer values yet */
    }
  }

  const allControls = await db.select().from(complianceControls);

  for (const model of MODELS) {
    const existing = await db.select({ id: modelGovernance.id }).from(modelGovernance).where(eq(modelGovernance.modelId, model.modelId)).limit(1);
    if (existing.length > 0) continue;
    const [inserted] = await db.insert(modelGovernance).values(model).returning();
    created.models++;
    if (model.approvalStatus === "approved") {
      for (const ev of [
        { evaluationName: "MMLU Benchmark", evaluationType: "benchmark", score: "85.2", scoreUnit: "percent", passThreshold: "80.0", passed: true },
        { evaluationName: "Safety Red-Team", evaluationType: "red_team", score: "92.0", scoreUnit: "percent", passThreshold: "90.0", passed: true },
        { evaluationName: "Bias Audit", evaluationType: "safety", score: "78.5", scoreUnit: "percent", passThreshold: "75.0", passed: true },
      ]) {
        await db.insert(modelEvaluations).values({ modelGovernanceId: inserted.id, ...ev });
      }
    }
    for (const control of allControls) {
      const compliant = model.approvalStatus === "approved" && control.requirementLevel === "required";
      await db.insert(modelComplianceMappings).values({
        modelGovernanceId: inserted.id,
        controlId: control.id,
        status: compliant ? "compliant" : "not_assessed",
        evidence: compliant ? "Verified in the OpenDoor registry review." : undefined,
        assessedAt: compliant ? new Date() : undefined,
      });
    }
  }

  const existingPolicies = await db.select({ id: modelPolicies.id }).from(modelPolicies).where(eq(modelPolicies.organizationId, opts.orgId)).limit(1);
  if (existingPolicies.length === 0) {
    for (const d of DEFAULT_POLICIES) {
      await db.insert(modelPolicies).values({
        organizationId: opts.orgId,
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
      created.policies++;
    }
  }

  const pendingModels = await db.select().from(modelGovernance).where(eq(modelGovernance.approvalStatus, "pending"));
  for (const model of pendingModels) {
    const existing = await db
      .select({ id: modelApprovals.id })
      .from(modelApprovals)
      .where(and(eq(modelApprovals.modelGovernanceId, model.id), eq(modelApprovals.organizationId, opts.orgId)))
      .limit(1);
    if (existing.length > 0 || !opts.userId) continue;
    await db.insert(modelApprovals).values({
      modelGovernanceId: model.id,
      organizationId: opts.orgId,
      requestedBy: opts.userId,
      status: "pending",
      reviewNotes: "Seeded from the Trust Center so this model can be reviewed.",
    });
    created.approvals++;
  }

  try {
    const existingRules = await db.select({ id: complianceRules.id }).from(complianceRules).where(eq(complianceRules.organizationId, opts.orgId)).limit(1);
    if (existingRules.length === 0) {
      for (const rule of DEFAULT_RULES) {
        await db.insert(complianceRules).values({
          organizationId: opts.orgId,
          ...rule,
          enabled: true,
        });
        created.rules++;
      }
    }
  } catch (err) {
    console.warn("Governance rules seed skipped:", err);
  }

  try {
    const existingViolations = await db.select({ id: policyViolations.id }).from(policyViolations).where(eq(policyViolations.organizationId, opts.orgId)).limit(1);
    if (existingViolations.length === 0) {
      const [denyPolicy] = await db
        .select()
        .from(modelPolicies)
        .where(and(eq(modelPolicies.organizationId, opts.orgId), eq(modelPolicies.action, "deny")))
        .limit(1);
      const samples = [
      { modelId: "deepseek-chat", dataClass: "internal" as const, violationType: "unapproved_model", severity: "high" as const, actionTaken: "blocked", details: { reason: "Model is not approved for internal data.", source: "seed", live: false } },
      { modelId: "gpt-4o", dataClass: "restricted" as const, violationType: "data_class_mismatch", severity: "critical" as const, actionTaken: "blocked", details: { reason: "Restricted data is denied by policy.", source: "seed", live: false } },
      { modelId: "qwen-plus", dataClass: "confidential" as const, violationType: "unapproved_model", severity: "medium" as const, actionTaken: "flagged", details: { reason: "Confidential request needs approval.", source: "seed", live: false } },
      ];
      for (const sample of samples) {
        await db.insert(policyViolations).values({
          organizationId: opts.orgId,
          policyId: denyPolicy?.id,
          ...sample,
        });
        created.violations++;
      }
    }
  } catch (err) {
    console.warn("Governance violations seed skipped:", err);
  }

  return created;
}
