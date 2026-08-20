import { NextRequest, NextResponse } from "next/server";
import { streamText, tool, zodSchema } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { z } from "zod";
import { getMinutesRemaining, getWindowMs, isWindowExpired, welcomeAllowedForFamily } from "@opendoor/shared";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { aiAssistants, assistantApiSecrets, assistantConnections, assistantConnectionTools, assistantPurchases } from "@opendoor/database";
import { eq, and, inArray, gte, isNull, or, sql } from "drizzle-orm";
import { getComposio, entityId } from "@/lib/composio/client";
import { buildMcpTools } from "@/lib/mcp/client";
import type { McpServerConfig } from "@/lib/mcp/client";
import { buildApiConnectionTools } from "@/lib/api-connections/http-tool-builder";
import {
  assistantGatewayHeaders,
  assistantGatewaySecret,
  assistantGatewayUrl,
  inferAssistantFamily,
} from "@/lib/assistant-gateway";
import { assertOrgCanSpend, debitOrgUsage } from "@/lib/credits";
import { authorizeOpenDoorSearch, settleOpenDoorSearch } from "@/lib/tools/search-spend";
import { formatRagSearchForModel, ragSearch, type RagSearchResult } from "@/lib/tools/rag-search";

interface LimitStatus {
  allowed: boolean;
  reason?: string;
  session?: { used: number; limit: number; remaining: number };
  period?: { used: number; limit: number; remaining: number; window: string; minutesRemaining: number | null };
  weekly?: { used: number; limit: number; remaining: number; minutesRemaining: number | null };
}

interface TokenLimitStatus {
  allowed: boolean;
  reason?: string;
  sessionTokens?: { used: number; limit: number; remaining: number };
  periodTokens?: { used: number; limit: number; remaining: number; window: string; minutesRemaining: number | null };
  weeklyTokens?: { used: number; limit: number; remaining: number; minutesRemaining: number | null };
  costCap?: { used: number; limit: number; remaining: number };
}

function estimateRequestTokens(messages: Array<{ role: string; content: string }>, systemPrompt?: string | null): number {
  let chars = systemPrompt?.length ?? 0;
  for (const m of messages) chars += m.content?.length ?? 0;
  return Math.max(1, Math.ceil(chars / 4));
}

async function checkMessageLimits(
  db: any,
  assistant: typeof aiAssistants.$inferSelect,
  purchase: typeof assistantPurchases.$inferSelect
): Promise<LimitStatus> {
  const now = new Date();
  const sessionLimit = assistant.maxMessages;
  const periodWindow = assistant.periodWindow;
  const periodLimit = assistant.periodMessageLimit;
  const weeklyLimit = assistant.weeklyMessageLimit;

  let sessionUsed = purchase.messagesUsed ?? 0;
  let periodUsed = purchase.periodMessagesUsed ?? 0;
  let weeklyUsed = purchase.weeklyMessagesUsed ?? 0;

  // ─── Reset expired windows ───
  const periodWindowMs = getWindowMs(periodWindow);
  if (periodWindowMs && isWindowExpired(purchase.periodWindowStartedAt, periodWindowMs)) {
    periodUsed = 0;
    await db.update(assistantPurchases)
      .set({ periodMessagesUsed: 0, periodWindowStartedAt: now, periodTokensUsed: 0 })
      .where(eq(assistantPurchases.id, purchase.id));
  }

  const weeklyWindowMs = getWindowMs("weekly");
  if (weeklyLimit && weeklyWindowMs && isWindowExpired(purchase.weekStartedAt, weeklyWindowMs)) {
    weeklyUsed = 0;
    await db.update(assistantPurchases)
      .set({ weeklyMessagesUsed: 0, weekStartedAt: now, weeklyTokensUsed: 0 })
      .where(eq(assistantPurchases.id, purchase.id));
  }

  // ─── Check session limit ───
  if (sessionLimit !== null && sessionLimit > 0) {
    if (sessionUsed >= sessionLimit) {
      // In metered mode, session limit is a soft cap — we allow overage if cost cap not hit
      if (assistant.usageMode === "included") {
        if (assistant.cooldownMinutes && assistant.cooldownMinutes > 0 && isWindowExpired(purchase.lastMessageAt, assistant.cooldownMinutes * 60 * 1000)) {
          await db.update(assistantPurchases)
            .set({ messagesUsed: 0, tokensUsed: 0, costUsedCents: 0 })
            .where(eq(assistantPurchases.id, purchase.id));
          sessionUsed = 0;
        } else {
          return {
            allowed: false,
            reason: "session_limit",
            session: { used: sessionUsed, limit: sessionLimit, remaining: 0 },
          };
        }
      }
    }
  }

  // ─── Check period limit ───
  if (periodLimit !== null && periodLimit > 0 && periodWindowMs && assistant.usageMode === "included") {
    if (periodUsed >= periodLimit) {
      return {
        allowed: false,
        reason: "period_limit",
        period: {
          used: periodUsed,
          limit: periodLimit,
          remaining: 0,
          window: periodWindow!,
          minutesRemaining: getMinutesRemaining(purchase.periodWindowStartedAt, periodWindowMs),
        },
      };
    }
  }

  // ─── Check weekly limit ───
  if (weeklyLimit !== null && weeklyLimit > 0 && assistant.usageMode === "included") {
    if (weeklyUsed >= weeklyLimit) {
      return {
        allowed: false,
        reason: "weekly_limit",
        weekly: {
          used: weeklyUsed,
          limit: weeklyLimit,
          remaining: 0,
          minutesRemaining: getMinutesRemaining(purchase.weekStartedAt, weeklyWindowMs!),
        },
      };
    }
  }

  return {
    allowed: true,
    session: sessionLimit ? { used: sessionUsed, limit: sessionLimit, remaining: Math.max(0, sessionLimit - sessionUsed - 1) } : undefined,
    period: periodLimit && periodWindow ? { used: periodUsed, limit: periodLimit, remaining: Math.max(0, periodLimit - periodUsed - 1), window: periodWindow, minutesRemaining: null } : undefined,
    weekly: weeklyLimit ? { used: weeklyUsed, limit: weeklyLimit, remaining: Math.max(0, weeklyLimit - weeklyUsed - 1), minutesRemaining: null } : undefined,
  };
}

