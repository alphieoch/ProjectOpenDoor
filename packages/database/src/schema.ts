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
  unique,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const requestStatusEnum = pgEnum("request_status", [
  "success",
  "error",
  "cached",
]);

export const requestTypeEnum = pgEnum("request_type", [
  "chat",
  "embedding",
  "image",
  "rerank",
  "completion",
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
  "insurance",
  "education",
  "energy",
  "retail",
  "media",
  "transport",
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
  dailyTokenBudget:    bigint("daily_token_budget", { mode: "number" }),
  weeklyTokenBudget:   bigint("weekly_token_budget", { mode: "number" }),
  monthlyTokenBudget:  bigint("monthly_token_budget", { mode: "number" }),
  budgetAlertThresholdPercent: integer("budget_alert_threshold_percent").default(80),
  creditsUsdCents: bigint("credits_usd_cents", { mode: "number" }).notNull().default(0),
  welcomeCreditsUsdCents: bigint("welcome_credits_usd_cents", { mode: "number" })
    .notNull()
    .default(0),
  welcomeExpiresAt: timestamp("welcome_expires_at", { withTimezone: true }),
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
  agentsAddonStatus: varchar("agents_addon_status", { length: 50 }).notNull().default("inactive"),
  stripeAgentsSubscriptionId: varchar("stripe_agents_subscription_id", { length: 255 }),
  webSearchAddonStatus: varchar("web_search_addon_status", { length: 50 }).notNull().default("inactive"),
  stripeWebSearchSubscriptionId: varchar("stripe_web_search_subscription_id", { length: 255 }),
  workosOrganizationId: varchar("workos_organization_id", { length: 255 }),
  workosConnectionId: varchar("workos_connection_id", { length: 255 }),
  ssoEnabled: boolean("sso_enabled").default(false),
  ssoDefaultRole: varchar("sso_default_role", { length: 50 }).default("member"),
  customDomain: varchar("custom_domain", { length: 255 }),
  customDomainVerified: boolean("custom_domain_verified").default(false),
  emailNotificationsEnabled: boolean("email_notifications_enabled").default(true),
  notifyOnInvites: boolean("notify_on_invites").default(true),
  notifyOnBillingAlerts: boolean("notify_on_billing_alerts").default(true),
  metadata: jsonb("metadata"),
  sector: sectorEnum("sector").notNull().default("general"),
  dataResidency: varchar("data_residency", { length: 50 }).default("uk"),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
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
  protectedChild: boolean("protected_child").notNull().default(false),
  monthlyCreditSubCapCents: integer("monthly_credit_sub_cap_cents"),
  allowedChatModes: text("allowed_chat_modes")
    .array()
    .notNull()
    .default(sql`ARRAY['flash','auto','thinking','max','max_fast']::text[]`),
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
    // live | warming | dedicated | available_on_request | coming_soon
    deploymentStatus: varchar("deployment_status", { length: 30 }).default("live"),
    family: varchar("family", { length: 20 }).notNull().default("closed"),
    /** True = callable with no deploy step (wholesale or warm pool) */
    serverless: boolean("serverless").notNull().default(false),
    origin: varchar("origin", { length: 20 }).default("global"), // cn | us | eu | global | ke | africa
    source: varchar("source", { length: 30 }).default("provider_api"), // ollama | huggingface | provider_api
    huggingFaceRepo: varchar("hf_repo", { length: 255 }),
    ollamaTag: varchar("ollama_tag", { length: 100 }),
    listedAt: timestamp("listed_at", { withTimezone: true }).defaultNow(),
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
    /** Cached prompt tokens — defaults to same as input until prompt cache ships */
    cachedInputCostPer1K: numeric("cached_input_cost_per_1k", {
      precision: 12,
      scale: 8,
    }),
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
    finalCachedInputCostPer1K: numeric("final_cached_input_cost_per_1k", {
      precision: 12,
      scale: 8,
    }),
    batchMultiplier: numeric("batch_multiplier", {
      precision: 4,
      scale: 2,
    }).default("0.50"),
    modality: varchar("modality", { length: 20 }).notNull().default("chat"), // chat | embedding
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

/** On-demand GPU SKUs (Fireworks-style hourly table; billed per second in practice) */
export const gpuSkus = pgTable("gpu_skus", {
  id: uuid("id").primaryKey().defaultRandom(),
  sku: varchar("sku", { length: 50 }).notNull().unique(), // nvidia-l4 | nvidia-a100 | nvidia-h100
  displayName: varchar("display_name", { length: 100 }).notNull(),
  hourlyUsd: numeric("hourly_usd", { precision: 10, scale: 4 }).notNull(),
  regionMultiplier: numeric("region_multiplier", { precision: 4, scale: 2 }).default("1.00"),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creditLedgerBuckets = pgTable(
  "credit_ledger_buckets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    initialAmountCents: integer("initial_amount_cents").notNull(),
    remainingAmountCents: integer("remaining_amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    bucketType: varchar("bucket_type", { length: 32 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgExpiresIdx: index("credit_ledger_buckets_org_expires_idx").on(
      table.organizationId,
      table.expiresAt
    ),
    remainingIdx: index("credit_ledger_buckets_remaining_idx").on(
      table.organizationId,
      table.remainingAmountCents
    ),
  })
);

export const chatRateLimits = pgTable(
  "chat_rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    windowStartTime: timestamp("window_start_time", { withTimezone: true }).notNull().defaultNow(),
    windowExpiresAt: timestamp("window_expires_at", { withTimezone: true }).notNull(),
    messageCount: integer("message_count").notNull().default(0),
    scope: varchar("scope", { length: 16 }).notNull().default("user"),
  },
  (table) => ({
    orgExpiresIdx: index("chat_rate_limits_org_expires_idx").on(
      table.organizationId,
      table.windowExpiresAt
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

/** GDPR Art. 6(1)(a) consent before we read this machine's GPU / memory / local models. */
export const deviceInventoryConsents = pgTable(
  "device_inventory_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    granted: boolean("granted").notNull().default(false),
    purpose: text("purpose").notNull(),
    version: varchar("version", { length: 50 }).notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: uniqueIndex("device_inventory_consents_user_idx").on(table.userId),
    orgIdx: index("device_inventory_consents_org_idx").on(table.organizationId),
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
    target: varchar("target", { length: 20 }).notNull().default("local"), // local | gcp | azure
    gpuType: varchar("gpu_type", { length: 50 }).notNull().default("none"), // none | metal | nvidia-l4 | nvidia-t4 | nvidia-a100
    gpuCount: integer("gpu_count").notNull().default(0),
    localRuntime: varchar("local_runtime", { length: 50 }), // ollama | vllm
    runtimeModel: varchar("runtime_model", { length: 255 }),
    containerAppName: varchar("container_app_name", { length: 100 }),
    fqdn: text("fqdn"),
    azureResourceId: text("azure_resource_id"),
    gcpResourceId: text("gcp_resource_id"),
    status: deploymentStatusEnum("status").notNull().default("pending"),
    statusMessage: text("status_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    computeHoursBilled: numeric("compute_hours_billed", { precision: 12, scale: 4 }).default("0"),
    computeCostUsd: numeric("compute_cost_usd", { precision: 12, scale: 4 }).default("0"),
    minReplicas: integer("min_replicas").notNull().default(0),
    maxReplicas: integer("max_replicas").notNull().default(1),
    scaleToZero: boolean("scale_to_zero").notNull().default(true),
    autoscalingEnabled: boolean("autoscaling_enabled").notNull().default(true),
    precision: varchar("precision", { length: 20 }).default("fp16"),
    weightsUri: text("weights_uri"),
    regionLocked: boolean("region_locked").notNull().default(false),
    reserved: boolean("reserved").notNull().default(false),
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

/** LoRA adapters loaded onto a dedicated deployment */
export const deploymentLoras = pgTable(
  "deployment_loras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deploymentId: uuid("deployment_id")
      .references(() => deployments.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    adapterUri: text("adapter_uri").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    loadedAt: timestamp("loaded_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    deploymentIdx: index("deployment_loras_deployment_idx").on(table.deploymentId),
  })
);

export const deploymentRouters = pgTable(
  "deployment_routers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgSlugIdx: uniqueIndex("deployment_routers_org_slug_idx").on(
      table.organizationId,
      table.slug
    ),
  })
);

export const deploymentRouterTargets = pgTable(
  "deployment_router_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routerId: uuid("router_id")
      .references(() => deploymentRouters.id, { onDelete: "cascade" })
      .notNull(),
    deploymentId: uuid("deployment_id")
      .references(() => deployments.id, { onDelete: "cascade" })
      .notNull(),
    weight: integer("weight").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    routerIdx: index("deployment_router_targets_router_idx").on(table.routerId),
  })
);

/** Wave 4 — org datasets for SFT / DPO / eval */
export const trainingDatasets = pgTable(
  "training_datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    format: varchar("format", { length: 40 }).notNull().default("jsonl"),
    purpose: varchar("purpose", { length: 40 }).notNull().default("sft"),
    storageUri: text("storage_uri"),
    rowCount: integer("row_count").notNull().default(0),
    byteSize: bigint("byte_size", { mode: "number" }).notNull().default(0),
    status: varchar("status", { length: 30 }).notNull().default("ready"),
    sample: jsonb("sample"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgSlugIdx: uniqueIndex("training_datasets_org_slug_idx").on(
      table.organizationId,
      table.slug
    ),
    orgIdx: index("training_datasets_org_idx").on(table.organizationId),
  })
);

export const trainingJobs = pgTable(
  "training_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    datasetId: uuid("dataset_id").references(() => trainingDatasets.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 200 }).notNull(),
    method: varchar("method", { length: 40 }).notNull().default("sft"),
    baseModelId: varchar("base_model_id", { length: 150 }).notNull(),
    outputModelId: varchar("output_model_id", { length: 150 }),
    hyperparameters: jsonb("hyperparameters").notNull().default({}),
    status: varchar("status", { length: 30 }).notNull().default("queued"),
    progressPercent: integer("progress_percent").notNull().default(0),
    statusMessage: text("status_message"),
    providerJobId: varchar("provider_job_id", { length: 255 }),
    providerSlug: varchar("provider_slug", { length: 50 }).default("together"),
    costUsd: numeric("cost_usd", { precision: 12, scale: 4 }).default("0"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("training_jobs_org_idx").on(table.organizationId),
    statusIdx: index("training_jobs_status_idx").on(table.status),
  })
);

