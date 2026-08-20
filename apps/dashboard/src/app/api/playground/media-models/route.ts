import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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

type MediaModel = { id: string; display_name?: string; provider?: string };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = playgroundKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "Playground API key is not ready yet." }, { status: 400 });
  }

  const url = gatewayUrl();
  try {
    const [images, videos] = await Promise.all([
      fetch(`${url}/v1/images/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      }),
      fetch(`${url}/v1/videos/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      }),
    ]);
    const imageJson = (await images.json().catch(() => ({}))) as { data?: MediaModel[] };
    const videoJson = (await videos.json().catch(() => ({}))) as { data?: MediaModel[] };
    return NextResponse.json({
      images: images.ok && Array.isArray(imageJson.data) ? imageJson.data : [],
      videos: videos.ok && Array.isArray(videoJson.data) ? videoJson.data : [],
    });
  } catch {
    return NextResponse.json(
      { error: "Cannot reach the gateway.", images: [], videos: [] },
      { status: 502 },
    );
  }
}