async function checkTokenLimits(
  db: any,
  assistant: typeof aiAssistants.$inferSelect,
  purchase: typeof assistantPurchases.$inferSelect,
  estimatedInputTokens: number
): Promise<TokenLimitStatus> {
  const sessionTokenLimit = assistant.maxTokensPerSession;
  const periodTokenLimit = assistant.maxTokensPerPeriod;
  const weeklyTokenLimit = assistant.maxTokensPerPeriod; // Use same as period for now, or we could add separate weekly
  const costCap = assistant.costCapCents;

  let sessionTokensUsed = purchase.tokensUsed ?? 0;
  let periodTokensUsed = purchase.periodTokensUsed ?? 0;
  let weeklyTokensUsed = purchase.weeklyTokensUsed ?? 0;
  let costUsed = purchase.costUsedCents ?? 0;

  const periodWindow = assistant.periodWindow;
  const periodWindowMs = getWindowMs(periodWindow);
  if (periodWindowMs && isWindowExpired(purchase.periodWindowStartedAt, periodWindowMs)) {
    periodTokensUsed = 0;
    await db.update(assistantPurchases)
      .set({ periodTokensUsed: 0 })
      .where(eq(assistantPurchases.id, purchase.id));
  }

  const weeklyWindowMs = getWindowMs("weekly");
  if (weeklyTokenLimit && weeklyWindowMs && isWindowExpired(purchase.weekStartedAt, weeklyWindowMs)) {
    weeklyTokensUsed = 0;
    await db.update(assistantPurchases)
      .set({ weeklyTokensUsed: 0 })
      .where(eq(assistantPurchases.id, purchase.id));
  }

  // ─── Check cost cap (applies to both included and metered) ───
  if (costCap !== null && costCap > 0) {
    if (costUsed >= costCap) {
      return {
        allowed: false,
        reason: "cost_cap",
        costCap: { used: costUsed, limit: costCap, remaining: 0 },
      };
    }
  }

  // ─── Check session token limit ───
  if (sessionTokenLimit !== null && sessionTokenLimit > 0) {
    if (sessionTokensUsed + estimatedInputTokens > sessionTokenLimit) {
      if (assistant.usageMode !== "metered") {
        return {
          allowed: false,
          reason: "session_token_limit",
          sessionTokens: { used: sessionTokensUsed, limit: sessionTokenLimit, remaining: Math.max(0, sessionTokenLimit - sessionTokensUsed) },
        };
      }
    }
  }

  // ─── Check period token limit ───
  if (periodTokenLimit !== null && periodTokenLimit > 0 && periodWindowMs && assistant.usageMode === "included") {
    if (periodTokensUsed + estimatedInputTokens > periodTokenLimit) {
      return {
        allowed: false,
        reason: "period_token_limit",
        periodTokens: {
          used: periodTokensUsed,
          limit: periodTokenLimit,
          remaining: Math.max(0, periodTokenLimit - periodTokensUsed),
          window: periodWindow!,
          minutesRemaining: getMinutesRemaining(purchase.periodWindowStartedAt, periodWindowMs),
        },
      };
    }
  }

  // ─── Check weekly token limit ───
  if (weeklyTokenLimit !== null && weeklyTokenLimit > 0 && assistant.usageMode === "included") {
    if (weeklyTokensUsed + estimatedInputTokens > weeklyTokenLimit) {
      return {
        allowed: false,
        reason: "weekly_token_limit",
        weeklyTokens: {
          used: weeklyTokensUsed,
          limit: weeklyTokenLimit,
          remaining: Math.max(0, weeklyTokenLimit - weeklyTokensUsed),
          minutesRemaining: getMinutesRemaining(purchase.weekStartedAt, weeklyWindowMs!),
        },
      };
    }
  }

  return {
    allowed: true,
    sessionTokens: sessionTokenLimit ? { used: sessionTokensUsed, limit: sessionTokenLimit, remaining: Math.max(0, sessionTokenLimit - sessionTokensUsed - estimatedInputTokens) } : undefined,
    periodTokens: periodTokenLimit && periodWindow ? { used: periodTokensUsed, limit: periodTokenLimit, remaining: Math.max(0, periodTokenLimit - periodTokensUsed - estimatedInputTokens), window: periodWindow, minutesRemaining: null } : undefined,
    weeklyTokens: weeklyTokenLimit ? { used: weeklyTokensUsed, limit: weeklyTokenLimit, remaining: Math.max(0, weeklyTokenLimit - weeklyTokensUsed - estimatedInputTokens), minutesRemaining: null } : undefined,
    costCap: costCap ? { used: costUsed, limit: costCap, remaining: Math.max(0, costCap - costUsed) } : undefined,
  };
}