export const fineTunedModels = pgTable(
  "fine_tuned_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    trainingJobId: uuid("training_job_id").references(() => trainingJobs.id, {
      onDelete: "set null",
    }),
    modelId: varchar("model_id", { length: 150 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    baseModelId: varchar("base_model_id", { length: 150 }).notNull(),
    providerSlug: varchar("provider_slug", { length: 50 }).notNull().default("together"),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    billAsBase: boolean("bill_as_base").notNull().default(true),
    adapterUri: text("adapter_uri"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgModelIdx: uniqueIndex("fine_tuned_models_org_model_idx").on(
      table.organizationId,
      table.modelId
    ),
    orgIdx: index("fine_tuned_models_org_idx").on(table.organizationId),
    baseIdx: index("fine_tuned_models_base_idx").on(table.baseModelId),
  })
);

export const trainingEvaluators = pgTable("training_evaluators", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  kind: varchar("kind", { length: 40 }).notNull().default("llm_judge"),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const trainingEvalJobs = pgTable(
  "training_eval_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    evaluatorId: uuid("evaluator_id").references(() => trainingEvaluators.id, {
      onDelete: "set null",
    }),
    datasetId: uuid("dataset_id").references(() => trainingDatasets.id, {
      onDelete: "set null",
    }),
    modelId: varchar("model_id", { length: 150 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("queued"),
    score: numeric("score", { precision: 8, scale: 4 }),
    metrics: jsonb("metrics"),
    statusMessage: text("status_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("training_eval_jobs_org_idx").on(table.organizationId),
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
    ollamaTag: varchar("ollama_tag", { length: 100 }),
    inferenceEngine: varchar("inference_engine", { length: 50 }).notNull().default("vllm"),
    defaultCpu: numeric("default_cpu", { precision: 4, scale: 2 }).notNull().default("1.0"),
    defaultMemoryGb: numeric("default_memory_gb", { precision: 4, scale: 1 }).notNull().default("2.0"),
    minGpuMemoryGb: numeric("min_gpu_memory_gb", { precision: 4, scale: 1 }),
    origin: varchar("origin", { length: 20 }).notNull().default("global"),
    source: varchar("source", { length: 30 }).notNull().default("huggingface"),
    deploymentStatus: varchar("deployment_status", { length: 30 }).notNull().default("warming"),
    serverless: boolean("serverless").notNull().default(false),
    listedAt: timestamp("listed_at", { withTimezone: true }).defaultNow(),
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

/* ─────────────────────────────────────────────────────────────────
   Workspace agents (OpenClaw / Hermes / NemoClaw)
───────────────────────────────────────────────────────────────── */
export const workspaceAgents = pgTable(
  "workspace_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    runtime: varchar("runtime", { length: 40 }).notNull(),
    modelId: varchar("model_id", { length: 150 }).notNull(),
    systemPrompt: text("system_prompt"),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    statusMessage: text("status_message"),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    keyPrefix: varchar("key_prefix", { length: 16 }),
    secretCiphertext: text("secret_ciphertext"),
    secretIv: text("secret_iv"),
    secretTag: text("secret_tag"),
    config: jsonb("config").$type<Record<string, unknown>>().default({}),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("workspace_agents_org_idx").on(table.organizationId),
    orgSlugIdx: uniqueIndex("workspace_agents_org_slug_idx").on(
      table.organizationId,
      table.slug
    ),
    statusIdx: index("workspace_agents_status_idx").on(table.status),
  })
);

export const workspaceAgentMessages = pgTable(
  "workspace_agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => workspaceAgents.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull().default(""),
    toolName: varchar("tool_name", { length: 80 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdx: index("workspace_agent_messages_agent_idx").on(table.agentId),
    orgIdx: index("workspace_agent_messages_org_idx").on(table.organizationId),
  })
);

export const workspaceAgentsRelations = relations(workspaceAgents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workspaceAgents.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [workspaceAgents.createdBy],
    references: [users.id],
  }),
  apiKey: one(apiKeys, {
    fields: [workspaceAgents.apiKeyId],
    references: [apiKeys.id],
  }),
  messages: many(workspaceAgentMessages),
}));

