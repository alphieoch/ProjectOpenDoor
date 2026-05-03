// @ts-nocheck
import {
  db,
  modelGovernance,
  modelPolicies,
  policyViolations,
  guardrailOutcomes,
  complianceControls,
  modelComplianceMappings,
} from "@opendoor/database";
import { eq, and, inArray, sql, desc } from "drizzle-orm";

export type DataClass = "public" | "internal" | "confidential" | "restricted";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type PolicyAction = "allow" | "deny" | "require_approval" | "route_fallback";

export interface PolicyCheckRequest {
  organizationId: string;
  apiKeyId: string;
  modelId: string;
  dataClass?: DataClass;
  userRole?: string;
  businessUnit?: string;
  clientId?: string;
  prompt?: string;
  metadata?: Record<string, any>;
}

export interface PolicyCheckResult {
  allowed: boolean;
  action: PolicyAction;
  reason: string;
  fallbackModelId?: string;
  requireHumanApproval?: boolean;
  violationId?: string;
  guardrailResults: GuardrailResult[];
  governance?: ModelGovernanceInfo;
}

export interface GuardrailResult {
  type: string;
  triggered: boolean;
  severity: RiskLevel;
  details?: Record<string, any>;
  actionTaken: string;
}

export interface ModelGovernanceInfo {
  id: string;
  modelId: string;
  displayName: string;
  approvalStatus: string;
  riskLevel: RiskLevel;
  allowedUseCases: string[];
  bannedUseCases: string[];
  dataClassesAllowed: DataClass[];
  businessLabels: string[];
  licenseType?: string;
  provenanceVerified: boolean;
  biasReviewed: boolean;
  safetyReviewed: boolean;
  sectorTags: string[];
  ownerTeam?: string;
  businessCriticality?: string;
  allowedRegions: string[];
  lastReviewedBy?: string;
  lastReviewedAt?: Date;
}

// ── Guardrail checks ─────────────────────────────────────────────────────────

