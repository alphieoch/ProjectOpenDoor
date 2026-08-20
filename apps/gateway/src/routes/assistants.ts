import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db, aiAssistants } from "@opendoor/database";
import type { ChatMessage } from "@opendoor/shared";
import {
  asOptionalBool,
  asOptionalInt,
  asOptionalString,
  asString,
  publicAssistant,
  requireTenant,
  slugify,
  uniqueConflict,
  writeAudit,
} from "../lib/platform.js";
import { runBilledChat } from "../lib/run-completion.js";
import { formatRagSearchForModel, ragSearch } from "../lib/rag-search.js";
import { authorizeGatewaySearch } from "../lib/search-spend.js";
import { orgHasWebSearchAddon, webSearchAddonRequiredBody } from "../lib/web-search-entitlement.js";

const assistantsRouter = new Hono();
const ROLES = new Set<ChatMessage["role"]>(["system", "user", "assistant", "tool"]);

function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const role = ROLES.has(row.role as ChatMessage["role"])
      ? (row.role as ChatMessage["role"])
      : "user";
    const content = typeof row.content === "string" ? row.content : JSON.stringify(row.content ?? "");
    messages.push({ role, content });
  }
  return messages;
}

async function ownedAssistant(id: string, orgId: string) {
  const [row] = await db
    .select()
    .from(aiAssistants)
    .where(and(eq(aiAssistants.id, id), eq(aiAssistants.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

assistantsRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db
    .select()
    .from(aiAssistants)
    .where(and(eq(aiAssistants.organizationId, tenant.organization.id), eq(aiAssistants.enabled, true)))
    .orderBy(desc(aiAssistants.createdAt));
  return c.json({ object: "list", data: rows.map(publicAssistant) });
});

assistantsRouter.post("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name);
  const modelId = asString(body.modelId || body.model);
  if (!name) return c.json({ error: "name is required" }, 400);
  if (!modelId) return c.json({ error: "modelId is required" }, 400);

  const webSearchEnabled = body.webSearchEnabled === true;
  if (webSearchEnabled && !(await orgHasWebSearchAddon(tenant.organization.id, tenant.organization.plan))) {
    return c.json(webSearchAddonRequiredBody(), 402);
  }

  const slug = slugify(asString(body.slug) || name);
  try {
    const [created] = await db
      .insert(aiAssistants)
      .values({
        organizationId: tenant.organization.id,
        name,
        slug,
        description: asOptionalString(body.description) ?? null,
        avatarLetter: asString(body.avatarLetter).slice(0, 1) || name.charAt(0).toUpperCase(),
        logoUrl: asOptionalString(body.logoUrl) ?? null,
        primaryColor: asString(body.primaryColor) || "#1A73E8",
        modelId,
        systemPrompt: asOptionalString(body.systemPrompt) ?? null,
        welcomeMessage: asOptionalString(body.welcomeMessage) ?? null,
        maxMessages: asOptionalInt(body.maxMessages) ?? null,
        visibility: asString(body.visibility) || "private",
        monetization: asString(body.monetization) || "free",
        deepThinkingEnabled: body.deepThinkingEnabled === true,
        webSearchEnabled,
        researchAgentEnabled: body.researchAgentEnabled === true,
        codeExecutionEnabled: body.codeExecutionEnabled === true,
        imageGenerationEnabled: body.imageGenerationEnabled === true,
      })
      .returning();
    await writeAudit({
      organizationId: tenant.organization.id,
      action: "assistant.created",
      entityType: "assistant",
      entityId: created.id,
      metadata: { name, slug, modelId },
    });
    return c.json({ object: "assistant", ...publicAssistant(created) }, 201);
  } catch (err) {
    if (uniqueConflict(err)) return c.json({ error: "slug already exists" }, 409);
    throw err;
  }
});

assistantsRouter.get("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const row = await ownedAssistant(c.req.param("id"), tenant.organization.id);
  if (!row) return c.json({ error: "Assistant not found" }, 404);
  return c.json({ object: "assistant", ...publicAssistant(row) });
});

