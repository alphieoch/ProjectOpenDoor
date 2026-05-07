import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const requestStatusEnum = pgEnum("request_status", [
  "success",
  "error",
  "cached",
]);

export const requestTypeEnum = pgEnum("request_type", [
  "chat",
  "embedding",
  "image",
]);

export const deploymentStatusEnum = pgEnum("deployment_status", [
  "pending",
  "building",
  "running",
  "stopped",
  "failed",
  "deleting",
]);

export const dataClassEnum = pgEnum("data_class", [
  "public",
  "internal",
  "confidential",
  "restricted",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "in_review",
  "approved",
  "rejected",
  "deprecated",
]);

export const riskLevelEnum = pgEnum("risk_level", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const policyActionEnum = pgEnum("policy_action", [
  "allow",
  "deny",
  "require_approval",
  "route_fallback",
]);

export const complianceFrameworkEnum = pgEnum("compliance_framework", [
  "gdpr",
  "eu_ai_act",
  "nist_ai_rmf",
  "ico_uk",
  "iso_42001",
]);

export const sectorEnum = pgEnum("sector", [
  "general",
  "legal",
  "finance",
  "property",
  "healthcare",
  "government",
]);

export const organizationSegmentEnum = pgEnum("organization_segment", [
  "standard",
  "education",
  "enterprise_intent",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  plan: varchar("plan", { length: 50 }).notNull().default("free"),
  onboardingSegment: organizationSegmentEnum("onboarding_segment")
    .notNull()
    .default("standard"),
  monthlyBudgetUsd: numeric("monthly_budget_usd", {
    precision: 10,
    scale: 2,
  }).default("0"),
  creditsUsdCents: bigint("credits_usd_cents", { mode: "number" }).notNull().default(0),
  signupCreditGranted: boolean("signup_credit_granted").notNull().default(false),
  autoRechargeEnabled: boolean("auto_recharge_enabled").default(false),
  autoRechargeThresholdCents: bigint("auto_recharge_threshold_cents", {
    mode: "number",
  }),
  autoRechargeAmountCents: bigint("auto_recharge_amount_cents", { mode: "number" }),
  defaultPaymentMethodId: varchar("default_payment_method_id", { length: 255 }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  subscriptionStatus: varchar("subscription_status", { length: 50 }).default("inactive"),
  workosOrganizationId: varchar("workos_organization_id", { length: 255 }),
  workosConnectionId: varchar("workos_connection_id", { length: 255 }),
  ssoEnabled: boolean("sso_enabled").default(false),
  ssoDefaultRole: varchar("sso_default_role", { length: 50 }).default("member"),
  metadata: jsonb("metadata"),
  sector: sectorEnum("sector").notNull().default("general"),
  dataResidency: varchar("data_residency", { length: 50 }).default("uk"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  passwordHash: text("password_hash"),
  organizationId: uuid("organization_id").references(() => organizations.id),
  role: varchar("role", { length: 50 }).notNull().default("member"),
  isSiteAdmin: boolean("is_site_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    allowedModels: jsonb("allowed_models"),
    rateLimitRpm: integer("rate_limit_rpm").default(60),
    rateLimitTpm: integer("rate_limit_tpm").default(100000),
    spendLimitUsdCents: bigint("spend_limit_usd_cents", { mode: "number" }),
    spendUsedUsdCents: bigint("spend_used_usd_cents", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("api_keys_org_idx").on(table.organizationId),
    prefixIdx: uniqueIndex("api_keys_prefix_idx").on(table.keyPrefix),
  })
);

export const providers = pgTable("providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  baseUrl: text("base_url"),
  apiKeyEnvVar: varchar("api_key_env_var", { length: 100 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  region: varchar("region", { length: 50 }),
  isWestern: boolean("is_western").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .references(() => providers.id)
      .notNull(),
    modelId: varchar("model_id", { length: 100 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    ownedBy: varchar("owned_by", { length: 100 }),
    contextWindow: integer("context_window"),
    supportsVision: boolean("supports_vision").default(false),
    supportsTools: boolean("supports_tools").default(false),
    supportsJsonMode: boolean("supports_json_mode").default(false),
    enabled: boolean("enabled").notNull().default(true),
    deploymentStatus: varchar("deployment_status", { length: 30 }).default("available_on_request"),
    family: varchar("family", { length: 20 }).notNull().default("closed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerModelIdx: uniqueIndex("models_provider_model_idx").on(
      table.providerId,
      table.modelId
    ),
  })
);

export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .references(() => providers.id)
      .notNull(),
    modelId: varchar("model_id", { length: 100 }).notNull(),
    region: varchar("region", { length: 50 }).notNull().default("global"),
    inputCostPer1K: numeric("input_cost_per_1k", {
      precision: 12,
      scale: 8,
    }).notNull(),
    outputCostPer1K: numeric("output_cost_per_1k", {
      precision: 12,
      scale: 8,
    }).notNull(),
    markupPercent: numeric("markup_percent", {
      precision: 5,
      scale: 2,
    }).notNull(),
    finalInputCostPer1K: numeric("final_input_cost_per_1k", {
      precision: 12,
      scale: 8,
    }).notNull(),
    finalOutputCostPer1K: numeric("final_output_cost_per_1k", {
      precision: 12,
      scale: 8,
    }).notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerModelRegionIdx: uniqueIndex("pricing_provider_model_region_idx").on(
      table.providerId,
      table.modelId,
      table.region
    ),
  })
);

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    kind: varchar("kind", { length: 30 }).notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    balanceAfterCents: bigint("balance_after_cents", { mode: "number" }).notNull(),
    requestId: uuid("request_id"),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgCreatedIdx: index("credit_transactions_org_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
    paymentIntentIdx: uniqueIndex("credit_transactions_payment_intent_idx").on(
      table.stripePaymentIntentId
    ),
  })
);

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: uuid("api_key_id")
      .references(() => apiKeys.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    providerId: uuid("provider_id")
      .references(() => providers.id)
      .notNull(),
    modelId: varchar("model_id", { length: 100 }).notNull(),
    requestType: requestTypeEnum("request_type").notNull().default("chat"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 8 }).notNull().default(
      "0"
    ),
    status: requestStatusEnum("status").notNull().default("success"),
    errorMessage: text("error_message"),
    dataClass: dataClassEnum("data_class").default("internal"),
    policyViolationId: uuid("policy_violation_id"),
    guardrailOutcome: jsonb("guardrail_outcome"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    region: varchar("region", { length: 50 }).notNull().default("unknown"),
  },
  (table) => ({
    orgIdx: index("requests_org_idx").on(table.organizationId),
    createdAtIdx: index("requests_created_at_idx").on(table.createdAt),
    providerModelIdx: index("requests_provider_model_idx").on(
      table.providerId,
      table.modelId
    ),
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    userId: uuid("user_id").references(() => users.id),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }),
    entityId: varchar("entity_id", { length: 255 }),
    metadata: jsonb("metadata"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("audit_logs_org_idx").on(table.organizationId),
    actionIdx: index("audit_logs_action_idx").on(table.action),
    createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  })
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull().default("member"),
    token: varchar("token", { length: 255 }).notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("invitations_org_idx").on(table.organizationId),
    tokenIdx: uniqueIndex("invitations_token_idx").on(table.token),
    emailIdx: index("invitations_email_idx").on(table.email),
  })
);

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    sourceType: varchar("source_type", { length: 50 }).notNull(), // "image" | "catalog"
    sourceValue: text("source_value").notNull(), // image URL or catalog model ID
    cpu: numeric("cpu", { precision: 4, scale: 2 }).notNull().default("0.5"),
    memoryGb: numeric("memory_gb", { precision: 4, scale: 1 }).notNull().default("1.0"),
    replicas: integer("replicas").notNull().default(1),
    containerAppName: varchar("container_app_name", { length: 100 }),
    fqdn: text("fqdn"),
    azureResourceId: text("azure_resource_id"),
    status: deploymentStatusEnum("status").notNull().default("pending"),
    statusMessage: text("status_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    computeHoursBilled: numeric("compute_hours_billed", { precision: 12, scale: 4 }).default("0"),
    computeCostUsd: numeric("compute_cost_usd", { precision: 12, scale: 4 }).default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("deployments_org_idx").on(table.organizationId),
    statusIdx: index("deployments_status_idx").on(table.status),
  })
);