export const workspaceAgentMessagesRelations = relations(workspaceAgentMessages, ({ one }) => ({
  agent: one(workspaceAgents, {
    fields: [workspaceAgentMessages.agentId],
    references: [workspaceAgents.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// DRIZZLE RELATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  apiKeys: many(apiKeys),
  creditTransactions: many(creditTransactions),
  creditLedgerBuckets: many(creditLedgerBuckets),
  chatRateLimits: many(chatRateLimits),
  requests: many(requests),
  auditLogs: many(auditLogs),
  deviceInventoryConsents: many(deviceInventoryConsents),
  invitations: many(invitations),
  deployments: many(deployments),
  usageDaily: many(usageDaily),
  agentRuns: many(agentRuns),
  workspaceAgents: many(workspaceAgents),
  guardrailOutcomes: many(guardrailOutcomes),
  modelApprovals: many(modelApprovals),
  modelEvaluations: many(modelEvaluations),
  modelPolicies: many(modelPolicies),
  policyViolations: many(policyViolations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  deviceInventoryConsents: many(deviceInventoryConsents),
  chatRateLimits: many(chatRateLimits),
}));

export const creditLedgerBucketsRelations = relations(creditLedgerBuckets, ({ one }) => ({
  organization: one(organizations, {
    fields: [creditLedgerBuckets.organizationId],
    references: [organizations.id],
  }),
}));

export const chatRateLimitsRelations = relations(chatRateLimits, ({ one }) => ({
  organization: one(organizations, {
    fields: [chatRateLimits.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [chatRateLimits.userId],
    references: [users.id],
  }),
}));

export const deviceInventoryConsentsRelations = relations(deviceInventoryConsents, ({ one }) => ({
  organization: one(organizations, {
    fields: [deviceInventoryConsents.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [deviceInventoryConsents.userId],
    references: [users.id],
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

export const deploymentsRelations = relations(deployments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [deployments.organizationId],
    references: [organizations.id],
  }),
  loras: many(deploymentLoras),
}));

export const deploymentLorasRelations = relations(deploymentLoras, ({ one }) => ({
  deployment: one(deployments, {
    fields: [deploymentLoras.deploymentId],
    references: [deployments.id],
  }),
}));

export const deploymentRoutersRelations = relations(deploymentRouters, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [deploymentRouters.organizationId],
    references: [organizations.id],
  }),
  targets: many(deploymentRouterTargets),
}));

export const deploymentRouterTargetsRelations = relations(
  deploymentRouterTargets,
  ({ one }) => ({
    router: one(deploymentRouters, {
      fields: [deploymentRouterTargets.routerId],
      references: [deploymentRouters.id],
    }),
    deployment: one(deployments, {
      fields: [deploymentRouterTargets.deploymentId],
      references: [deployments.id],
    }),
  })
);

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

export const complianceRules = pgTable("compliance_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  framework: complianceFrameworkEnum("framework"),
  controlCode: varchar("control_code", { length: 50 }),
  ruleType: varchar("rule_type", { length: 50 }).notNull().default("model_attribute"),
  ruleConfig: jsonb("rule_config"),
  severity: varchar("severity", { length: 50 }).notNull().default("medium"),
  recommendation: text("recommendation"),
  referenceUrl: text("reference_url"),
  referenceName: text("reference_name"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const complianceReports = pgTable("compliance_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  modelGovernanceId: uuid("model_governance_id").references(() => modelGovernance.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  framework: complianceFrameworkEnum("framework"),
  statusSummary: jsonb("status_summary"),
  findings: jsonb("findings"),
  recommendations: jsonb("recommendations"),
  score: integer("score"),
  passed: boolean("passed").default(false),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  generatedBy: uuid("generated_by").references(() => users.id),
});

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
  logoUrl:        varchar("logo_url", { length: 500 }),
  primaryColor:   varchar("primary_color", { length: 7 }).default("#1A73E8"),
  // Model config
  modelId:        varchar("model_id", { length: 100 }).default("gpt-4o"),
  systemPrompt:   text("system_prompt"),
  welcomeMessage: text("welcome_message"),
  maxMessages:    integer("max_messages"),
  // Access
  visibility:     varchar("visibility", { length: 20 }).default("private"),
  // Monetization
  monetization:        varchar("monetization", { length: 20 }).default("free"),
  priceCents:          integer("price_cents").default(0),
  sellerEarningsCents: integer("seller_earnings_cents").default(0),
  platformFeePercent:  integer("platform_fee_percent").default(1500),
  usageMode:           varchar("usage_mode", { length: 20 }).default("included"),
  cooldownMinutes:     integer("cooldown_minutes"),
  // Limits
  periodWindow:        varchar("period_window", { length: 20 }),
  periodMessageLimit:  integer("period_message_limit"),
  weeklyMessageLimit:  integer("weekly_message_limit"),
  // Token limits
  maxTokensPerSession: integer("max_tokens_per_session"),
  maxTokensPerPeriod:  integer("max_tokens_per_period"),
  maxTokensPerMessage: integer("max_tokens_per_message"),
  costCapCents:        integer("cost_cap_cents"),
  // Metered pricing
  meteredPricePerMessageCents: integer("metered_price_per_message_cents"),
  meteredPricePer1kTokensCents: integer("metered_price_per_1k_tokens_cents"),
  stripePriceId:       varchar("stripe_price_id", { length: 255 }),
  // State
  enabled:           boolean("enabled").notNull().default(true),
  publishedAt:       timestamp("published_at", { withTimezone: true }),
  // Password protection
  passwordProtected: boolean("password_protected").notNull().default(false),
  passwordHash:      text("password_hash"),
  // MCP servers (Model Context Protocol)
  mcpServers:        jsonb("mcp_servers").$type<{
    id: string;
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    enabled: boolean;
  }[]>().default([]),
  // Feature toggles
  deepThinkingEnabled:   boolean("deep_thinking_enabled").notNull().default(false),
  webSearchEnabled:      boolean("web_search_enabled").notNull().default(false),
  researchAgentEnabled:  boolean("research_agent_enabled").notNull().default(false),
  codeExecutionEnabled:  boolean("code_execution_enabled").notNull().default(false),
  imageGenerationEnabled: boolean("image_generation_enabled").notNull().default(false),
  // API connections (dynamic REST API tools)
  apiConnections:    jsonb("api_connections").$type<{
    id: string;
    name: string;
    baseUrl: string;
    authType: "bearer" | "api_key" | "header";
    secretId: string; // reference to assistant_api_secrets
    apiKeyHeader: string;
    docsUrl: string;
    enabled: boolean;
    endpoints?: {
      name: string;
      method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      path: string;
      description: string;
      enabled: boolean;
      parameters?: { name: string; type: string; required: boolean; location: "query" | "path" | "body" }[];
    }[];
  }[]>().default([]),
  createdAt:         timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgIdx:  index("ai_assistants_org_idx").on(t.organizationId),
  slugIdx: index("ai_assistants_slug_idx").on(t.slug),
}));

export const aiAssistantsRelations = relations(aiAssistants, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [aiAssistants.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [aiAssistants.createdBy],
    references: [users.id],
  }),
  documents:    many(assistantDocuments),
  connections:  many(assistantConnections),
}));

