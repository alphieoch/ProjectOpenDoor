import { NextResponse } from "next/server";
import {
  appBaseUrl,
  gatewayInternalUrl,
  gatewayStatusCollidesWithApp,
} from "@/lib/public-urls";

type ProviderRow = {
  name: string;
  slug: string;
  status: "up" | "down" | "unknown" | "not_configured";
  latencyMs: number | null;
};

async function legacyGatewayHealth(gatewayUrl: string): Promise<{
  gateway: { status: "up" | "down"; latencyMs: number | null; url: string };
}> {
  const start = Date.now();
  try {
    const res = await fetch(`${gatewayUrl}/health`, { cache: "no-store" });
    return {
      gateway: {
        status: res.ok ? "up" : "down",
        latencyMs: Date.now() - start,
        url: gatewayUrl,
      },
    };
  } catch {
    return { gateway: { status: "down", latencyMs: null, url: gatewayUrl } };
  }
}

function statusUrls(gatewayUrl: string): string[] {
  if (gatewayStatusCollidesWithApp(gatewayUrl)) {
    return [`${gatewayUrl}/gateway/status`];
  }
  return [`${gatewayUrl}/status`, `${gatewayUrl}/gateway/status`];
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  const gatewayUrl = gatewayInternalUrl();
  const started = Date.now();

  let res: Response | null = null;
  let usedUrl = gatewayUrl;
  for (const url of statusUrls(gatewayUrl)) {
    try {
      const attempt = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });
      const json = attempt.ok ? await readJson(attempt) : null;
      if (attempt.ok && json) {
        res = attempt;
        usedUrl = url;
        const gatewayLatency = Date.now() - started;
        return toBoard(json, gatewayUrl, gatewayLatency);
      }
      if (!res) res = attempt;
    } catch {
      /* try next */
    }
  }

  if (!res) {
    const { gateway } = await legacyGatewayHealth(gatewayUrl);
    return NextResponse.json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      gateway,
      database: { status: "unknown" as const, latencyMs: null },
      redis: { status: "unknown" as const, latencyMs: null },
      providers: [] as ProviderRow[],
      source: "gateway_unreachable",
      app: appBaseUrl(),
    });
  }

  const gatewayLatency = Date.now() - started;

  if (res.status === 404) {
    const { gateway } = await legacyGatewayHealth(gatewayUrl);
    return NextResponse.json({
      status: gateway.status === "up" ? "operational" : "degraded",
      timestamp: new Date().toISOString(),
      gateway: { ...gateway, latencyMs: gateway.latencyMs ?? gatewayLatency },
      database: { status: "unknown" as const, latencyMs: null },
      redis: { status: "unknown" as const, latencyMs: null },
      providers: [] as ProviderRow[],
      source: "gateway_legacy_no_status_route",
    });
  }

  const { gateway } = await legacyGatewayHealth(gatewayUrl);
  return NextResponse.json({
    status: "degraded",
    timestamp: new Date().toISOString(),
    gateway: { ...gateway, latencyMs: gatewayLatency, url: usedUrl },
    database: { status: "unknown" as const, latencyMs: null },
    redis: { status: "unknown" as const, latencyMs: null },
    providers: [] as ProviderRow[],
    source: "gateway_status_http_error",
  });
}

function toBoard(
  body: Record<string, unknown>,
  gatewayUrl: string,
  gatewayLatency: number
) {
  const database = (body.database as { status: "up" | "down"; latencyMs: number | null } | undefined) ?? {
    status: "unknown" as const,
    latencyMs: null,
  };
  const redis = (body.redis as { status: "up" | "down"; latencyMs: number | null } | undefined) ?? {
    status: "unknown" as const,
    latencyMs: null,
  };

  const rawProviders = (body.providers as { slug: string; name: string; configured: boolean }[] | undefined) ?? [];
  const providers: ProviderRow[] = rawProviders.map((p) => ({
    name: p.name,
    slug: p.slug,
    status: p.configured ? "up" : "not_configured",
    latencyMs: null,
  }));

  const infraUp = database.status === "up" && redis.status === "up";
  const azureRaw = body.azure as
    | {
        configured: boolean;
        host: string | null;
        deploymentCount?: number;
        deployments?: { id: string; model: string; status: string }[];
        fetchError: string | null;
      }
    | undefined;

  const azure = azureRaw
    ? {
        configured: azureRaw.configured,
        host: azureRaw.host ?? null,
        deploymentCount: azureRaw.deploymentCount ?? azureRaw.deployments?.length ?? 0,
        deployments: azureRaw.deployments ?? [],
        fetchError: azureRaw.fetchError ?? null,
      }
    : undefined;

  return NextResponse.json({
    status: (body.status as string) || (infraUp ? "operational" : "degraded"),
    timestamp: (body.timestamp as string) || new Date().toISOString(),
    gateway: {
      status: "up",
      latencyMs: gatewayLatency,
      url: gatewayUrl,
    },
    database,
    redis,
    providers,
    azure,
    source: "gateway",
  });
}