async function incrementUsage(
  db: any,
  purchaseId: string,
  assistant: typeof aiAssistants.$inferSelect,
  tokensUsed: number,
  costCents: number
) {
  try {
    const now = new Date();
    const updates: Record<string, any> = {
      lastMessageAt: now,
      messagesUsed: sql`${assistantPurchases.messagesUsed} + 1`,
      tokensUsed: sql`${assistantPurchases.tokensUsed} + ${tokensUsed}`,
      costUsedCents: sql`${assistantPurchases.costUsedCents} + ${costCents}`,
    };

    if (assistant.periodMessageLimit !== null && assistant.periodMessageLimit > 0 && assistant.periodWindow) {
      updates.periodMessagesUsed = sql`${assistantPurchases.periodMessagesUsed} + 1`;
      updates.periodTokensUsed = sql`${assistantPurchases.periodTokensUsed} + ${tokensUsed}`;
      const [p] = await db.select({ periodWindowStartedAt: assistantPurchases.periodWindowStartedAt })
        .from(assistantPurchases)
        .where(eq(assistantPurchases.id, purchaseId))
        .limit(1);
      if (!p?.periodWindowStartedAt) {
        updates.periodWindowStartedAt = now;
      }
    }

    if (assistant.weeklyMessageLimit !== null && assistant.weeklyMessageLimit > 0) {
      updates.weeklyMessagesUsed = sql`${assistantPurchases.weeklyMessagesUsed} + 1`;
      updates.weeklyTokensUsed = sql`${assistantPurchases.weeklyTokensUsed} + ${tokensUsed}`;
      const [p] = await db.select({ weekStartedAt: assistantPurchases.weekStartedAt })
        .from(assistantPurchases)
        .where(eq(assistantPurchases.id, purchaseId))
        .limit(1);
      if (!p?.weekStartedAt) {
        updates.weekStartedAt = now;
      }
    }

    await db.update(assistantPurchases).set(updates).where(eq(assistantPurchases.id, purchaseId));
  } catch (err) {
    console.error("Failed to increment usage:", err);
  }
}