export const assistantDocuments = pgTable("assistant_documents", {
  id:             uuid("id").primaryKey().defaultRandom(),
  assistantId:    uuid("assistant_id").notNull().references(() => aiAssistants.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name:           varchar("name", { length: 255 }).notNull(),
  fileType:       varchar("file_type", { length: 50 }),
  fileSizeBytes:  integer("file_size_bytes"),
  blobUrl:        text("blob_url").notNull(),
  status:         varchar("status", { length: 20 }).notNull().default("uploaded"),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  assistantIdx: index("assistant_documents_assistant_idx").on(t.assistantId),
}));

export const assistantDocumentsRelations = relations(assistantDocuments, ({ one }) => ({
  assistant: one(aiAssistants, {
    fields: [assistantDocuments.assistantId],
    references: [aiAssistants.id],
  }),
}));

export const assistantConnections = pgTable("assistant_connections", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  assistantId:        uuid("assistant_id").notNull().references(() => aiAssistants.id, { onDelete: "cascade" }),
  organizationId:     uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  appSlug:            varchar("app_slug", { length: 100 }).notNull(),
  appName:            varchar("app_name", { length: 255 }),
  appLogo:            text("app_logo"),
  connectedAccountId: varchar("connected_account_id", { length: 255 }),
  status:             varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  assistantIdx:         index("assistant_connections_assistant_idx").on(t.assistantId),
  uniqueAppPerAssistant: unique("assistant_connections_unique_app").on(t.assistantId, t.appSlug),
}));

