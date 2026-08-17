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

export async function GET() {
  const session = await requireAuth();
  const db = getDb();
  const [rows, webSearchAddon] = await Promise.all([
    db
      .select()
      .from(aiAssistants)
      .where(and(eq(aiAssistants.organizationId, session.orgId), eq(aiAssistants.enabled, true)))
      .orderBy(aiAssistants.createdAt),
    loadWebSearchEntitlement(session.orgId, session),
  ]);
  return NextResponse.json({ assistants: rows, webSearchAddon });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const body = await req.json();
  const {
    name, slug, description, avatarLetter, logoUrl, primaryColor,
    modelId, systemPrompt, welcomeMessage, maxMessages,
    visibility, monetization, priceCents, sellerEarningsCents, platformFeePercent,
    usageMode, cooldownMinutes, periodWindow, periodMessageLimit, weeklyMessageLimit,
    maxTokensPerSession, maxTokensPerPeriod, maxTokensPerMessage,
    costCapCents, meteredPricePerMessageCents, meteredPricePer1kTokensCents,
    deepThinkingEnabled, webSearchEnabled, researchAgentEnabled,
    codeExecutionEnabled, imageGenerationEnabled,
    passwordProtected, password, mcpServers,
  } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
  }
  if (!modelId || typeof modelId !== "string") {
    return NextResponse.json({ error: "modelId is required" }, { status: 400 });
  }

  if (webSearchEnabled === true) {
    const addon = await loadWebSearchEntitlement(session.orgId, session);
    if (!addon.active) {
      return NextResponse.json(webSearchAddonRequiredResponse(addon), { status: 402 });
    }
  }

  let validatedMcpServers;
  try {
    validatedMcpServers = validateMcpServers(mcpServers);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  let stripePriceId: string | null = null;
  if (monetization !== "free" && priceCents > 0) {
    try {
      stripePriceId = await ensureAssistantStripePrice({
        name: name.trim(),
        monetization: monetization || "free",
        priceCents: priceCents ? parseInt(priceCents) : 0,
        assistantId: "pending", // will update after insert if needed, but we don't have ID yet
        orgId: session.orgId,
      });
    } catch (err: any) {
      console.error("Stripe product creation error:", err.message);
      // Don't block assistant creation if Stripe fails
    }
  }

  const db = getDb();
  const [created] = await db
    .insert(aiAssistants)
    .values({
      organizationId: session.orgId,
      createdBy:      session.userId,
      name:           name.trim(),
      slug:           slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      description:    description || null,
      avatarLetter:   avatarLetter || name.charAt(0).toUpperCase(),
      logoUrl:        logoUrl || null,
      primaryColor:   primaryColor || "#1A73E8",
      modelId,
      systemPrompt:   systemPrompt || null,
      welcomeMessage: welcomeMessage || null,
      maxMessages:    maxMessages ? parseInt(maxMessages) : null,
      visibility:     visibility || "private",
      monetization:        monetization || "free",
      priceCents:          priceCents ? parseInt(priceCents) : 0,
      sellerEarningsCents: sellerEarningsCents ? parseInt(sellerEarningsCents) : (priceCents ? parseInt(priceCents) : 0),
      platformFeePercent:  platformFeePercent ? parseInt(platformFeePercent) : 1500,
      usageMode:           usageMode || "included",
      cooldownMinutes:     cooldownMinutes ? parseInt(cooldownMinutes) : null,
      periodWindow:        periodWindow || null,
      periodMessageLimit:  periodMessageLimit ? parseInt(periodMessageLimit) : null,
      weeklyMessageLimit:  weeklyMessageLimit ? parseInt(weeklyMessageLimit) : null,
      maxTokensPerSession: maxTokensPerSession ? parseInt(maxTokensPerSession) : null,
      maxTokensPerPeriod:  maxTokensPerPeriod ? parseInt(maxTokensPerPeriod) : null,
      maxTokensPerMessage: maxTokensPerMessage ? parseInt(maxTokensPerMessage) : null,
      costCapCents:        costCapCents ? parseInt(costCapCents) : null,
      meteredPricePerMessageCents: meteredPricePerMessageCents ? parseInt(meteredPricePerMessageCents) : null,
      meteredPricePer1kTokensCents: meteredPricePer1kTokensCents ? parseInt(meteredPricePer1kTokensCents) : null,
      deepThinkingEnabled:   deepThinkingEnabled === true,
      webSearchEnabled:      webSearchEnabled === true,
      researchAgentEnabled:  researchAgentEnabled === true,
      codeExecutionEnabled:  codeExecutionEnabled === true,
      imageGenerationEnabled: imageGenerationEnabled === true,
      stripePriceId,
      passwordProtected: passwordProtected === true,
      passwordHash:   passwordProtected === true && password ? await hashPassword(password) : null,
      mcpServers:     validatedMcpServers,
    })
    .returning();

  return NextResponse.json({ assistant: created }, { status: 201 });
}
