import { NextRequest, NextResponse } from "next/server";
import { requireAuth, hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiAssistants } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { ensureAssistantStripePrice } from "@/lib/assistant-stripe";
import { loadWebSearchEntitlement, webSearchAddonRequiredResponse } from "@/lib/web-search/entitlement";

const ALLOWED_MCP_COMMANDS = new Set(["npx", "uvx", "docker", "node", "python", "python3", "bun", "npm", "pnpm", "yarn"]);
const SHELL_METACHARS = /[;|&$()`<>\\]/;

function validateMcpServers(mcpServers: unknown): Array<{ id: string; name: string; command: string; args?: string[]; env?: Record<string, string>; enabled: boolean }> {
  if (!Array.isArray(mcpServers)) return [];
  const validated = [];
  for (const s of mcpServers) {
    if (!s || typeof s !== "object") continue;
    const name = typeof s.name === "string" ? s.name.trim() : "";
    const command = typeof s.command === "string" ? s.command.trim() : "";
    if (!name) throw new Error("MCP server name is required");
    if (!command) throw new Error(`MCP server "${name}" is missing a command`);
    if (SHELL_METACHARS.test(command)) throw new Error(`MCP server "${name}" command contains forbidden characters`);
    const base = command.replace(/^\.\.?\//, "").split("/").pop() ?? command;
    if (!ALLOWED_MCP_COMMANDS.has(base)) {
      throw new Error(`MCP server "${name}" command "${base}" is not allowed. Allowed: ${Array.from(ALLOWED_MCP_COMMANDS).join(", ")}`);
    }
    const args = Array.isArray(s.args) ? s.args.filter((a: unknown) => typeof a === "string") : undefined;
    const env = s.env && typeof s.env === "object" && !Array.isArray(s.env)
      ? Object.fromEntries(Object.entries(s.env).filter(([_, v]) => typeof v === "string"))
      : undefined;
    validated.push({
      id: typeof s.id === "string" ? s.id : crypto.randomUUID(),
      name,
      command,
      args,
      env,
      enabled: s.enabled === true,
    });
  }
  return validated;
}

async function getOwned(id: string, orgId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(aiAssistants)
    .where(and(eq(aiAssistants.id, id), eq(aiAssistants.organizationId, orgId)));
  return row ?? null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const existing = await getOwned(id, session.orgId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  let validatedMcpServers = existing.mcpServers;
  if (body.mcpServers !== undefined) {
    try {
      validatedMcpServers = validateMcpServers(body.mcpServers);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  const nextMonetization = body.monetization ?? existing.monetization;
  const nextPriceCents = body.priceCents !== undefined ? parseInt(body.priceCents) : existing.priceCents;
  const nextSellerEarningsCents = body.sellerEarningsCents !== undefined ? parseInt(body.sellerEarningsCents) : existing.sellerEarningsCents;
  const nextPlatformFeePercent = body.platformFeePercent !== undefined ? parseInt(body.platformFeePercent) : existing.platformFeePercent;
  const nextUsageMode = body.usageMode ?? existing.usageMode;
  const nextCooldownMinutes = body.cooldownMinutes !== undefined ? (body.cooldownMinutes ? parseInt(body.cooldownMinutes) : null) : existing.cooldownMinutes;
  const nextPeriodWindow = body.periodWindow !== undefined ? (body.periodWindow || null) : existing.periodWindow;
  const nextPeriodMessageLimit = body.periodMessageLimit !== undefined ? (body.periodMessageLimit ? parseInt(body.periodMessageLimit) : null) : existing.periodMessageLimit;
  const nextWeeklyMessageLimit = body.weeklyMessageLimit !== undefined ? (body.weeklyMessageLimit ? parseInt(body.weeklyMessageLimit) : null) : existing.weeklyMessageLimit;
  const nextMaxTokensPerSession = body.maxTokensPerSession !== undefined ? (body.maxTokensPerSession ? parseInt(body.maxTokensPerSession) : null) : existing.maxTokensPerSession;
  const nextMaxTokensPerPeriod = body.maxTokensPerPeriod !== undefined ? (body.maxTokensPerPeriod ? parseInt(body.maxTokensPerPeriod) : null) : existing.maxTokensPerPeriod;
  const nextMaxTokensPerMessage = body.maxTokensPerMessage !== undefined ? (body.maxTokensPerMessage ? parseInt(body.maxTokensPerMessage) : null) : existing.maxTokensPerMessage;
  const nextCostCapCents = body.costCapCents !== undefined ? (body.costCapCents ? parseInt(body.costCapCents) : null) : existing.costCapCents;
  const nextMeteredPricePerMessageCents = body.meteredPricePerMessageCents !== undefined ? (body.meteredPricePerMessageCents ? parseInt(body.meteredPricePerMessageCents) : null) : existing.meteredPricePerMessageCents;
  const nextMeteredPricePer1kTokensCents = body.meteredPricePer1kTokensCents !== undefined ? (body.meteredPricePer1kTokensCents ? parseInt(body.meteredPricePer1kTokensCents) : null) : existing.meteredPricePer1kTokensCents;
  const nextDeepThinkingEnabled = body.deepThinkingEnabled !== undefined ? body.deepThinkingEnabled === true : existing.deepThinkingEnabled;
  let nextWebSearchEnabled = body.webSearchEnabled !== undefined ? body.webSearchEnabled === true : existing.webSearchEnabled;
  if (nextWebSearchEnabled) {
    const addon = await loadWebSearchEntitlement(session.orgId, session);
    if (!addon.active) {
      if (body.webSearchEnabled === true) {
        return NextResponse.json(webSearchAddonRequiredResponse(addon), { status: 402 });
      }
      nextWebSearchEnabled = false;
    }
  }
  const nextResearchAgentEnabled = body.researchAgentEnabled !== undefined ? body.researchAgentEnabled === true : existing.researchAgentEnabled;
  const nextCodeExecutionEnabled = body.codeExecutionEnabled !== undefined ? body.codeExecutionEnabled === true : existing.codeExecutionEnabled;
  const nextImageGenerationEnabled = body.imageGenerationEnabled !== undefined ? body.imageGenerationEnabled === true : existing.imageGenerationEnabled;
  let stripePriceId = existing.stripePriceId;

  if (nextMonetization !== "free" && nextPriceCents > 0) {
    try {
      stripePriceId = await ensureAssistantStripePrice({
        name: body.name ?? existing.name,
        monetization: nextMonetization,
        priceCents: nextPriceCents,
        existingStripePriceId: existing.stripePriceId,
        assistantId: id,
        orgId: session.orgId,
      });
    } catch (err: any) {
      console.error("Stripe product update error:", err.message);
      // Don't block update if Stripe fails
    }
  } else if (nextMonetization === "free") {
    stripePriceId = null;
  }

  const db = getDb();
  const [updated] = await db
    .update(aiAssistants)
    .set({
      name:           body.name           ?? existing.name,
      slug:           body.slug           ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") : existing.slug,
      description:    body.description    !== undefined ? body.description    : existing.description,
      avatarLetter:   body.avatarLetter   !== undefined ? body.avatarLetter   : existing.avatarLetter,
      logoUrl:        body.logoUrl        !== undefined ? body.logoUrl        : existing.logoUrl,
      primaryColor:   body.primaryColor   ?? existing.primaryColor,
      modelId:        body.modelId        ?? existing.modelId,
      systemPrompt:   body.systemPrompt   !== undefined ? body.systemPrompt   : existing.systemPrompt,
      welcomeMessage: body.welcomeMessage !== undefined ? body.welcomeMessage : existing.welcomeMessage,
      maxMessages:    body.maxMessages    !== undefined ? (body.maxMessages ? parseInt(body.maxMessages) : null) : existing.maxMessages,
      visibility:     body.visibility     ?? existing.visibility,
      monetization:        nextMonetization,
      priceCents:          nextPriceCents,
      sellerEarningsCents: nextSellerEarningsCents,
      platformFeePercent:  nextPlatformFeePercent,
      usageMode:           nextUsageMode,
      cooldownMinutes:     nextCooldownMinutes,
      periodWindow:        nextPeriodWindow,
      periodMessageLimit:  nextPeriodMessageLimit,
      weeklyMessageLimit:  nextWeeklyMessageLimit,
      maxTokensPerSession: nextMaxTokensPerSession,
      maxTokensPerPeriod:  nextMaxTokensPerPeriod,
      maxTokensPerMessage: nextMaxTokensPerMessage,
      costCapCents:        nextCostCapCents,
      meteredPricePerMessageCents: nextMeteredPricePerMessageCents,
      meteredPricePer1kTokensCents: nextMeteredPricePer1kTokensCents,
      deepThinkingEnabled:   nextDeepThinkingEnabled,
      webSearchEnabled:      nextWebSearchEnabled,
      researchAgentEnabled:  nextResearchAgentEnabled,
      codeExecutionEnabled:  nextCodeExecutionEnabled,
      imageGenerationEnabled: nextImageGenerationEnabled,
      stripePriceId,
      passwordProtected: body.passwordProtected !== undefined ? body.passwordProtected === true : existing.passwordProtected,
      passwordHash:   body.passwordProtected === true && body.password
                        ? await hashPassword(body.password)
                        : body.passwordProtected === false
                          ? null
                          : existing.passwordHash,
      mcpServers:     validatedMcpServers,
      updatedAt:      new Date(),
    })
    .where(eq(aiAssistants.id, id))
    .returning();

  return NextResponse.json({ assistant: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const existing = await getOwned(id, session.orgId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getDb();
  await db.update(aiAssistants).set({ enabled: false, updatedAt: new Date() }).where(eq(aiAssistants.id, id));
  return NextResponse.json({ ok: true });
}
