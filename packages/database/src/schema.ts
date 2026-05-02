import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

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

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  plan: varchar("plan", { length: 50 }).notNull().default("free"),
  monthlyBudgetUsd: numeric("monthly_budget_usd", {
    precision: 10,
    scale: 2,
  }).default("0"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  subscriptionStatus: varchar("subscription_status", { length: 50 }).default("inactive"),
  workosOrganizationId: varchar("workos_organization_id", { length: 255 }),
  workosConnectionId: varchar("workos_connection_id", { length: 255 }),
  ssoEnabled: boolean("sso_enabled").default(false),
  ssoDefaultRole: varchar("sso_default_role", { length: 50 }).default("member"),
  metadata: jsonb("metadata"),
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