export const assistantConnectionsRelations = relations(assistantConnections, ({ one, many }) => ({
  assistant: one(aiAssistants, {
    fields: [assistantConnections.assistantId],
    references: [aiAssistants.id],
  }),
  tools: many(assistantConnectionTools),
}));

export const assistantConnectionTools = pgTable("assistant_connection_tools", {
  id:           uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").notNull().references(() => assistantConnections.id, { onDelete: "cascade" }),
  toolSlug:     varchar("tool_slug", { length: 255 }).notNull(),
  toolName:     varchar("tool_name", { length: 255 }),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  connectionIdx: index("assistant_connection_tools_conn_idx").on(t.connectionId),
  uniqueToolPerConnection: unique("assistant_connection_tools_unique").on(t.connectionId, t.toolSlug),
}));

export const assistantConnectionToolsRelations = relations(assistantConnectionTools, ({ one }) => ({
  connection: one(assistantConnections, {
    fields: [assistantConnectionTools.connectionId],
    references: [assistantConnections.id],
  }),
}));

export const assistantPurchases = pgTable("assistant_purchases", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  assistantId:          uuid("assistant_id").notNull().references(() => aiAssistants.id, { onDelete: "cascade" }),
  userId:               uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type:                 varchar("type", { length: 20 }).notNull(),
  stripeCustomerId:     varchar("stripe_customer_id", { length: 255 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  status:               varchar("status", { length: 20 }).notNull().default("active"),
  amountCents:          integer("amount_cents").notNull(),
  sellerEarningsCents:  integer("seller_earnings_cents").default(0),
  messagesUsed:         integer("messages_used").default(0),
  lastMessageAt:        timestamp("last_message_at", { withTimezone: true }),
  periodMessagesUsed:   integer("period_messages_used").default(0),
  periodWindowStartedAt: timestamp("period_window_started_at", { withTimezone: true }),
  weeklyMessagesUsed:   integer("weekly_messages_used").default(0),
  weekStartedAt:        timestamp("week_started_at", { withTimezone: true }),
  // Token / cost tracking
  tokensUsed:           integer("tokens_used").default(0),
  costUsedCents:        integer("cost_used_cents").default(0),
  periodTokensUsed:     integer("period_tokens_used").default(0),
  weeklyTokensUsed:     integer("weekly_tokens_used").default(0),
  expiresAt:            timestamp("expires_at", { withTimezone: true }),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  assistantIdx:      index("assistant_purchases_assistant_idx").on(t.assistantId),
  userIdx:           index("assistant_purchases_user_idx").on(t.userId),
  subscriptionIdx:   index("assistant_purchases_subscription_idx").on(t.stripeSubscriptionId),
  uniquePurchase:    unique("assistant_purchases_unique").on(t.assistantId, t.userId, t.type),
}));