function calculateMeteredCost(assistant: typeof aiAssistants.$inferSelect, tokensUsed: number): number {
  if (assistant.usageMode !== "metered") return 0;
  if (assistant.meteredPricePerMessageCents) {
    return assistant.meteredPricePerMessageCents;
  }
  if (assistant.meteredPricePer1kTokensCents) {
    return Math.ceil((tokensUsed / 1000) * assistant.meteredPricePer1kTokensCents);
  }
  return 0;
}

function resolveDirectModel(modelId: string) {
  if (modelId.startsWith("claude-"))  return createAnthropic()(modelId);
  if (modelId.startsWith("gemini-"))  return createGoogleGenerativeAI()(modelId);
  if (modelId.startsWith("mistral-")) return createMistral()(modelId);
  return createOpenAI()(modelId);
}

function formatSearchContext(result: RagSearchResult): string {
  return formatRagSearchForModel(result);
}

function billedGatewayModel(modelId: string, orgId: string) {
  const secret = assistantGatewaySecret();
  return createOpenAI({
    baseURL: `${assistantGatewayUrl()}/v1`,
    apiKey: secret || "missing",
    headers: {
      "X-OpenDoor-Organization-Id": orgId,
    },
  })(modelId);
}

function insufficientBalanceResponse(
  detail: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: "Insufficient balance",
      detail,
      reason: "org_limit",
      topupUrl: "/dashboard/billing",
      ...extra,
    },
    { status: 402 }
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();

  const [assistant] = await db
    .select()
    .from(aiAssistants)
    .where(eq(aiAssistants.slug, slug));

  if (!assistant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const family = inferAssistantFamily(assistant.modelId);
  const session = await getSession();
  const afford = await assertOrgCanSpend(assistant.organizationId, family, {
    userId: session?.orgId === assistant.organizationId ? session.userId : null,
  });
  if (!afford.ok) {
    return insufficientBalanceResponse(afford.detail, {
      includedQuotaCents: afford.waterfall.quotaCents,
      prepaidCreditsUsdCents: afford.waterfall.prepaidCents,
      welcomeCreditsUsdCents: afford.waterfall.welcomeCents,
    });
  }

  const isOwner = session?.orgId === assistant.organizationId;
  let purchaseRecord: typeof assistantPurchases.$inferSelect | null = null;

  // Owner can always preview; otherwise enforce publish/visibility rules
  if (!isOwner) {
    if (!assistant.enabled) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (assistant.visibility === "private") {
      return NextResponse.json({ error: "This assistant is private." }, { status: 403 });
    }
    if (assistant.visibility === "team") {
      if (!session || session.orgId !== assistant.organizationId) {
        return NextResponse.json({ error: "Team access only." }, { status: 403 });
      }
    }
    if (!assistant.publishedAt) {
      return NextResponse.json({ error: "This assistant is not yet published." }, { status: 404 });
    }

    // Monetization check for non-owners
    if (assistant.monetization !== "free" && session?.userId) {
      const [purchase] = await db
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
      if (!purchase) {
        return NextResponse.json({
          error: "Payment required",
          assistantId: assistant.id,
          monetization: assistant.monetization,
          priceCents: assistant.priceCents,
        }, { status: 402 });
      }
      purchaseRecord = purchase;

      // Message limit check (session + period + weekly)
      const limitStatus = await checkMessageLimits(db, assistant, purchase);
      if (!limitStatus.allowed) {
        return NextResponse.json({
          error: "Message limit reached",
          reason: limitStatus.reason,
          session: limitStatus.session,
          period: limitStatus.period,
          weekly: limitStatus.weekly,
          usageMode: assistant.usageMode,
        }, { status: 429 });
      }
    }
  }

  const body = await req.json();
  const messages: { role: string; content: string }[] = body.messages ?? [];
  const estimatedInputTokens = estimateRequestTokens(messages, assistant.systemPrompt);

  const systemMessages = assistant.systemPrompt
    ? [{ role: "system" as const, content: assistant.systemPrompt }]
    : [];

  let webSearchAllowed = false;
  if (assistant.webSearchEnabled) {
    const searchGate = await authorizeOpenDoorSearch({ orgId: assistant.organizationId });
    webSearchAllowed = searchGate.ok;
    if (searchGate.ok && searchGate.coveredByAddon) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const query = typeof lastUser?.content === "string" ? lastUser.content.trim() : "";
      if (query) {
        try {
          const search = await ragSearch({ query });
          systemMessages.push({ role: "system", content: formatSearchContext(search) });
        } catch (err) {
          console.error("Assistant web search failed:", err);
        }
      }
    }
  }

  // ─── Token limit check for non-owners ───
  if (!isOwner && purchaseRecord && assistant.monetization !== "free") {
    const tokenLimitStatus = await checkTokenLimits(db, assistant, purchaseRecord, estimatedInputTokens);
    if (!tokenLimitStatus.allowed) {
      return NextResponse.json({
        error: "Token limit reached",
        reason: tokenLimitStatus.reason,
        sessionTokens: tokenLimitStatus.sessionTokens,
        periodTokens: tokenLimitStatus.periodTokens,
        weeklyTokens: tokenLimitStatus.weeklyTokens,
        costCap: tokenLimitStatus.costCap,
        usageMode: assistant.usageMode,
      }, { status: 429 });
    }
  }

  // ─── Collect tools from all sources ───
  const allTools: Record<string, any> = {};
  let mcpCleanup: (() => Promise<void>) | undefined;

  // 1. Composio connections
  try {
    const connections = await db
      .select()
      .from(assistantConnections)
      .where(and(
        eq(assistantConnections.assistantId, assistant.id),
        eq(assistantConnections.status, "active"),
      ));

    if (connections.length > 0) {
      const composio = getComposio();
      const userId = entityId(assistant.organizationId);

      const connectionIds = connections.map((c) => c.id);
      const selectedTools = connectionIds.length > 0
        ? await db
            .select()
            .from(assistantConnectionTools)
            .where(inArray(assistantConnectionTools.connectionId, connectionIds))
        : [];

      let toolSlugs: string[] = [];
      if (selectedTools.length > 0) {
        toolSlugs = selectedTools.map((t) => t.toolSlug);
      }

      const toolkits = connections.map((c) => c.appSlug);

      let rawTools;
      if (toolSlugs.length > 0) {
        rawTools = await composio.tools.getRawComposioTools({ userId, tools: toolSlugs });
      } else {
        rawTools = await composio.tools.getRawComposioTools({ userId, toolkits });
      }

      const composioTools = composio.tools.wrapToolsForProvider(userId, rawTools);
      Object.assign(allTools, composioTools);
    }
  } catch (err) {
    console.error("Composio tool loading error:", err);
    // Continue without Composio tools
  }

  // 2. MCP servers
  const mcpConfigs = (assistant.mcpServers ?? []) as McpServerConfig[];
  if (mcpConfigs.length > 0) {
    try {
      const { tools, cleanup } = await buildMcpTools(mcpConfigs);
      mcpCleanup = cleanup;
      Object.assign(allTools, tools);
    } catch (err) {
      console.error("MCP tool loading error:", err);
      // Continue without MCP tools
    }
  }

  if (webSearchAllowed) {
    allTools.web_search = (tool as any)({
      description:
        "OpenDoor Search: a short synthesized answer plus 2–5 citations from Vertex grounding on OpenDoor's GCP. Do not invent URLs.",
      parameters: zodSchema(
        z.object({
          query: z.string().describe("Search query"),
          max_results: z.number().int().min(2).max(5).optional(),
        }),
      ) as any,
      execute: async (args: { query: string; max_results?: number }) => {
        const gate = await authorizeOpenDoorSearch({ orgId: assistant.organizationId });
        if (!gate.ok) throw new Error(gate.error);
        const result = await ragSearch({ query: args.query, maxResults: args.max_results });
        const charge = await settleOpenDoorSearch({
          orgId: assistant.organizationId,
          coveredByAddon: gate.coveredByAddon,
        });
        if ("error" in charge) throw new Error(charge.error);
        return result;
      },
    });
  }

  // 3. API connections (dynamic REST tools)
  const apiConnections = (assistant.apiConnections ?? []).filter((c: any) => c.enabled);
  if (apiConnections.length > 0) {
    try {
      const secretIds = apiConnections.map((c: any) => c.secretId).filter(Boolean);
      const secrets = secretIds.length > 0
        ? await db.select().from(assistantApiSecrets).where(inArray(assistantApiSecrets.id, secretIds))
        : [];
      const apiTools = await buildApiConnectionTools(apiConnections, secrets);
      Object.assign(allTools, apiTools);
    } catch (err) {
      console.error("API connection tool loading error:", err);
      // Continue without API connection tools
    }
  }

  // ─── Agentic mode: use Vercel AI SDK if we have any tools ───
  if (Object.keys(allTools).length > 0) {
    const modelId = assistant.modelId ?? "gpt-4o";
    const tryModels = assistantGatewaySecret()
      ? [billedGatewayModel(modelId, assistant.organizationId), resolveDirectModel(modelId)]
      : [resolveDirectModel(modelId)];

    for (const [index, model] of tryModels.entries()) {
      const billedByGateway = index === 0 && Boolean(assistantGatewaySecret());
      try {
        const result = await streamText({
          model,
          messages: [
            ...systemMessages,
            ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          ],
          tools: allTools,
          maxOutputTokens: assistant.maxTokensPerMessage ?? undefined,
        });

        const safetyTimeout = setTimeout(() => mcpCleanup?.(), 5 * 60 * 1000);
        Promise.resolve(result.text).then(async () => {
          clearTimeout(safetyTimeout);
          await mcpCleanup?.();
          const usage = await result.totalUsage.catch(() => null);
          const totalTokens = usage?.totalTokens ?? estimatedInputTokens;
          if (purchaseRecord) {
            const costCents = calculateMeteredCost(assistant, totalTokens);
            await incrementUsage(db, purchaseRecord.id, assistant, totalTokens, costCents);
          }
          if (!billedByGateway) {
            const estCents = Math.max(1, Math.ceil(totalTokens / 1000));
            await debitOrgUsage(assistant.organizationId, estCents, undefined, {
              allowWelcome: welcomeAllowedForFamily(family),
              source: "ai_assistant_tools",
              userId: session?.userId || null,
            }).catch((err) => console.error("Assistant debit failed:", err));
          }
        }).catch(() => {
          clearTimeout(safetyTimeout);
          mcpCleanup?.();
        });

        return result.toTextStreamResponse();
      } catch (err) {
        console.error("streamText error:", err);
        if (index === tryModels.length - 1) {
          await mcpCleanup?.();
        }
      }
    }
  }

  // ─── Gateway proxy (no tools or streamText error fallback) ───
  await mcpCleanup?.();

  const gatewayMessages = [...systemMessages, ...messages];

  if (!assistantGatewaySecret()) {
    return NextResponse.json(
      { error: "Gateway billing is not configured." },
      { status: 503 }
    );
  }

  try {
    const upstream = await fetch(`${assistantGatewayUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: assistantGatewayHeaders(assistant.organizationId, {
        "X-OpenDoor-Assistant-Id": assistant.id,
      }),
      body: JSON.stringify({
        model: assistant.modelId ?? "gpt-4o",
        messages: gatewayMessages,
        stream: true,
        max_tokens: assistant.maxTokensPerMessage ?? undefined,
      }),
    });

    if (!upstream.ok) {
      const data = (await upstream.json().catch(() => ({ error: "Gateway error" }))) as {
        error?: string;
        detail?: string;
        topupUrl?: string;
      };
      if (upstream.status === 402) {
        return NextResponse.json(
          {
            error: data.error || "Insufficient balance",
            detail:
              data.detail ||
              "Included credit is used up and prepaid balance cannot cover this chat. Top up on Billing.",
            reason: "org_limit",
            topupUrl: data.topupUrl || "/dashboard/billing",
            includedQuotaCents: afford.waterfall.quotaCents,
            prepaidCreditsUsdCents: afford.waterfall.prepaidCents,
          },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: data.error || data.detail || "Gateway error" },
        { status: upstream.status }
      );
    }

    if (purchaseRecord) {
      // Gateway proxy path — we can't read actual tokens, so estimate
      const estimatedTotalTokens = Math.round(estimatedInputTokens * 2.5); // rough guess: input + output
      const costCents = calculateMeteredCost(assistant, estimatedTotalTokens);
      await incrementUsage(db, purchaseRecord.id, assistant, estimatedTotalTokens, costCents);
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Gateway is unreachable. Please start the gateway or connect an integration." },
      { status: 503 }
    );
  }
}
