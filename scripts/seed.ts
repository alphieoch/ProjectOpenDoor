import { createHash } from "crypto";
import { db } from "../packages/database/src/index.ts";
import {
  organizations,
  users,
  providers,
  models,
  pricingRules,
  apiKeys,
} from "../packages/database/src/index.ts";
import { hashPassword } from "../apps/dashboard/src/lib/auth.js";

const LOCAL_API_KEY = "opd_localdev0001a1b2c3d4e5f60718293a4b5c6d7e8f90aabbccddeeff0011";

async function seed() {
  console.log("🌱 Seeding database...");

  // Create default organization
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Ocheing & Co",
      slug: "ocheing-co",
      plan: "enterprise",
    })
    .returning();

  console.log("Created organization:", org.id);

  // Create admin user
  const passwordHash = await hashPassword("admin123!");
  const [user] = await db
    .insert(users)
    .values({
      email: "admin@ocheingco.com",
      name: "Admin User",
      passwordHash,
      organizationId: org.id,
      role: "admin",
    })
    .returning();

  console.log("Created admin user:", user.email);

  // Create test user
  const [testOrg] = await db
    .insert(organizations)
    .values({
      name: "Test Organization",
      slug: "test-org",
      plan: "free",
      creditsUsdCents: 0,
      welcomeCreditsUsdCents: 0,
      signupCreditGranted: false,
      metadata: {
        onboarding_checklist: {},
      },
    })
    .returning();

  const testPasswordHash = await hashPassword("testpass123");
  const [testUser] = await db
    .insert(users)
    .values({
      email: "test@test.com",
      name: "Test User",
      passwordHash: testPasswordHash,
      organizationId: testOrg.id,
      role: "admin",
    })
    .returning();

  console.log("Created test user:", testUser.email);

  // Create providers
  const providerData = [
    {
      name: "Azure AI Foundry",
      slug: "azure-foundry",
      apiKeyEnvVar: "AZURE_AI_FOUNDRY_KEY",
      enabled: true,
      isWestern: true,
    },
    {
      name: "OpenAI",
      slug: "openai",
      apiKeyEnvVar: "OPENAI_API_KEY",
      enabled: true,
      isWestern: true,
    },
    {
      name: "Anthropic",
      slug: "anthropic",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      enabled: true,
      isWestern: true,
    },
    {
      name: "Google",
      slug: "google",
      apiKeyEnvVar: "GOOGLE_API_KEY",
      enabled: true,
      isWestern: true,
    },
    {
      name: "Local GPU (Ollama)",
      slug: "ollama",
      apiKeyEnvVar: "OLLAMA_HOST",
      enabled: true,
      isWestern: true,
    },
    {
      name: "Custom deployment",
      slug: "custom",
      apiKeyEnvVar: "OLLAMA_HOST",
      enabled: true,
      isWestern: true,
    },
    {
      name: "Cohere",
      slug: "cohere",
      apiKeyEnvVar: "COHERE_API_KEY",
      enabled: true,
      isWestern: true,
    },
    {
      name: "Mistral AI",
      slug: "mistral",
      apiKeyEnvVar: "MISTRAL_API_KEY",
      enabled: true,
      isWestern: true,
    },
    {
      name: "DeepSeek",
      slug: "deepseek",
      apiKeyEnvVar: "DEEPSEEK_API_KEY",
      enabled: true,
      isWestern: false,
    },
    {
      name: "Alibaba Qwen",
      slug: "qwen",
      apiKeyEnvVar: "QWEN_API_KEY",
      enabled: true,
      isWestern: false,
    },
    {
      name: "Together (serverless)",
      slug: "together",
      apiKeyEnvVar: "TOGETHER_API_KEY",
      enabled: true,
      isWestern: true,
    },
  ];

  const createdProviders = await db
    .insert(providers)
    .values(providerData)
    .returning();

  console.log(`Created ${createdProviders.length} providers`);

  // Create models — serverless launch set first, then local + vendor APIs
  const modelData = [
    // Serverless (Together wholesale — no Request GPU)
    {
      provider: "together",
      modelId: "llama-3.1-8b-instruct",
      displayName: "Llama 3.1 8B Instruct",
      contextWindow: 128000,
      family: "open_weight" as const,
      status: "live",
      serverless: true,
      origin: "us",
      source: "provider_api",
      hfRepo: "meta-llama/Meta-Llama-3.1-8B-Instruct",
    },
    {
      provider: "together",
      modelId: "llama-3.1-70b-instruct",
      displayName: "Llama 3.1 70B Instruct",
      contextWindow: 128000,
      family: "open_weight" as const,
      status: "live",
      serverless: true,
      origin: "us",
      source: "provider_api",
      hfRepo: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    },
    {
      provider: "together",
      modelId: "qwen2.5-7b-instruct",
      displayName: "Qwen 2.5 7B Instruct",
      contextWindow: 128000,
      family: "open_weight" as const,
      status: "live",
      serverless: true,
      origin: "cn",
      source: "provider_api",
      hfRepo: "Qwen/Qwen2.5-7B-Instruct",
    },
    {
      provider: "together",
      modelId: "qwen2.5-72b-instruct",
      displayName: "Qwen 2.5 72B Instruct",
      contextWindow: 128000,
      family: "open_weight" as const,
      status: "live",
      serverless: true,
      origin: "cn",
      source: "provider_api",
      hfRepo: "Qwen/Qwen2.5-72B-Instruct",
    },
    {
      provider: "together",
      modelId: "deepseek-v3",
      displayName: "DeepSeek V3",
      contextWindow: 64000,
      family: "open_weight" as const,
      status: "live",
      serverless: true,
      origin: "cn",
      source: "provider_api",
      hfRepo: "deepseek-ai/DeepSeek-V3",
    },
    {
      provider: "together",
      modelId: "mistral-7b-instruct",
      displayName: "Mistral 7B Instruct",
      contextWindow: 32768,
      family: "open_weight" as const,
      status: "live",
      serverless: true,
      origin: "eu",
      source: "provider_api",
      hfRepo: "mistralai/Mistral-7B-Instruct-v0.3",
    },
    {
      provider: "together",
      modelId: "BAAI/bge-base-en-v1.5",
      displayName: "BGE Base EN v1.5",
      contextWindow: 512,
      family: "open_weight" as const,
      status: "live",
      serverless: true,
      origin: "global",
      source: "provider_api",
      hfRepo: "BAAI/bge-base-en-v1.5",
    },
    // Open-weight live (local + vendor APIs)
    {
      provider: "ollama",
      modelId: "llama3.2:3b",
      displayName: "Llama 3.2 3B (this Mac)",
      contextWindow: 128000,
      family: "open_weight" as const,
      status: "live",
      origin: "us",
      source: "ollama",
      ollamaTag: "llama3.2:3b",
      hfRepo: "meta-llama/Llama-3.2-3B-Instruct",
    },
    {
      provider: "deepseek",
      modelId: "deepseek-chat",
      displayName: "DeepSeek Chat",
      contextWindow: 128000,
      family: "open_weight" as const,
      status: "live",
      origin: "cn",
      source: "provider_api",
    },
    {
      provider: "deepseek",
      modelId: "deepseek-coder",
      displayName: "DeepSeek Coder",
      contextWindow: 128000,
      family: "open_weight" as const,
      status: "live",
      origin: "cn",
      source: "provider_api",
    },
    {
      provider: "qwen",
      modelId: "qwen-max",
      displayName: "Qwen Max",
      contextWindow: 32000,
      family: "open_weight" as const,
      status: "live",
      origin: "cn",
      source: "provider_api",
    },
    {
      provider: "qwen",
      modelId: "qwen-plus",
      displayName: "Qwen Plus",
      contextWindow: 32000,
      family: "open_weight" as const,
      status: "live",
      origin: "cn",
      source: "provider_api",
    },
    {
      provider: "qwen",
      modelId: "qwen-turbo",
      displayName: "Qwen Turbo",
      contextWindow: 32000,
      family: "open_weight" as const,
      status: "live",
      origin: "cn",
      source: "provider_api",
    },
    {
      provider: "qwen",
      modelId: "qwen3.8-max",
      displayName: "Qwen3.8 Max",
      contextWindow: 1000000,
      family: "closed" as const,
      status: "live",
      origin: "cn",
      source: "provider_api",
      hfRepo: "Qwen/Qwen3.8-2.4T-A95B",
    },
    {
      provider: "qwen",
      modelId: "qwen-coder-plus",
      displayName: "Qwen Coder Plus",
      contextWindow: 32000,
      family: "open_weight" as const,
      status: "live",
      origin: "cn",
      source: "provider_api",
    },
    {
      provider: "mistral",
      modelId: "mistral-large-latest",
      displayName: "Mistral Large",
      contextWindow: 32000,
      family: "open_weight" as const,
      status: "live",
      origin: "eu",
      source: "provider_api",
    },
    {
      provider: "mistral",
      modelId: "mistral-medium-latest",
      displayName: "Mistral Medium",
      contextWindow: 32000,
      family: "open_weight" as const,
      status: "live",
      origin: "eu",
      source: "provider_api",
    },
    {
      provider: "mistral",
      modelId: "mistral-small-latest",
      displayName: "Mistral Small",
      contextWindow: 32000,
      family: "open_weight" as const,
      status: "live",
      origin: "eu",
      source: "provider_api",
    },
    {
      provider: "mistral",
      modelId: "codestral-latest",
      displayName: "Codestral",
      contextWindow: 32000,
      family: "open_weight" as const,
      status: "live",
      origin: "eu",
      source: "provider_api",
    },
    {
      provider: "ollama",
      modelId: "llama3.1:8b",
      displayName: "Llama 3.1 8B",
      contextWindow: 128000,
      family: "open_weight" as const,
      status: "dedicated",
      origin: "us",
      source: "ollama",
      ollamaTag: "llama3.1:8b",
    },
    {
      provider: "ollama",
      modelId: "qwen2.5:7b",
      displayName: "Qwen 2.5 7B (Ollama)",
      contextWindow: 128000,
      family: "open_weight" as const,
      status: "dedicated",
      origin: "cn",
      source: "ollama",
      ollamaTag: "qwen2.5:7b",
    },
    // Closed (optional)
    { provider: "openai", modelId: "gpt-4o", displayName: "GPT-4o", contextWindow: 128000, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
    { provider: "openai", modelId: "gpt-4o-mini", displayName: "GPT-4o Mini", contextWindow: 128000, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
    { provider: "openai", modelId: "gpt-4-turbo", displayName: "GPT-4 Turbo", contextWindow: 128000, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
    { provider: "openai", modelId: "gpt-4", displayName: "GPT-4", contextWindow: 8192, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
    { provider: "openai", modelId: "gpt-3.5-turbo", displayName: "GPT-3.5 Turbo", contextWindow: 16385, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
    { provider: "anthropic", modelId: "claude-3-5-sonnet-20241022", displayName: "Claude 3.5 Sonnet", contextWindow: 200000, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
    { provider: "anthropic", modelId: "claude-3-opus-20240229", displayName: "Claude 3 Opus", contextWindow: 200000, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
    { provider: "anthropic", modelId: "claude-3-haiku-20240307", displayName: "Claude 3 Haiku", contextWindow: 200000, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
    { provider: "google", modelId: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", contextWindow: 2000000, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
    { provider: "google", modelId: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", contextWindow: 1000000, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
    { provider: "cohere", modelId: "command-r-plus", displayName: "Command R+", contextWindow: 128000, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
    { provider: "cohere", modelId: "command-r", displayName: "Command R", contextWindow: 128000, family: "closed" as const, status: "available_on_request", origin: "us", source: "provider_api" },
  ];

  const providerMap = new Map(createdProviders.map((p) => [p.slug, p.id]));

  for (const m of modelData) {
    const providerId = providerMap.get(m.provider);
    if (!providerId) continue;

    await db.insert(models).values({
      providerId,
      modelId: m.modelId,
      displayName: m.displayName,
      contextWindow: m.contextWindow,
      family: m.family,
      deploymentStatus: m.status,
      serverless: Boolean((m as any).serverless),
      origin: m.origin,
      source: m.source,
      ollamaTag: (m as any).ollamaTag || null,
      huggingFaceRepo: (m as any).hfRepo || null,
    });
  }

  console.log(`Created ${modelData.length} models`);

  // Pricing: open-weight 5–15% markup; closed 20%+. Never punish CN/open models.
  const pricingData = [
    { provider: "openai", modelId: "gpt-4o", input: 0.005, output: 0.015, markup: 20 },
    { provider: "openai", modelId: "gpt-4o-mini", input: 0.00015, output: 0.0006, markup: 20 },
    { provider: "openai", modelId: "gpt-4-turbo", input: 0.01, output: 0.03, markup: 20 },
    { provider: "openai", modelId: "gpt-4", input: 0.03, output: 0.06, markup: 20 },
    { provider: "openai", modelId: "gpt-3.5-turbo", input: 0.0005, output: 0.0015, markup: 20 },
    { provider: "anthropic", modelId: "claude-3-5-sonnet-20241022", input: 0.003, output: 0.015, markup: 20 },
    { provider: "anthropic", modelId: "claude-3-opus-20240229", input: 0.015, output: 0.075, markup: 20 },
    { provider: "anthropic", modelId: "claude-3-haiku-20240307", input: 0.00025, output: 0.00125, markup: 20 },
    { provider: "google", modelId: "gemini-1.5-pro", input: 0.0035, output: 0.0105, markup: 20 },
    { provider: "google", modelId: "gemini-1.5-flash", input: 0.00035, output: 0.00105, markup: 20 },
    { provider: "cohere", modelId: "command-r-plus", input: 0.003, output: 0.015, markup: 20 },
    { provider: "cohere", modelId: "command-r", input: 0.0005, output: 0.0015, markup: 20 },
    { provider: "mistral", modelId: "mistral-large-latest", input: 0.002, output: 0.006, markup: 10 },
    { provider: "mistral", modelId: "mistral-medium-latest", input: 0.0006, output: 0.0018, markup: 10 },
    { provider: "mistral", modelId: "mistral-small-latest", input: 0.0002, output: 0.0006, markup: 10 },
    { provider: "deepseek", modelId: "deepseek-chat", input: 0.00014, output: 0.00028, markup: 10 },
    { provider: "deepseek", modelId: "deepseek-coder", input: 0.00014, output: 0.00028, markup: 10 },
    { provider: "qwen", modelId: "qwen3.8-max", input: 0.002, output: 0.006, markup: 10 },
    { provider: "qwen", modelId: "qwen-max", input: 0.001, output: 0.003, markup: 10 },
    { provider: "qwen", modelId: "qwen-plus", input: 0.0004, output: 0.0012, markup: 10 },
    { provider: "qwen", modelId: "qwen-turbo", input: 0.0001, output: 0.0003, markup: 5 },
    { provider: "ollama", modelId: "llama3.2:3b", input: 0.00005, output: 0.0001, markup: 5 },
    { provider: "together", modelId: "llama-3.1-8b-instruct", input: 0.00018, output: 0.00018, markup: 15 },
    { provider: "together", modelId: "llama-3.1-70b-instruct", input: 0.00088, output: 0.00088, markup: 15 },
    { provider: "together", modelId: "qwen2.5-7b-instruct", input: 0.0003, output: 0.0003, markup: 15 },
    { provider: "together", modelId: "qwen2.5-72b-instruct", input: 0.0012, output: 0.0012, markup: 15 },
    { provider: "together", modelId: "deepseek-v3", input: 0.00125, output: 0.00125, markup: 15 },
    { provider: "together", modelId: "mistral-7b-instruct", input: 0.0002, output: 0.0002, markup: 15 },
    {
      provider: "together",
      modelId: "BAAI/bge-base-en-v1.5",
      input: 0.000008,
      output: 0,
      markup: 15,
      modality: "embedding" as const,
    },
  ];

  for (const p of pricingData) {
    const providerId = providerMap.get(p.provider);
    if (!providerId) continue;

    const finalInput = p.input * (1 + p.markup / 100);
    const finalOutput = p.output * (1 + p.markup / 100);
    const cached = p.input * 0.5;
    const finalCached = finalInput * 0.5;

    await db.insert(pricingRules).values({
      providerId,
      modelId: p.modelId,
      region: "global",
      inputCostPer1K: p.input.toString(),
      outputCostPer1K: p.output.toString(),
      cachedInputCostPer1K: cached.toString(),
      markupPercent: p.markup.toString(),
      finalInputCostPer1K: finalInput.toString(),
      finalOutputCostPer1K: finalOutput.toString(),
      finalCachedInputCostPer1K: finalCached.toString(),
      batchMultiplier: "0.50",
      modality: (p as { modality?: string }).modality || "chat",
    });
  }

  const { gpuSkus } = await import("../packages/database/src/index.ts");
  await db
    .insert(gpuSkus)
    .values([
      {
        sku: "nvidia-l4",
        displayName: "NVIDIA L4",
        hourlyUsd: "1.2900",
        regionMultiplier: "1.00",
        sortOrder: 10,
      },
      {
        sku: "nvidia-a100",
        displayName: "NVIDIA A100 80GB",
        hourlyUsd: "6.2500",
        regionMultiplier: "1.00",
        sortOrder: 20,
      },
      {
        sku: "nvidia-h100",
        displayName: "NVIDIA H100 80GB",
        hourlyUsd: "13.5000",
        regionMultiplier: "1.25",
        sortOrder: 30,
      },
    ])
    .onConflictDoNothing();

  await db.insert(apiKeys).values({
    name: "Local GPU key",
    keyHash: createHash("sha256").update(LOCAL_API_KEY).digest("hex"),
    keyPrefix: LOCAL_API_KEY.slice(0, 16),
    organizationId: org.id,
  });

  console.log(`Created ${pricingData.length} pricing rules`);
  console.log("✅ Seed complete!");
  console.log("\nDefault login:");
  console.log("Email: admin@ocheingco.com");
  console.log("Password: admin123!");
  console.log("\nTest login:");
  console.log("Email: test@test.com");
  console.log("Password: testpass123");
  console.log("\nLocal gateway API key:");
  console.log(LOCAL_API_KEY);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
