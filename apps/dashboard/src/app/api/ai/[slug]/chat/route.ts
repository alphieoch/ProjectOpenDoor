import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { aiAssistants } from "@opendoor/database";
import { eq } from "drizzle-orm";

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:3001";
const GATEWAY_KEY = process.env.GATEWAY_INTERNAL_KEY ?? "";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();

  const [assistant] = await db
    .select()
    .from(aiAssistants)
    .where(eq(aiAssistants.slug, slug));

  if (!assistant || !assistant.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Access control
  if (assistant.visibility === "private") {
    return NextResponse.json({ error: "This assistant is private." }, { status: 403 });
  }
  if (assistant.visibility === "team") {
    const session = await getSession();
    if (!session || session.orgId !== assistant.organizationId) {
      return NextResponse.json({ error: "Team access only." }, { status: 403 });
    }
  }
  if (!assistant.publishedAt) {
    return NextResponse.json({ error: "This assistant is not yet published." }, { status: 404 });
  }

  const body = await req.json();
  const messages: { role: string; content: string }[] = body.messages ?? [];

  // Prepend system prompt if set
  const gatewayMessages = assistant.systemPrompt
    ? [{ role: "system", content: assistant.systemPrompt }, ...messages]
    : messages;

  const upstream = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GATEWAY_KEY}`,
    },
    body: JSON.stringify({
      model: assistant.modelId ?? "gpt-4o",
      messages: gatewayMessages,
      stream: true,
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json({ error: text }, { status: upstream.status });
  }

  // Stream the response back to the browser
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