export const modelCatalog = pgTable(
  "model_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: varchar("model_id", { length: 100 }).notNull().unique(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    huggingFaceRepo: varchar("hf_repo", { length: 255 }),
    inferenceEngine: varchar("inference_engine", { length: 50 }).notNull().default("vllm"),
    defaultCpu: numeric("default_cpu", { precision: 4, scale: 2 }).notNull().default("1.0"),
    defaultMemoryGb: numeric("default_memory_gb", { precision: 4, scale: 1 }).notNull().default("2.0"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
);

export const usageDaily = pgTable(
  "usage_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    providerId: uuid("provider_id")
      .references(() => providers.id)
      .notNull(),
    modelId: varchar("model_id", { length: 100 }).notNull(),
    requestCount: integer("request_count").notNull().default(0),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 8 }).notNull().default(
      "0"
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgDateIdx: uniqueIndex("usage_daily_org_date_idx").on(
      table.organizationId,
      table.date,
      table.providerId,
      table.modelId
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE GOVERNANCE SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

// Curated enterprise model registry with governance metadata
export const modelGovernance = pgTable(
  "model_governance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: varchar("model_id", { length: 100 }).notNull().unique(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    providerId: uuid("provider_id").references(() => providers.id),
    approvalStatus: approvalStatusEnum("approval_status").notNull().default("pending"),
    riskLevel: riskLevelEnum("risk_level").notNull().default("medium"),
    businessLabels: jsonb("business_labels").$type<string[]>().default([]),
    allowedUseCases: jsonb("allowed_use_cases").$type<string[]>().default([]),
    bannedUseCases: jsonb("banned_use_cases").$type<string[]>().default([]),
    dataClassesAllowed: jsonb("data_classes_allowed").$type<string[]>().default(["public", "internal"]),
    licenseType: varchar("license_type", { length: 100 }),
    licenseUrl: text("license_url"),
    provenanceVerified: boolean("provenance_verified").default(false),
    biasReviewed: boolean("bias_reviewed").default(false),
    safetyReviewed: boolean("safety_reviewed").default(false),
    redTeamResults: jsonb("red_team_results"),
    contextWindow: integer("context_window"),
    parameterScale: varchar("parameter_scale", { length: 50 }),
    reasoningModes: jsonb("reasoning_modes").$type<string[]>().default([]),
    costTier: varchar("cost_tier", { length: 50 }).default("standard"),
    sectorTags: jsonb("sector_tags").$type<string[]>().default([]),
    ownerTeam: varchar("owner_team", { length: 255 }),
    businessCriticality: varchar("business_criticality", { length: 50 }).default("standard"),
    allowedRegions: jsonb("allowed_regions").$type<string[]>().default(["uk", "eu"]),
    lastReviewedBy: uuid("last_reviewed_by").references(() => users.id),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    approvalIdx: index("gov_approval_idx").on(table.approvalStatus),
    riskIdx: index("gov_risk_idx").on(table.riskLevel),
  })
);