export const assistantApiSecrets = pgTable("assistant_api_secrets", {
  id:             uuid("id").primaryKey().defaultRandom(),
  assistantId:    uuid("assistant_id").notNull().references(() => aiAssistants.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  secretCiphertext: text("secret_ciphertext").notNull(), // AES-256-GCM encrypted
  secretIv:       text("secret_iv").notNull(),           // nonce
  secretTag:      text("secret_tag").notNull(),          // auth tag
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  assistantIdx: index("assistant_api_secrets_assistant_idx").on(t.assistantId),
}));

export const assistantApiSecretsRelations = relations(assistantApiSecrets, ({ one }) => ({
  assistant: one(aiAssistants, {
    fields: [assistantApiSecrets.assistantId],
    references: [aiAssistants.id],
  }),
}));

export const orgBudgetUsage = pgTable("org_budget_usage", {
  id:            uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  windowType:    varchar("window_type", { length: 20 }).notNull(), // "daily", "weekly", "monthly"
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  tokensUsed:    bigint("tokens_used", { mode: "number" }).notNull().default(0),
  costCentsUsed: bigint("cost_cents_used", { mode: "number" }).notNull().default(0),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgWindowIdx: index("org_budget_usage_org_window_idx").on(t.organizationId, t.windowType, t.windowStartedAt),
}));

