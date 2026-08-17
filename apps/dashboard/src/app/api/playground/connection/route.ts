import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { gatewayBaseUrl } from "@/lib/public-urls";

function gatewayUrl() {
  return (process.env.GATEWAY_URL || gatewayBaseUrl()).replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = gatewayUrl();
  const started = Date.now();
  let gateway: "up" | "down" = "down";
  let gatewayError: string | null = null;

  try {
    const health = await fetch(`${url}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    gateway = health.ok ? "up" : "down";
    if (!health.ok) gatewayError = `Gateway health returned ${health.status}`;
  } catch (err) {
    gateway = "down";
    gatewayError = err instanceof Error ? err.message : "Gateway unreachable";
  }

  const latencyMs = Date.now() - started;
  const apiKey = req.headers.get("x-playground-key") || "";
  let key: "missing" | "valid" | "invalid" | "skipped" = apiKey ? "invalid" : "missing";

  if (gateway === "up" && apiKey) {
    try {
      const models = await fetch(`${url}/v1/models`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      if (models.ok) key = "valid";
      else if (models.status === 401 || models.status === 403) key = "invalid";
      else key = "skipped";
    } catch {
      key = "skipped";
    }
  } else if (gateway === "down") {
    key = apiKey ? "skipped" : "missing";
  }

  const providers: { slug: string; name: string; configured: boolean }[] = [];
  if (gateway === "up") {
    try {
      const status = await fetch(`${url}/status`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (status.ok) {
        const body = (await status.json()) as {
          providers?: { slug: string; name: string; configured?: boolean }[];
        };
        for (const p of body.providers || []) {
          providers.push({
            slug: p.slug,
            name: p.name,
            configured: Boolean(p.configured),
          });
        }
      }
    } catch {
      /* status is optional */
    }
  }

  const liveProviders = providers.filter((p) => p.configured).map((p) => p.name);
  const ready = gateway === "up" && (key === "valid" || key === "skipped");
  return NextResponse.json({
    ready,
    status: ready ? "connected" : gateway === "down" ? "offline" : key === "invalid" ? "bad_key" : "connecting",
    gateway: { status: gateway, url, latencyMs, error: gatewayError },
    key,
    providers: liveProviders,
  });
}