assistantsRouter.patch("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const existing = await ownedAssistant(c.req.param("id"), tenant.organization.id);
  if (!existing) return c.json({ error: "Assistant not found" }, 404);
  const body = await c.req.json().catch(() => ({}));

  const nextWebSearch = asOptionalBool(body.webSearchEnabled);
  if (nextWebSearch && !(await orgHasWebSearchAddon(tenant.organization.id, tenant.organization.plan))) {
    return c.json(webSearchAddonRequiredBody(), 402);
  }

  const [updated] = await db
    .update(aiAssistants)
    .set({
      name: asString(body.name) || existing.name,
      slug: body.slug ? slugify(asString(body.slug)) : existing.slug,
      description: asOptionalString(body.description) ?? existing.description,
      modelId: asString(body.modelId || body.model) || existing.modelId,
      systemPrompt: asOptionalString(body.systemPrompt) ?? existing.systemPrompt,
      welcomeMessage: asOptionalString(body.welcomeMessage) ?? existing.welcomeMessage,
      maxMessages: asOptionalInt(body.maxMessages) ?? existing.maxMessages,
      visibility: asString(body.visibility) || existing.visibility,
      deepThinkingEnabled: asOptionalBool(body.deepThinkingEnabled) ?? existing.deepThinkingEnabled,
      webSearchEnabled: nextWebSearch ?? existing.webSearchEnabled,
      researchAgentEnabled: asOptionalBool(body.researchAgentEnabled) ?? existing.researchAgentEnabled,
      codeExecutionEnabled: asOptionalBool(body.codeExecutionEnabled) ?? existing.codeExecutionEnabled,
      imageGenerationEnabled: asOptionalBool(body.imageGenerationEnabled) ?? existing.imageGenerationEnabled,
      updatedAt: new Date(),
    })
    .where(eq(aiAssistants.id, existing.id))
    .returning();
  return c.json({ object: "assistant", ...publicAssistant(updated) });
});

assistantsRouter.delete("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const existing = await ownedAssistant(c.req.param("id"), tenant.organization.id);
  if (!existing) return c.json({ error: "Assistant not found" }, 404);
  await db
    .update(aiAssistants)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(aiAssistants.id, existing.id));
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "assistant.deleted",
    entityType: "assistant",
    entityId: existing.id,
  });
  return c.json({ object: "assistant.deleted", id: existing.id, deleted: true });
});

assistantsRouter.post("/:id/chat", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const assistant = await ownedAssistant(c.req.param("id"), tenant.organization.id);
  if (!assistant || !assistant.enabled) return c.json({ error: "Assistant not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const incoming = parseMessages(body.messages);
  if (!incoming.length) return c.json({ error: "messages is required" }, 400);

  const messages: ChatMessage[] = [];
  if (assistant.systemPrompt) {
    messages.push({ role: "system", content: assistant.systemPrompt });
  }
  if (assistant.webSearchEnabled) {
    const lastUser = [...incoming].reverse().find((m) => m.role === "user");
    const query = typeof lastUser?.content === "string" ? lastUser.content : "";
    if (query) {
      const gate = await authorizeGatewaySearch(tenant.organization);
      if (gate.ok && gate.coveredByAddon) {
        try {
          const search = await ragSearch({ query, maxResults: 5 });
          const digest = formatRagSearchForModel(search);
          if (digest) {
            messages.push({
              role: "system",
              content: digest,
            });
          }
        } catch {
          /* search is optional; chat still runs */
        }
      }
    }
  }
  messages.push(...incoming);

  try {
    const completion = await runBilledChat({
      organization: tenant.organization,
      apiKey: tenant.apiKey,
      model: asString(body.model) || assistant.modelId || "opendoor/auto",
      messages,
      temperature: typeof body.temperature === "number" ? body.temperature : undefined,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
      top_p: typeof body.top_p === "number" ? body.top_p : undefined,
      tools: body.tools,
      tool_choice: body.tool_choice,
      response_format: body.response_format,
      metadata: { assistant_id: assistant.id, source: "assistants.chat" },
    });
    return c.json({
      ...completion,
      assistant_id: assistant.id,
      assistant_slug: assistant.slug,
    });
  } catch (err) {
    const status = (err as { status?: number }).status === 404 ? 404 : 502;
    return c.json({ error: err instanceof Error ? err.message : "Assistant chat failed" }, status);
  }
});

export default assistantsRouter;
