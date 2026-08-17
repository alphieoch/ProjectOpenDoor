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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = playgroundKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "Playground API key is not ready yet." }, { status: 400 });
  }

  const { id } = params;
  const url = gatewayUrl();
  let upstream: Response;
  try {
    upstream = await fetch(`${url}/v1/videos/generations/${encodeURIComponent(id)}/content`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
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
      { error: formatGatewayError(data, `Gateway returned ${upstream.status}`), ...data },
      { status: upstream.status },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "video/mp4",
      "Content-Disposition":
        upstream.headers.get("content-disposition") || `inline; filename="${id}.mp4"`,
    },
  });
}