// Approval workflow tracking for models
export const modelApprovals = pgTable(
  "model_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelGovernanceId: uuid("model_governance_id")
      .references(() => modelGovernance.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    requestedBy: uuid("requested_by")
      .references(() => users.id)
      .notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    status: approvalStatusEnum("status").notNull().default("pending"),
    reviewNotes: text("review_notes"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    modelOrgIdx: index("approvals_model_org_idx").on(table.modelGovernanceId, table.organizationId),
    statusIdx: index("approvals_status_idx").on(table.status),
  })
);

// Model evaluations / benchmark results
export const modelEvaluations = pgTable(
  "model_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelGovernanceId: uuid("model_governance_id")
      .references(() => modelGovernance.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id),
    evaluationName: varchar("evaluation_name", { length: 255 }).notNull(),
    evaluationType: varchar("evaluation_type", { length: 100 }).notNull(), // "benchmark", "red_team", "business_task", "safety"
    score: numeric("score", { precision: 6, scale: 3 }),
    scoreUnit: varchar("score_unit", { length: 50 }).default("percent"),
    passThreshold: numeric("pass_threshold", { precision: 6, scale: 3 }),
    passed: boolean("passed"),
    details: jsonb("details"),
    datasetRef: text("dataset_ref"),
    evaluatedBy: uuid("evaluated_by").references(() => users.id),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    modelIdx: index("evals_model_idx").on(table.modelGovernanceId),
    typeIdx: index("evals_type_idx").on(table.evaluationType),
  })
);