async function runGuardrails(
  req: PolicyCheckRequest
): Promise<GuardrailResult[]> {
  const results: GuardrailResult[] = [];
  const prompt = req.prompt || "";

  // PII detection (simple regex-based)
  const piiPatterns = [
    { name: "uk_nino", regex: /\b[A-CEGHJ-PR-TW-Z]{1}[A-CEGHJ-NPR-TW-Z]{1}\d{6}[A-D]{1}\b/, severity: "high" as RiskLevel },
    { name: "email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, severity: "medium" as RiskLevel },
    { name: "phone_uk", regex: /\b(?:(?:\+44)|(?:0))\s?\d{4}\s?\d{6}\b/, severity: "medium" as RiskLevel },
    { name: "credit_card", regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/, severity: "high" as RiskLevel },
  ];

  let piiDetected = false;
  const piiDetails: string[] = [];
  for (const pattern of piiPatterns) {
    if (pattern.regex.test(prompt)) {
      piiDetected = true;
      piiDetails.push(pattern.name);
    }
  }

  results.push({
    type: "pii_detection",
    triggered: piiDetected,
    severity: piiDetected ? "high" : "low",
    details: piiDetected ? { detectedTypes: piiDetails } : undefined,
    actionTaken: piiDetected ? "flagged" : "none",
  });

  // Prompt injection detection
  const injectionPatterns = [
    /ignore previous instructions/i,
    /system prompt/i,
    /you are now/i,
    /DAN mode/i,
    /jailbreak/i,
    /\/\/.*ignore.*previous/i,
  ];
  const injectionDetected = injectionPatterns.some((p) => p.test(prompt));
  results.push({
    type: "prompt_injection",
    triggered: injectionDetected,
    severity: injectionDetected ? "critical" : "low",
    details: injectionDetected ? { matchedPatterns: injectionPatterns.filter((p) => p.test(prompt)).map((_, i) => i) } : undefined,
    actionTaken: injectionDetected ? "blocked" : "none",
  });

  // Toxicity / profanity (basic)
  const toxicWords = ["hate", "kill", "attack", "bomb", "terrorist"];
  const toxicDetected = toxicWords.some((w) => prompt.toLowerCase().includes(w));
  results.push({
    type: "toxicity",
    triggered: toxicDetected,
    severity: toxicDetected ? "high" : "low",
    actionTaken: toxicDetected ? "flagged" : "none",
  });

  // Secret scanning
  const secretPatterns = [
    { name: "api_key", regex: /sk-[a-zA-Z0-9]{32,}/ },
    { name: "hf_token", regex: /hf_[a-zA-Z0-9]{30,}/ },
    { name: "aws_key", regex: /AKIA[0-9A-Z]{16}/ },
  ];
  let secretDetected = false;
  const secretDetails: string[] = [];
  for (const pattern of secretPatterns) {
    if (pattern.regex.test(prompt)) {
      secretDetected = true;
      secretDetails.push(pattern.name);
    }
  }
  results.push({
    type: "secret_scanning",
    triggered: secretDetected,
    severity: secretDetected ? "high" : "low",
    details: secretDetected ? { detectedTypes: secretDetails } : undefined,
    actionTaken: secretDetected ? "redacted" : "none",
  });

  return results;
}

// ── Model governance lookup ──────────────────────────────────────────────────

async function getModelGovernance(modelId: string): Promise<ModelGovernanceInfo | undefined> {
  const rows = await db
    .select()
    .from(modelGovernance)
    .where(eq(modelGovernance.modelId, modelId))
    .limit(1);

  if (!rows[0]) return undefined;

  const g = rows[0];
  return {
    id: g.id,
    modelId: g.modelId,
    displayName: g.displayName,
    approvalStatus: g.approvalStatus,
    riskLevel: g.riskLevel as RiskLevel,
    allowedUseCases: (g.allowedUseCases as string[]) || [],
    bannedUseCases: (g.bannedUseCases as string[]) || [],
    dataClassesAllowed: (g.dataClassesAllowed as DataClass[]) || ["public", "internal"],
    businessLabels: (g.businessLabels as string[]) || [],
    licenseType: g.licenseType || undefined,
    provenanceVerified: g.provenanceVerified || false,
    biasReviewed: g.biasReviewed || false,
    safetyReviewed: g.safetyReviewed || false,
    sectorTags: (g.sectorTags as string[]) || [],
  };
}

// ── Policy evaluation ────────────────────────────────────────────────────────

async function evaluatePolicies(
  req: PolicyCheckRequest,
  governance: ModelGovernanceInfo | undefined
): Promise<{ action: PolicyAction; reason: string; fallbackModelId?: string; requireHumanApproval?: boolean }> {
  // 1. Check if model is in governance registry and approved
  if (governance) {
    if (governance.approvalStatus === "rejected" || governance.approvalStatus === "deprecated") {
      return { action: "deny", reason: `Model ${req.modelId} is ${governance.approvalStatus} and cannot be used.` };
    }
    if (governance.approvalStatus === "pending" || governance.approvalStatus === "in_review") {
      return { action: "require_approval", reason: `Model ${req.modelId} is pending approval.`, requireHumanApproval: true };
    }
  }

  // 2. Load organization-specific policies
  const policies = await db
    .select()
    .from(modelPolicies)
    .where(
      and(
        eq(modelPolicies.organizationId, req.organizationId),
        eq(modelPolicies.enabled, true)
      )
    )
    .orderBy(sql`${modelPolicies.priority} asc`);

  // 3. Evaluate each policy
  const dataClass = req.dataClass || "internal";

  for (const policy of policies) {
    // Check if policy applies to this model
    let modelMatches = false;
    if (policy.modelGovernanceId) {
      const govMatch = governance && governance.id === policy.modelGovernanceId;
      modelMatches = govMatch;
    } else if (policy.modelIdPattern) {
      // Simple wildcard matching
      const pattern = policy.modelIdPattern.replace(/\*/g, ".*");
      const regex = new RegExp(`^${pattern}$`, "i");
      modelMatches = regex.test(req.modelId);
    } else {
      modelMatches = true; // applies to all models
    }

    if (!modelMatches) continue;

    // Check user role
    if (policy.userRolePattern) {
      const roleRegex = new RegExp(policy.userRolePattern, "i");
      if (!req.userRole || !roleRegex.test(req.userRole)) {
        continue;
      }
    }

    // Check data class
    if (policy.dataClass && policy.dataClass !== dataClass) {
      continue;
    }

    // Policy matches — apply action
    if (policy.action === "deny") {
      return {
        action: "deny",
        reason: `Policy '${policy.name}' denies this request: dataClass=${dataClass}, model=${req.modelId}`,
      };
    }

    if (policy.action === "require_approval") {
      return {
        action: "require_approval",
        reason: `Policy '${policy.name}' requires human approval for this request.`,
        requireHumanApproval: true,
      };
    }

    if (policy.action === "route_fallback") {
      return {
        action: "route_fallback",
        reason: `Policy '${policy.name}' requires fallback routing.`,
        fallbackModelId: policy.fallbackModelId || undefined,
      };
    }

    // action === "allow" — continue to check other policies
  }

  // 4. Default governance check: data class allowed?
  if (governance) {
    if (!governance.dataClassesAllowed.includes(dataClass)) {
      return {
        action: "deny",
        reason: `Model ${req.modelId} is not approved for data class '${dataClass}'. Allowed: ${governance.dataClassesAllowed.join(", ")}`,
      };
    }
  }

  return { action: "allow", reason: "Request passes all policy checks." };
}

// ── Log violations ───────────────────────────────────────────────────────────

async function logViolation(
  req: PolicyCheckRequest,
  policyResult: { action: PolicyAction; reason: string },
  severity: RiskLevel
): Promise<string> {
  const rows = await db
    .insert(policyViolations)
    .values({
      organizationId: req.organizationId,
      apiKeyId: req.apiKeyId,
      modelId: req.modelId,
      dataClass: req.dataClass || "internal",
      violationType: policyResult.action === "deny" ? "unapproved_model" : "data_class_mismatch",
      severity,
      actionTaken: policyResult.action === "deny" ? "blocked" : policyResult.action === "route_fallback" ? "routed_fallback" : "flagged",
      details: { reason: policyResult.reason, metadata: req.metadata },
    })
    .returning({ id: policyViolations.id });

  return rows[0]?.id;
}

// ── Log guardrail outcomes ───────────────────────────────────────────────────

async function logGuardrailOutcomes(
  req: PolicyCheckRequest,
  results: GuardrailResult[]
): Promise<void> {
  const triggered = results.filter((r) => r.triggered);
  if (triggered.length === 0) return;

  for (const result of triggered) {
    await db.insert(guardrailOutcomes).values({
      organizationId: req.organizationId,
      modelId: req.modelId,
      guardrailType: result.type,
      triggered: result.triggered,
      severity: result.severity,
      details: result.details,
      actionTaken: result.actionTaken,
    });
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function checkPolicy(req: PolicyCheckRequest): Promise<PolicyCheckResult> {
  // Run guardrails first
  const guardrailResults = await runGuardrails(req);

  // If critical guardrail triggered (prompt injection), block immediately
  const criticalGuardrail = guardrailResults.find(
    (g) => g.triggered && g.severity === "critical"
  );
  if (criticalGuardrail) {
    const violationId = await logViolation(req, { action: "deny", reason: `Guardrail triggered: ${criticalGuardrail.type}` }, "critical");
    await logGuardrailOutcomes(req, guardrailResults);
    return {
      allowed: false,
      action: "deny",
      reason: `Blocked by guardrail: ${criticalGuardrail.type}.`,
      violationId,
      guardrailResults,
    };
  }

  // Lookup model governance
  const governance = await getModelGovernance(req.modelId);

  // Evaluate policies
  const policyResult = await evaluatePolicies(req, governance);

  if (policyResult.action === "deny") {
    const severity: RiskLevel = governance?.riskLevel || "medium";
    const violationId = await logViolation(req, policyResult, severity);
    await logGuardrailOutcomes(req, guardrailResults);
    return {
      allowed: false,
      action: "deny",
      reason: policyResult.reason,
      violationId,
      guardrailResults,
      governance,
    };
  }

  if (policyResult.action === "require_approval") {
    const severity: RiskLevel = governance?.riskLevel || "medium";
    const violationId = await logViolation(req, policyResult, severity);
    await logGuardrailOutcomes(req, guardrailResults);
    return {
      allowed: false,
      action: "require_approval",
      reason: policyResult.reason,
      requireHumanApproval: true,
      violationId,
      guardrailResults,
      governance,
    };
  }

  if (policyResult.action === "route_fallback") {
    await logGuardrailOutcomes(req, guardrailResults);
    return {
      allowed: true,
      action: "route_fallback",
      reason: policyResult.reason,
      fallbackModelId: policyResult.fallbackModelId,
      guardrailResults,
      governance,
    };
  }

  // Allowed
  await logGuardrailOutcomes(req, guardrailResults);
  return {
    allowed: true,
    action: "allow",
    reason: policyResult.reason,
    guardrailResults,
    governance,
  };
}

// ── Helpers for dashboard ────────────────────────────────────────────────────

export async function listGovernanceModels(organizationId?: string): Promise<ModelGovernanceInfo[]> {
  const rows = await db.select().from(modelGovernance).orderBy(desc(modelGovernance.updatedAt));
  return rows.map((g) => ({
    id: g.id,
    modelId: g.modelId,
    displayName: g.displayName,
    approvalStatus: g.approvalStatus,
    riskLevel: g.riskLevel as RiskLevel,
    allowedUseCases: (g.allowedUseCases as string[]) || [],
    bannedUseCases: (g.bannedUseCases as string[]) || [],
    dataClassesAllowed: (g.dataClassesAllowed as DataClass[]) || ["public", "internal"],
    businessLabels: (g.businessLabels as string[]) || [],
    licenseType: g.licenseType || undefined,
    provenanceVerified: g.provenanceVerified || false,
    biasReviewed: g.biasReviewed || false,
    safetyReviewed: g.safetyReviewed || false,
    sectorTags: (g.sectorTags as string[]) || [],
    ownerTeam: g.ownerTeam || undefined,
    businessCriticality: g.businessCriticality || undefined,
    allowedRegions: (g.allowedRegions as string[]) || ["uk", "eu"],
    lastReviewedBy: g.lastReviewedBy || undefined,
    lastReviewedAt: g.lastReviewedAt || undefined,
  }));
}

export async function getComplianceStatus(modelGovernanceId: string) {
  const mappings = await db
    .select({
      framework: complianceControls.framework,
      controlCode: complianceControls.controlCode,
      controlName: complianceControls.controlName,
      status: modelComplianceMappings.status,
      evidence: modelComplianceMappings.evidence,
    })
    .from(modelComplianceMappings)
    .innerJoin(complianceControls, eq(modelComplianceMappings.controlId, complianceControls.id))
    .where(eq(modelComplianceMappings.modelGovernanceId, modelGovernanceId));

  return mappings;
}