export const orgBudgetUsageRelations = relations(orgBudgetUsage, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgBudgetUsage.organizationId],
    references: [organizations.id],
  }),
}));

// ── Workflows ─────────────────────────────────────────────────────────────
export const workflows = pgTable("workflows", {
  id:             uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name:           varchar("name", { length: 255 }).notNull(),
  description:    text("description"),
  category:       varchar("category", { length: 100 }).notNull().default("general"),
  status:         varchar("status", { length: 50 }).notNull().default("draft"),
  graph:          jsonb("graph").default({ nodes: [], edges: [] }),
  tags:           jsonb("tags").$type<string[]>().default([]),
  createdBy:      uuid("created_by").references(() => users.id),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx:    index("workflows_org_idx").on(t.organizationId),
  statusIdx: index("workflows_status_idx").on(t.status),
}));

export const workflowRuns = pgTable("workflow_runs", {
  id:             uuid("id").primaryKey().defaultRandom(),
  workflowId:     uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  status:         varchar("status", { length: 50 }).notNull().default("running"),
  input:          jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  stepOutputs:    jsonb("step_outputs").$type<unknown[]>().notNull().default([]),
  error:          text("error"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt:    timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  workflowIdx: index("workflow_runs_workflow_idx").on(t.workflowId, t.createdAt),
  orgIdx:      index("workflow_runs_org_idx").on(t.organizationId),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  organization: one(organizations, { fields: [workflows.organizationId], references: [organizations.id] }),
  createdByUser: one(users, { fields: [workflows.createdBy], references: [users.id] }),
  runs: many(workflowRuns),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one }) => ({
  workflow: one(workflows, { fields: [workflowRuns.workflowId], references: [workflows.id] }),
  organization: one(organizations, { fields: [workflowRuns.organizationId], references: [organizations.id] }),
}));

export const batchJobs = pgTable(
  "batch_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    apiKeyId: uuid("api_key_id")
      .references(() => apiKeys.id)
      .notNull(),
    endpoint: varchar("endpoint", { length: 100 })
      .notNull()
      .default("/v1/chat/completions"),
    modelId: varchar("model_id", { length: 100 }),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    input: jsonb("input").notNull().default([]),
    output: jsonb("output"),
    error: text("error"),
    totalCount: integer("total_count").notNull().default(0),
    completedCount: integer("completed_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    inputFileId: varchar("input_file_id", { length: 128 }),
    outputFileId: varchar("output_file_id", { length: 128 }),
    completionWindow: varchar("completion_window", { length: 20 })
      .notNull()
      .default("24h"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdx: index("batch_jobs_org_idx").on(table.organizationId),
    statusIdx: index("batch_jobs_status_idx").on(table.status),
    orgCreatedIdx: index("batch_jobs_org_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
  })
);

export const batchJobsRelations = relations(batchJobs, ({ one }) => ({
  organization: one(organizations, {
    fields: [batchJobs.organizationId],
    references: [organizations.id],
  }),
  apiKey: one(apiKeys, {
    fields: [batchJobs.apiKeyId],
    references: [apiKeys.id],
  }),
}));

/** Org-scoped bring-your-own provider keys (encrypted at rest). */
export const organizationProviderKeys = pgTable(
  "organization_provider_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    providerSlug: varchar("provider_slug", { length: 50 }).notNull(),
    label: varchar("label", { length: 255 }),
    keyCiphertext: text("key_ciphertext").notNull(),
    keyIv: text("key_iv").notNull(),
    keyTag: text("key_tag").notNull(),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    alwaysUse: boolean("always_use").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("organization_provider_keys_org_idx").on(table.organizationId),
    orgSlugIdx: index("organization_provider_keys_org_slug_idx").on(
      table.organizationId,
      table.providerSlug
    ),
  })
);