// Data classification policies
export const modelPolicies = pgTable(
  "model_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    dataClass: dataClassEnum("data_class").notNull(),
    modelGovernanceId: uuid("model_governance_id")
      .references(() => modelGovernance.id),
    modelIdPattern: varchar("model_id_pattern", { length: 255 }), // regex/wildcard for matching models
    userRolePattern: varchar("user_role_pattern", { length: 255 }), // e.g. "admin|compliance"
    action: policyActionEnum("action").notNull().default("allow"),
    fallbackModelId: varchar("fallback_model_id", { length: 100 }),
    requireHumanApproval: boolean("require_human_approval").default(false),
    scope: varchar("scope", { length: 50 }).notNull().default("organization"),
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(100),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("policies_org_idx").on(table.organizationId),
    enabledIdx: index("policies_enabled_idx").on(table.enabled),
  })
);

// Policy violations logged at request time
export const policyViolations = pgTable(
  "policy_violations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    policyId: uuid("policy_id")
      .references(() => modelPolicies.id),
    apiKeyId: uuid("api_key_id")
      .references(() => apiKeys.id),
    modelId: varchar("model_id", { length: 100 }).notNull(),
    dataClass: dataClassEnum("data_class").notNull(),
    violationType: varchar("violation_type", { length: 100 }).notNull(), // "unapproved_model", "data_class_mismatch", "rate_limit", "cost_limit"
    severity: riskLevelEnum("severity").notNull().default("medium"),
    actionTaken: varchar("action_taken", { length: 100 }).notNull(), // "blocked", "routed_fallback", "flagged", "allowed_with_approval"
    details: jsonb("details"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("violations_org_idx").on(table.organizationId),
    severityIdx: index("violations_severity_idx").on(table.severity),
    createdAtIdx: index("violations_created_at_idx").on(table.createdAt),
  })
);

// Compliance framework controls
export const complianceControls = pgTable(
  "compliance_controls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    framework: complianceFrameworkEnum("framework").notNull(),
    controlCode: varchar("control_code", { length: 100 }).notNull(),
    controlName: varchar("control_name", { length: 255 }).notNull(),
    description: text("description"),
    requirementLevel: varchar("requirement_level", { length: 50 }).default("required"), // "required", "recommended", "optional"
    guidance: text("guidance"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    frameworkCodeIdx: uniqueIndex("compliance_framework_code_idx").on(table.framework, table.controlCode),
  })
);

// Model-to-compliance-control mappings
export const modelComplianceMappings = pgTable(
  "model_compliance_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelGovernanceId: uuid("model_governance_id")
      .references(() => modelGovernance.id)
      .notNull(),
    controlId: uuid("control_id")
      .references(() => complianceControls.id)
      .notNull(),
    status: varchar("status", { length: 50 }).notNull().default("not_assessed"), // "compliant", "partial", "non_compliant", "not_assessed"
    evidence: text("evidence"),
    assessedBy: uuid("assessed_by").references(() => users.id),
    assessedAt: timestamp("assessed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    modelControlIdx: uniqueIndex("compliance_model_control_idx").on(table.modelGovernanceId, table.controlId),
  })
);

// Sector-specific templates
export const sectorTemplates = pgTable(
  "sector_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sector: sectorEnum("sector").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    defaultModels: jsonb("default_models").$type<string[]>().default([]),
    defaultPolicies: jsonb("default_policies"),
    promptTemplates: jsonb("prompt_templates"),
    guardrailConfig: jsonb("guardrail_config"),
    complianceRequirements: jsonb("compliance_requirements").$type<string[]>().default([]),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sectorIdx: index("templates_sector_idx").on(table.sector),
  })
);

// Agent run tracking
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    apiKeyId: uuid("api_key_id")
      .references(() => apiKeys.id),
    agentName: varchar("agent_name", { length: 255 }).notNull(),
    modelId: varchar("model_id", { length: 100 }).notNull(),
    threadId: varchar("thread_id", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull().default("running"), // "running", "completed", "failed", "halted"
    promptTokens: integer("prompt_tokens").default(0),
    completionTokens: integer("completion_tokens").default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 8 }).default("0"),
    toolsUsed: jsonb("tools_used").$type<string[]>().default([]),
    steps: jsonb("steps"), // array of step objects
    guardrailOutcomes: jsonb("guardrail_outcomes"),
    humanApprovalRequired: boolean("human_approval_required").default(false),
    humanApprovedBy: uuid("human_approved_by").references(() => users.id),
    humanApprovedAt: timestamp("human_approved_at", { withTimezone: true }),
    decisionTrace: jsonb("decision_trace"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("agent_runs_org_idx").on(table.organizationId),
    statusIdx: index("agent_runs_status_idx").on(table.status),
    createdAtIdx: index("agent_runs_created_at_idx").on(table.createdAt),
  })
);

