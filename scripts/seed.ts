import { db } from "@opendoor/database";
import {
  organizations,
  users,
  providers,
  models,
  pricingRules,
  creditTransactions,
} from "@opendoor/database";
import { hashPassword } from "../apps/dashboard/src/lib/auth.js";

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
  const signupCreditCents = 2000;
  const [testOrg] = await db
    .insert(organizations)
    .values({
      name: "Test Organization",
      slug: "test-org",
      plan: "free",
      creditsUsdCents: signupCreditCents,
      signupCreditGranted: true,
      metadata: {
        onboarding_checklist: {},
      },
    })
    .returning();

  await db.insert(creditTransactions).values({
    organizationId: testOrg.id,
    kind: "signup",
    amountCents: signupCreditCents,
    balanceAfterCents: signupCreditCents,
    metadata: { source: "signup_bonus" },
  });

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
  ];

  const createdProviders = await db
    .insert(providers)
    .values(providerData)
    .returning();

  console.log(`Created ${createdProviders.length} providers`);

  // Create models
  const modelData = [
    // OpenAI
    { provider: "openai", modelId: "gpt-4o", displayName: "GPT-4o", contextWindow: 128000 },
    { provider: "openai", modelId: "gpt-4o-mini", displayName: "GPT-4o Mini", contextWindow: 128000 },
    { provider: "openai", modelId: "gpt-4-turbo", displayName: "GPT-4 Turbo", contextWindow: 128000 },
    { provider: "openai", modelId: "gpt-4", displayName: "GPT-4", contextWindow: 8192 },
    { provider: "openai", modelId: "gpt-3.5-turbo", displayName: "GPT-3.5 Turbo", contextWindow: 16385 },
    // Anthropic
    { provider: "anthropic", modelId: "claude-3-5-sonnet-20241022", displayName: "Claude 3.5 Sonnet", contextWindow: 200000 },
    { provider: "anthropic", modelId: "claude-3-opus-20240229", displayName: "Claude 3 Opus", contextWindow: 200000 },
    { provider: "anthropic", modelId: "claude-3-haiku-20240307", displayName: "Claude 3 Haiku", contextWindow: 200000 },
    // Google
    { provider: "google", modelId: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", contextWindow: 2000000 },
    { provider: "google", modelId: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", contextWindow: 1000000 },
    // Cohere
    { provider: "cohere", modelId: "command-r-plus", displayName: "Command R+", contextWindow: 128000 },
    { provider: "cohere", modelId: "command-r", displayName: "Command R", contextWindow: 128000 },
    // Mistral
    { provider: "mistral", modelId: "mistral-large-latest", displayName: "Mistral Large", contextWindow: 32000 },
    { provider: "mistral", modelId: "mistral-medium-latest", displayName: "Mistral Medium", contextWindow: 32000 },
    { provider: "mistral", modelId: "mistral-small-latest", displayName: "Mistral Small", contextWindow: 32000 },
    { provider: "mistral", modelId: "codestral-latest", displayName: "Codestral", contextWindow: 32000 },
    // DeepSeek (non-western)
    { provider: "deepseek", modelId: "deepseek-chat", displayName: "DeepSeek V2.5", contextWindow: 128000 },
    { provider: "deepseek", modelId: "deepseek-coder", displayName: "DeepSeek Coder V2", contextWindow: 128000 },
    // Qwen (non-western)
    { provider: "qwen", modelId: "qwen-max", displayName: "Qwen Max", contextWindow: 32000 },
    { provider: "qwen", modelId: "qwen-plus", displayName: "Qwen Plus", contextWindow: 32000 },
    { provider: "qwen", modelId: "qwen-turbo", displayName: "Qwen Turbo", contextWindow: 32000 },
    { provider: "qwen", modelId: "qwen-coder-plus", displayName: "Qwen Coder Plus", contextWindow: 32000 },
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
    });
  }

  console.log(`Created ${modelData.length} models`);

  // Create pricing rules
  // Western providers: 20% markup
  // Non-western providers: 50% markup (higher profit margin)
  const pricingData = [
    // OpenAI
    { provider: "openai", modelId: "gpt-4o", input: 0.005, output: 0.015, markup: 20 },
    { provider: "openai", modelId: "gpt-4o-mini", input: 0.00015, output: 0.0006, markup: 20 },
    { provider: "openai", modelId: "gpt-4-turbo", input: 0.01, output: 0.03, markup: 20 },
    { provider: "openai", modelId: "gpt-4", input: 0.03, output: 0.06, markup: 20 },
    { provider: "openai", modelId: "gpt-3.5-turbo", input: 0.0005, output: 0.0015, markup: 20 },
    // Anthropic
    { provider: "anthropic", modelId: "claude-3-5-sonnet-20241022", input: 0.003, output: 0.015, markup: 20 },
    { provider: "anthropic", modelId: "claude-3-opus-20240229", input: 0.015, output: 0.075, markup: 20 },
    { provider: "anthropic", modelId: "claude-3-haiku-20240307", input: 0.00025, output: 0.00125, markup: 20 },
    // Google
    { provider: "google", modelId: "gemini-1.5-pro", input: 0.0035, output: 0.0105, markup: 20 },
    { provider: "google", modelId: "gemini-1.5-flash", input: 0.00035, output: 0.00105, markup: 20 },
    // Cohere
    { provider: "cohere", modelId: "command-r-plus", input: 0.003, output: 0.015, markup: 20 },
    { provider: "cohere", modelId: "command-r", input: 0.0005, output: 0.0015, markup: 20 },
    // Mistral
    { provider: "mistral", modelId: "mistral-large-latest", input: 0.002, output: 0.006, markup: 20 },
    { provider: "mistral", modelId: "mistral-medium-latest", input: 0.0006, output: 0.0018, markup: 20 },
    { provider: "mistral", modelId: "mistral-small-latest", input: 0.0002, output: 0.0006, markup: 20 },
    // DeepSeek (non-western - higher markup)
    { provider: "deepseek", modelId: "deepseek-chat", input: 0.00014, output: 0.00028, markup: 50 },
    { provider: "deepseek", modelId: "deepseek-coder", input: 0.00014, output: 0.00028, markup: 50 },
    // Qwen (non-western - higher markup)
    { provider: "qwen", modelId: "qwen-max", input: 0.001, output: 0.003, markup: 50 },
    { provider: "qwen", modelId: "qwen-plus", input: 0.0004, output: 0.0012, markup: 50 },
    { provider: "qwen", modelId: "qwen-turbo", input: 0.0001, output: 0.0003, markup: 50 },
  ];

  for (const p of pricingData) {
    const providerId = providerMap.get(p.provider);
    if (!providerId) continue;

    const finalInput = p.input * (1 + p.markup / 100);
    const finalOutput = p.output * (1 + p.markup / 100);

    await db.insert(pricingRules).values({
      providerId,
      modelId: p.modelId,
      region: "global",
      inputCostPer1K: p.input.toString(),
      outputCostPer1K: p.output.toString(),
      markupPercent: p.markup.toString(),
      finalInputCostPer1K: finalInput.toString(),
      finalOutputCostPer1K: finalOutput.toString(),
    });
  }

  console.log(`Created ${pricingData.length} pricing rules`);
  console.log("✅ Seed complete!");
  console.log("\nDefault login:");
  console.log("Email: admin@ocheingco.com");
  console.log("Password: admin123!");
  console.log("\nTest login:");
  console.log("Email: test@test.com");
  console.log("Password: testpass123");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