export const organizationProviderKeysRelations = relations(
  organizationProviderKeys,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationProviderKeys.organizationId],
      references: [organizations.id],
    }),
  })
);

/** Private GPU rentals — this Mac or an existing dedicated deployment. Not Vertex MaaS. */
export const premiumRentals = pgTable(
  "premium_rentals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    deploymentId: uuid("deployment_id").references(() => deployments.id, {
      onDelete: "set null",
    }),
    sku: varchar("sku", { length: 50 }).notNull().default("metal"),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    hourlyRate: numeric("hourly_rate", { precision: 10, scale: 4 }).notNull().default("0"),
    hours: integer("hours"),
    modelId: varchar("model_id", { length: 255 }),
    weightsUri: text("weights_uri"),
    ownsDeployment: boolean("owns_deployment").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("premium_rentals_org_idx").on(table.organizationId, table.createdAt),
    statusIdx: index("premium_rentals_status_idx").on(table.status),
    deploymentIdx: index("premium_rentals_deployment_idx").on(table.deploymentId),
  })
);

export const premiumRentalsRelations = relations(premiumRentals, ({ one }) => ({
  organization: one(organizations, {
    fields: [premiumRentals.organizationId],
    references: [organizations.id],
  }),
  deployment: one(deployments, {
    fields: [premiumRentals.deploymentId],
    references: [deployments.id],
  }),
}));

export const assistantPurchasesRelations = relations(assistantPurchases, ({ one }) => ({
  assistant: one(aiAssistants, {
    fields: [assistantPurchases.assistantId],
    references: [aiAssistants.id],
  }),
  user: one(users, {
    fields: [assistantPurchases.userId],
    references: [users.id],
  }),
}));

/* ─────────────────────────────────────────────────────────────────
   OpenDoor Chat (first-party house model — Qwen 3.8)
───────────────────────────────────────────────────────────────── */
export const houseChats = pgTable(
  "house_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userUpdatedIdx: index("house_chats_user_updated_idx").on(t.userId, t.updatedAt),
    orgIdx: index("house_chats_org_idx").on(t.organizationId),
  })
);

export const houseChatMessages = pgTable(
  "house_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => houseChats.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull().default(""),
    mode: varchar("mode", { length: 20 }),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    chatIdx: index("house_chat_messages_chat_idx").on(t.chatId, t.createdAt),
  })
);

export const houseChatUsage = pgTable(
  "house_chat_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodMessagesUsed: integer("period_messages_used").notNull().default(0),
    periodWindowStartedAt: timestamp("period_window_started_at", { withTimezone: true }),
    weeklyMessagesUsed: integer("weekly_messages_used").notNull().default(0),
    weekStartedAt: timestamp("week_started_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userUnique: uniqueIndex("house_chat_usage_user_uidx").on(t.userId),
  })
);

export const houseChatsRelations = relations(houseChats, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [houseChats.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [houseChats.userId],
    references: [users.id],
  }),
  messages: many(houseChatMessages),
}));

export const houseChatMessagesRelations = relations(houseChatMessages, ({ one }) => ({
  chat: one(houseChats, {
    fields: [houseChatMessages.chatId],
    references: [houseChats.id],
  }),
}));

export const houseChatUsageRelations = relations(houseChatUsage, ({ one }) => ({
  user: one(users, {
    fields: [houseChatUsage.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [houseChatUsage.organizationId],
    references: [organizations.id],
  }),
}));
