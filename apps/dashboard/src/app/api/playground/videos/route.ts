import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { formatGatewayError } from "@/lib/models/modality";
import { gatewayBaseUrl } from "@/lib/public-urls";

function gatewayUrl() {
  return (process.env.GATEWAY_URL || gatewayBaseUrl()).replace(/\/$/, "");
}

function playgroundKey(req: NextRequest) {
  return (
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    req.headers.get("x-playground-key") ||
    ""
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = playgroundKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "Playground API key is not ready yet." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = gatewayUrl();
  let upstream: Response;
  try {
    upstream = await fetch(`${url}/v1/videos/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json(
      { error: "Cannot reach the gateway." },
      { status: 502 },
    );
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(
      { error: formatGatewayError(data, `Gateway returned ${upstream.status}`), ...data },
      { status: upstream.status },
    );
  }
  return NextResponse.json(data);
}
