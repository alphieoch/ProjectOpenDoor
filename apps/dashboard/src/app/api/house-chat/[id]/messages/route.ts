import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import {
  HOUSE_CHAT_CHILD_SAFETY_PROMPT,
  houseChatModeToThinking,
  houseChatModelForMode,
} from "@opendoor/shared";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { houseChatMessages, houseChats } from "@opendoor/database";
import {
  assistantGatewayHeaders,
  assistantGatewaySecret,
  assistantGatewayUrl,
} from "@/lib/assistant-gateway";
import {
  ensureHouseChatSeat,
  getHouseChatAllowance,
  incrementHouseChatUsage,
  loadProtectedChild,
  normalizeHouseChatMode,
} from "@/lib/house-chat";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: string }).text || "") : ""))
      .join("\n")
      .trim();
  }
  return "";
}

function hasImageParts(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some(
    (p) => p && typeof p === "object" && (p as { type?: string }).type === "image_url"
  );
}

function sseDataPayload(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.toLowerCase().startsWith("data:")) return null;
  return trimmed.slice(5).trim();
}

function chunkError(chunk: { error?: unknown }): string | null {
  const err = chunk.error;
  if (!err) return null;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message?: string }).message || "");
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: chatId } = await params;
  const orgId = session.orgId as string;
  const db = getDb();

  const chat = await db.query.houseChats.findFirst({
    where: and(
      eq(houseChats.id, chatId),
      eq(houseChats.organizationId, orgId),
      eq(houseChats.userId, session.userId)
    ),
  });
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const mode = normalizeHouseChatMode(body.mode);
  const regenerate = Boolean(body.regenerate);
  const content = body.content as string | ContentPart[] | undefined;
  const text = extractText(content).trim();
  if (!regenerate && !text && !hasImageParts(content)) {
    return NextResponse.json({ error: "Message content is required" }, { status: 400 });
  }

  const protectedChild = await loadProtectedChild(session.userId);
  if (protectedChild && hasImageParts(content)) {
    return NextResponse.json(
      { error: "Image attachments are disabled on protected accounts." },
      { status: 403 }
    );
  }

  await ensureHouseChatSeat({
    userId: session.userId,
    orgId,
    email: session.email,
  });
  const allowance = await getHouseChatAllowance(session.userId, orgId, undefined, {
    unlimited: Boolean(session.isSiteAdmin),
  });
  if (!allowance.allowed) {
    return NextResponse.json(
      {
        error: allowance.refillLabel || "Message allowance exhausted",
        reason: allowance.reason,
        allowance,
      },
      { status: 429 }
    );
  }

  const secret = assistantGatewaySecret();
  if (!secret) {
    return NextResponse.json(
      { error: "House chat is not configured (missing gateway internal key)." },
      { status: 503 }
    );
  }

  if (!regenerate) {
    await db.insert(houseChatMessages).values({
      chatId,
      role: "user",
      content: text,
      mode,
    });

    if (!chat.title && text) {
      const title = text.slice(0, 80);
      await db
        .update(houseChats)
        .set({ title, updatedAt: new Date() })
        .where(eq(houseChats.id, chatId));
    } else {
      await db.update(houseChats).set({ updatedAt: new Date() }).where(eq(houseChats.id, chatId));
    }
  }

  const history = await db
    .select()
    .from(houseChatMessages)
    .where(eq(houseChatMessages.chatId, chatId))
    .orderBy(asc(houseChatMessages.createdAt))
    .limit(40);

  // Drop trailing assistant so regenerate replaces the last reply
  const trimmedHistory =
    regenerate && history.length > 0 && history[history.length - 1]?.role === "assistant"
      ? history.slice(0, -1)
      : history;

  if (regenerate && trimmedHistory.length > 0) {
    const last = history[history.length - 1];
    if (last?.role === "assistant") {
      await db.delete(houseChatMessages).where(eq(houseChatMessages.id, last.id));
    }
  }

  const messages: Array<{ role: string; content: string | ContentPart[] }> = [];
  if (protectedChild) {
    messages.push({ role: "system", content: HOUSE_CHAT_CHILD_SAFETY_PROMPT });
  }
  for (const row of trimmedHistory) {
    if (row.role === "user" || row.role === "assistant" || row.role === "system") {
      if (
        !regenerate &&
        row.role === "user" &&
        row.content === text &&
        content &&
        typeof content !== "string" &&
        !protectedChild
      ) {
        messages.push({ role: "user", content: content as ContentPart[] });
      } else {
        messages.push({ role: row.role, content: row.content });
      }
    }
  }

  const model = houseChatModelForMode(mode);
  const thinking = model.includes("thinking") ? {} : houseChatModeToThinking(mode);
  const gatewayUrl = assistantGatewayUrl();
  const maxTokens = mode === "thinking" || mode === "max" ? 8192 : 2048;

  let upstream: Response;
  try {
    upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: assistantGatewayHeaders(orgId, { "X-OpenDoor-House-Chat": "1" }),
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: maxTokens,
        ...thinking,
      }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gateway unreachable";
    return NextResponse.json({ error: `Cannot reach gateway: ${message}` }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    let detail = errText;
    try {
      const parsed = JSON.parse(errText) as { error?: string | { message?: string } };
      if (typeof parsed.error === "string") detail = parsed.error;
      else if (parsed.error?.message) detail = parsed.error.message;
    } catch {
      /* keep raw */
    }
    return NextResponse.json(
      {
        error: detail || `Qwen is unavailable (${upstream.status}). Check Vertex MaaS on the gateway.`,
      },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let assistantText = "";
  let reasoningText = "";
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      const ingest = (payload: string) => {
        if (!payload || payload === "[DONE]") return;
        const chunk = JSON.parse(payload) as {
          error?: unknown;
          choices?: Array<{
            delta?: { content?: string; reasoning_content?: string };
            message?: { content?: string; reasoning_content?: string };
          }>;
        };
        const err = chunkError(chunk);
        if (err) throw new Error(err);
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        const message = choice?.message;
        const reasoning =
          (typeof delta?.reasoning_content === "string" && delta.reasoning_content) ||
          (typeof message?.reasoning_content === "string" && message.reasoning_content) ||
          "";
        const text =
          (typeof delta?.content === "string" && delta.content) ||
          (typeof message?.content === "string" && message.content) ||
          "";
        if (reasoning) {
          reasoningText += reasoning;
          send({ type: "reasoning", text: reasoning });
        }
        if (text) {
          assistantText += text;
          send({ type: "content", text });
        }
      };

      const pump = async (body: ReadableStream<Uint8Array>) => {
        const r = body.getReader();
        buffer = "";
        try {
          while (true) {
            const { done, value } = await r.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            for (const line of lines) {
              const payload = sseDataPayload(line);
              if (payload == null) continue;
              try {
                ingest(payload);
              } catch (err) {
                if (err instanceof SyntaxError) continue;
                throw err;
              }
            }
          }
          const tail = sseDataPayload(buffer);
          if (tail) ingest(tail);
        } finally {
          r.releaseLock();
        }
      };

      try {
        await pump(upstream.body!);

        if (!assistantText.trim()) {
          const retry = await fetch(`${gatewayUrl}/v1/chat/completions`, {
            method: "POST",
            headers: assistantGatewayHeaders(orgId, { "X-OpenDoor-House-Chat": "1" }),
            body: JSON.stringify({
              model,
              messages,
              stream: true,
              max_tokens: maxTokens,
            }),
            signal: AbortSignal.timeout(180_000),
          });
          if (retry.ok && retry.body) {
            await pump(retry.body);
          } else {
            const errText = await retry.text().catch(() => "");
            throw new Error(errText || `Qwen is unavailable (${retry.status}).`);
          }
        }

        if (!assistantText.trim()) {
          send({
            type: "error",
            error: "Qwen is busy on Vertex. Wait a few seconds and send again.",
          });
          return;
        }

        if (!session.isSiteAdmin) {
          await incrementHouseChatUsage(session.userId, orgId);
        }

        const [saved] = await db
          .insert(houseChatMessages)
          .values({
            chatId,
            role: "assistant",
            content: assistantText,
            mode,
            reasoning: reasoningText || null,
          })
          .returning();

        await db.update(houseChats).set({ updatedAt: new Date() }).where(eq(houseChats.id, chatId));

        const nextAllowance = await getHouseChatAllowance(session.userId, orgId, undefined, {
          unlimited: Boolean(session.isSiteAdmin),
        });
        send({
          type: "done",
          messageId: saved!.id,
          content: assistantText,
          reasoning: reasoningText || null,
          mode,
          allowance: nextAllowance,
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stream failed";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
