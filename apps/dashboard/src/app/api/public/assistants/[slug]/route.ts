import { NextRequest, NextResponse } from "next/server";
import { getMinutesRemaining, getWindowMs, isWindowExpired } from "@opendoor/shared";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { aiAssistants, assistantPurchases } from "@opendoor/database";
import { eq, and, gte, isNull, or } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();

  const [assistant] = await db
    .select()
    .from(aiAssistants)
    .where(eq(aiAssistants.slug, slug));

  if (!assistant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getSession();
  const isOwner = session?.orgId === assistant.organizationId;

  // Enforce visibility for non-owners
  if (!isOwner) {
    if (!assistant.enabled || !assistant.publishedAt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (assistant.visibility === "private") {
      return NextResponse.json({ error: "Private" }, { status: 403 });
    }
    if (assistant.visibility === "team" && (!session || session.orgId !== assistant.organizationId)) {
      return NextResponse.json({ error: "Team only" }, { status: 403 });
    }
  }

  // Check if user has purchased access (for monetized assistants)
  let hasAccess = isOwner;
  let purchase: typeof assistantPurchases.$inferSelect | null = null;
  if (!isOwner && assistant.monetization !== "free" && session?.userId) {
    const [p] = await db
      .select()
      .from(assistantPurchases)
      .where(
        and(
          eq(assistantPurchases.assistantId, assistant.id),
          eq(assistantPurchases.userId, session.userId),
          eq(assistantPurchases.status, "active"),
          or(
            isNull(assistantPurchases.expiresAt),
            gte(assistantPurchases.expiresAt, new Date())
          )
        )
      )
      .limit(1);
    purchase = p ?? null;
    hasAccess = !!purchase;
  }

  // ─── Calculate limit status ───
  const sessionLimit = assistant.maxMessages;
  const periodWindow = assistant.periodWindow;
  const periodLimit = assistant.periodMessageLimit;
  const weeklyLimit = assistant.weeklyMessageLimit;

  let sessionUsed = purchase?.messagesUsed ?? 0;
  let periodUsed = purchase?.periodMessagesUsed ?? 0;
  let weeklyUsed = purchase?.weeklyMessagesUsed ?? 0;

  // Check if windows expired (for display purposes)
  const periodWindowMs = getWindowMs(periodWindow);
  if (periodWindowMs && purchase && isWindowExpired(purchase.periodWindowStartedAt, periodWindowMs)) {
    periodUsed = 0;
  }
  const weeklyWindowMs = getWindowMs("weekly");
  if (weeklyLimit && weeklyWindowMs && purchase && isWindowExpired(purchase.weekStartedAt, weeklyWindowMs)) {
    weeklyUsed = 0;
  }

  const sessionRemaining = sessionLimit !== null ? Math.max(0, sessionLimit - sessionUsed) : null;
  const periodRemaining = periodLimit !== null ? Math.max(0, periodLimit - periodUsed) : null;
  const weeklyRemaining = weeklyLimit !== null ? Math.max(0, weeklyLimit - weeklyUsed) : null;

  // Token limit status
  const sessionTokenLimit = assistant.maxTokensPerSession;
  const periodTokenLimit = assistant.maxTokensPerPeriod;
  const weeklyTokenLimit = assistant.maxTokensPerPeriod;
  const costCap = assistant.costCapCents;
  let sessionTokensUsed = purchase?.tokensUsed ?? 0;
  let periodTokensUsed = purchase?.periodTokensUsed ?? 0;
  let weeklyTokensUsed = purchase?.weeklyTokensUsed ?? 0;
  let costUsed = purchase?.costUsedCents ?? 0;

  if (periodWindowMs && purchase && isWindowExpired(purchase.periodWindowStartedAt, periodWindowMs)) {
    periodTokensUsed = 0;
  }
  if (weeklyTokenLimit && weeklyWindowMs && purchase && isWindowExpired(purchase.weekStartedAt, weeklyWindowMs)) {
    weeklyTokensUsed = 0;
  }

  const sessionTokensRemaining = sessionTokenLimit !== null ? Math.max(0, sessionTokenLimit - sessionTokensUsed) : null;
  const periodTokensRemaining = periodTokenLimit !== null ? Math.max(0, periodTokenLimit - periodTokensUsed) : null;
  const weeklyTokensRemaining = weeklyTokenLimit !== null ? Math.max(0, weeklyTokenLimit - weeklyTokensUsed) : null;
  const costRemaining = costCap !== null ? Math.max(0, costCap - costUsed) : null;

  // Cooldown remaining for session limit
  let cooldownMinutesRemaining: number | null = null;
  if (!isOwner && sessionLimit !== null && sessionLimit > 0
      && assistant.usageMode === "included" && sessionUsed >= sessionLimit
      && assistant.cooldownMinutes && assistant.cooldownMinutes > 0
      && purchase?.lastMessageAt) {
    const elapsedMs = Date.now() - new Date(purchase.lastMessageAt).getTime();
    const totalMs = assistant.cooldownMinutes * 60 * 1000;
    if (elapsedMs < totalMs) {
      cooldownMinutesRemaining = Math.ceil((totalMs - elapsedMs) / (60 * 1000));
    }
  }

  // Period reset time
  let periodMinutesRemaining: number | null = null;
  if (periodWindowMs && purchase?.periodWindowStartedAt && periodRemaining !== null && periodRemaining <= 0) {
    periodMinutesRemaining = getMinutesRemaining(purchase.periodWindowStartedAt, periodWindowMs);
  }

  // Weekly reset time
  let weeklyMinutesRemaining: number | null = null;
  if (weeklyWindowMs && purchase?.weekStartedAt && weeklyRemaining !== null && weeklyRemaining <= 0) {
    weeklyMinutesRemaining = getMinutesRemaining(purchase.weekStartedAt, weeklyWindowMs);
  }

  return NextResponse.json({
    id: assistant.id,
    name: assistant.name,
    slug: assistant.slug,
    description: assistant.description,
    enabled: assistant.enabled,
    visibility: assistant.visibility,
    publishedAt: assistant.publishedAt,
    primaryColor: assistant.primaryColor ?? "#1A73E8",
    avatarLetter: assistant.avatarLetter ?? assistant.name.charAt(0).toUpperCase(),
    logoUrl: assistant.logoUrl,
    welcomeMessage: assistant.welcomeMessage,
    systemPrompt: assistant.systemPrompt,
    modelId: assistant.modelId,
    maxMessages: assistant.maxMessages,
    usageMode: assistant.usageMode,
    cooldownMinutes: assistant.cooldownMinutes,
    periodWindow: assistant.periodWindow,
    periodMessageLimit: assistant.periodMessageLimit,
    weeklyMessageLimit: assistant.weeklyMessageLimit,
    passwordProtected: assistant.passwordProtected,
    mcpServers: assistant.mcpServers,
    monetization: assistant.monetization,
    priceCents: assistant.priceCents,
    sellerEarningsCents: assistant.sellerEarningsCents,
    stripePriceId: assistant.stripePriceId,
    isOwner,
    hasAccess,
    messagesUsed: sessionUsed,
    messagesRemaining: sessionRemaining,
    periodMessagesUsed: periodUsed,
    periodMessagesRemaining: periodRemaining,
    weeklyMessagesUsed: weeklyUsed,
    weeklyMessagesRemaining: weeklyRemaining,
    cooldownMinutesRemaining,
    periodMinutesRemaining,
    weeklyMinutesRemaining,
    maxTokensPerSession: assistant.maxTokensPerSession,
    maxTokensPerPeriod: assistant.maxTokensPerPeriod,
    maxTokensPerMessage: assistant.maxTokensPerMessage,
    costCapCents: assistant.costCapCents,
    tokensUsed: sessionTokensUsed,
    tokensRemaining: sessionTokensRemaining,
    periodTokensUsed,
    periodTokensRemaining,
    weeklyTokensUsed,
    weeklyTokensRemaining,
    costUsed,
    costRemaining,
    meteredPricePerMessageCents: assistant.meteredPricePerMessageCents,
    meteredPricePer1kTokensCents: assistant.meteredPricePer1kTokensCents,
    deepThinkingEnabled: assistant.deepThinkingEnabled,
    webSearchEnabled: assistant.webSearchEnabled,
    researchAgentEnabled: assistant.researchAgentEnabled,
    codeExecutionEnabled: assistant.codeExecutionEnabled,
    imageGenerationEnabled: assistant.imageGenerationEnabled,
  });
}