// Guardrail outcome logs
export const guardrailOutcomes = pgTable(
  "guardrail_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id"),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    modelId: varchar("model_id", { length: 100 }).notNull(),
    guardrailType: varchar("guardrail_type", { length: 100 }).notNull(), // "pii_detection", "prompt_injection", "toxicity", "bias", "secret_scanning"
    triggered: boolean("triggered").notNull().default(false),
    severity: riskLevelEnum("severity").default("low"),
    details: jsonb("details"),
    actionTaken: varchar("action_taken", { length: 100 }).default("none"), // "blocked", "redacted", "flagged", "allowed"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("guardrails_org_idx").on(table.organizationId),
    typeIdx: index("guardrails_type_idx").on(table.guardrailType),
    triggeredIdx: index("guardrails_triggered_idx").on(table.triggered),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// DRIZZLE RELATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  apiKeys: many(apiKeys),
  creditTransactions: many(creditTransactions),
  requests: many(requests),
  auditLogs: many(auditLogs),
  invitations: many(invitations),
  deployments: many(deployments),
  usageDaily: many(usageDaily),
  agentRuns: many(agentRuns),
  guardrailOutcomes: many(guardrailOutcomes),
  modelApprovals: many(modelApprovals),
  modelEvaluations: many(modelEvaluations),
  modelPolicies: many(modelPolicies),
  policyViolations: many(policyViolations),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiKeys.organizationId],
    references: [organizations.id],
  }),
}));

export const providersRelations = relations(providers, ({ many }) => ({
  models: many(models),
  requests: many(requests),
  usageDaily: many(usageDaily),
}));

export const modelsRelations = relations(models, ({ one }) => ({
  provider: one(providers, {
    fields: [models.providerId],
    references: [providers.id],
  }),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  organization: one(organizations, {
    fields: [creditTransactions.organizationId],
    references: [organizations.id],
  }),
}));

