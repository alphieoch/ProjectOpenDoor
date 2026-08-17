import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { gatewayBaseUrl } from "@/lib/public-urls";
import { formatGatewayError, inferModelModality } from "@/lib/models/modality";
import { forbidProtectedChild } from "@/lib/parent-protection";

function gatewayUrl() {
  return (process.env.GATEWAY_URL || gatewayBaseUrl()).replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await forbidProtectedChild(session);
  if (blocked) return blocked;

  const apiKey =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    req.headers.get("x-playground-key") ||
    "";
  if (!apiKey) {
    return NextResponse.json({ error: "Playground API key is not ready yet." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const model = typeof body.model === "string" ? body.model : "";
  if (!model) return NextResponse.json({ error: "model is required" }, { status: 400 });

  const modality = inferModelModality(model);
  if (modality !== "chat") {
    return NextResponse.json(
      {
        error: `${model} is an ${modality} model. Pick a chat model in the playground.`,
      },
      { status: 400 },
    );
  }

  const dataClass =
    typeof body.data_class === "string" &&
    ["public", "internal", "confidential", "restricted"].includes(body.data_class)
      ? body.data_class
      : "internal";

  const url = gatewayUrl();
  let upstream: Response;
  try {
    upstream = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Data-Class": dataClass,
      },
      body: JSON.stringify({
        model,
        messages: body.messages,
        stream: true,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        top_p: body.top_p,
        ...(body.provider && typeof body.provider === "object" && !Array.isArray(body.provider)
          ? { provider: body.provider }
          : {}),
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gateway unreachable";
    return NextResponse.json(
      { error: `Cannot reach the gateway at ${url}. ${message}` },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(
      { error: formatGatewayError(data, `Gateway returned ${upstream.status}`) },
      { status: upstream.status },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