export const requestsRelations = relations(requests, ({ one }) => ({
  organization: one(organizations, {
    fields: [requests.organizationId],
    references: [organizations.id],
  }),
  apiKey: one(apiKeys, {
    fields: [requests.apiKeyId],
    references: [apiKeys.id],
  }),
  provider: one(providers, {
    fields: [requests.providerId],
    references: [providers.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  inviter: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  organization: one(organizations, {
    fields: [deployments.organizationId],
    references: [organizations.id],
  }),
}));

export const modelGovernanceRelations = relations(modelGovernance, ({ one, many }) => ({
  provider: one(providers, {
    fields: [modelGovernance.providerId],
    references: [providers.id],
  }),
  approvals: many(modelApprovals),
  evaluations: many(modelEvaluations),
  policies: many(modelPolicies),
  complianceMappings: many(modelComplianceMappings),
}));

export const modelApprovalsRelations = relations(modelApprovals, ({ one }) => ({
  modelGovernance: one(modelGovernance, {
    fields: [modelApprovals.modelGovernanceId],
    references: [modelGovernance.id],
  }),
  organization: one(organizations, {
    fields: [modelApprovals.organizationId],
    references: [organizations.id],
  }),
  requestedByUser: one(users, {
    fields: [modelApprovals.requestedBy],
    references: [users.id],
  }),
  reviewedByUser: one(users, {
    fields: [modelApprovals.reviewedBy],
    references: [users.id],
  }),
}));

export const modelEvaluationsRelations = relations(modelEvaluations, ({ one }) => ({
  modelGovernance: one(modelGovernance, {
    fields: [modelEvaluations.modelGovernanceId],
    references: [modelGovernance.id],
  }),
  organization: one(organizations, {
    fields: [modelEvaluations.organizationId],
    references: [organizations.id],
  }),
  evaluatedByUser: one(users, {
    fields: [modelEvaluations.evaluatedBy],
    references: [users.id],
  }),
}));

export const modelPoliciesRelations = relations(modelPolicies, ({ one }) => ({
  organization: one(organizations, {
    fields: [modelPolicies.organizationId],
    references: [organizations.id],
  }),
  modelGovernance: one(modelGovernance, {
    fields: [modelPolicies.modelGovernanceId],
    references: [modelGovernance.id],
  }),
}));

export const policyViolationsRelations = relations(policyViolations, ({ one }) => ({
  organization: one(organizations, {
    fields: [policyViolations.organizationId],
    references: [organizations.id],
  }),
  policy: one(modelPolicies, {
    fields: [policyViolations.policyId],
    references: [modelPolicies.id],
  }),
  apiKey: one(apiKeys, {
    fields: [policyViolations.apiKeyId],
    references: [apiKeys.id],
  }),
  resolvedByUser: one(users, {
    fields: [policyViolations.resolvedBy],
    references: [users.id],
  }),
}));

export const complianceControlsRelations = relations(complianceControls, ({ many }) => ({
  modelMappings: many(modelComplianceMappings),
}));

export const modelComplianceMappingsRelations = relations(modelComplianceMappings, ({ one }) => ({
  modelGovernance: one(modelGovernance, {
    fields: [modelComplianceMappings.modelGovernanceId],
    references: [modelGovernance.id],
  }),
  control: one(complianceControls, {
    fields: [modelComplianceMappings.controlId],
    references: [complianceControls.id],
  }),
  assessedByUser: one(users, {
    fields: [modelComplianceMappings.assessedBy],
    references: [users.id],
  }),
}));

export const agentRunsRelations = relations(agentRuns, ({ one }) => ({
  organization: one(organizations, {
    fields: [agentRuns.organizationId],
    references: [organizations.id],
  }),
  apiKey: one(apiKeys, {
    fields: [agentRuns.apiKeyId],
    references: [apiKeys.id],
  }),
  humanApprovedByUser: one(users, {
    fields: [agentRuns.humanApprovedBy],
    references: [users.id],
  }),
}));

export const guardrailOutcomesRelations = relations(guardrailOutcomes, ({ one }) => ({
  organization: one(organizations, {
    fields: [guardrailOutcomes.organizationId],
    references: [organizations.id],
  }),
  agentRun: one(agentRuns, {
    fields: [guardrailOutcomes.agentRunId],
    references: [agentRuns.id],
  }),
}));

export const usageDailyRelations = relations(usageDaily, ({ one }) => ({
  organization: one(organizations, {
    fields: [usageDaily.organizationId],
    references: [organizations.id],
  }),
  provider: one(providers, {
    fields: [usageDaily.providerId],
    references: [providers.id],
  }),
}));

/* ─────────────────────────────────────────────────────────────────
   AI Assistants  (white-label AI launchpad)
───────────────────────────────────────────────────────────────── */
export const aiAssistants = pgTable("ai_assistants", {
  id:             uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdBy:      uuid("created_by").references(() => users.id),
  // Identity
  name:           varchar("name", { length: 255 }).notNull(),
  slug:           varchar("slug", { length: 100 }).notNull().unique(),
  description:    text("description"),
  avatarLetter:   varchar("avatar_letter", { length: 1 }),
  primaryColor:   varchar("primary_color", { length: 7 }).default("#1A73E8"),
  // Model config
  modelId:        varchar("model_id", { length: 100 }).default("gpt-4o"),
  systemPrompt:   text("system_prompt"),
  welcomeMessage: text("welcome_message"),
  maxMessages:    integer("max_messages"),
  // Access
  visibility:     varchar("visibility", { length: 20 }).default("private"),
  // Monetization
  monetization:   varchar("monetization", { length: 20 }).default("free"),
  priceCents:     integer("price_cents").default(0),
  stripePriceId:  varchar("stripe_price_id", { length: 255 }),
  // State
  enabled:        boolean("enabled").notNull().default(true),
  publishedAt:    timestamp("published_at", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgIdx:  index("ai_assistants_org_idx").on(t.organizationId),
  slugIdx: index("ai_assistants_slug_idx").on(t.slug),
}));

export const aiAssistantsRelations = relations(aiAssistants, ({ one }) => ({
  organization: one(organizations, {
    fields: [aiAssistants.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [aiAssistants.createdBy],
    references: [users.id],
  }),
}));
