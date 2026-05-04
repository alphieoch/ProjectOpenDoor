import { NextResponse } from "next/server";

type ProviderRow = {
  name: string;
  slug: string;
  status: "up" | "down" | "unknown" | "not_configured";
  latencyMs: number | null;
};

function gatewayBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_GATEWAY_URL ||
    process.env.GATEWAY_URL ||
    "http://localhost:3001";
  return raw.replace(/\/$/, "");
}

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

export async function GET() {
  const gatewayUrl = gatewayBaseUrl();
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(`${gatewayUrl}/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    const { gateway } = await legacyGatewayHealth(gatewayUrl);
    return NextResponse.json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      gateway,
      database: { status: "unknown" as const, latencyMs: null },
      redis: { status: "unknown" as const, latencyMs: null },
      providers: [] as ProviderRow[],
      source: "gateway_unreachable",
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

  if (!res.ok) {
    const { gateway } = await legacyGatewayHealth(gatewayUrl);
    return NextResponse.json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      gateway: { ...gateway, latencyMs: gatewayLatency },
      database: { status: "unknown" as const, latencyMs: null },
      redis: { status: "unknown" as const, latencyMs: null },
      providers: [] as ProviderRow[],
      source: "gateway_status_http_error",
    });
  }

  const body = (await res.json()) as {
    timestamp?: string;
    status?: string;
    database?: { status: "up" | "down"; latencyMs: number | null };
    redis?: { status: "up" | "down"; latencyMs: number | null };
    providers?: { slug: string; name: string; configured: boolean }[];
    azure?: {
      configured: boolean;
      host: string | null;
      deploymentCount?: number;
      deployments: { id: string; model: string; status: string }[];
      fetchError: string | null;
    };
  };

  const database = body.database ?? { status: "unknown" as const, latencyMs: null };
  const redis = body.redis ?? { status: "unknown" as const, latencyMs: null };

  const providers: ProviderRow[] = (body.providers ?? []).map((p) => ({
    name: p.name,
    slug: p.slug,
    status: p.configured ? "up" : "not_configured",
    latencyMs: null,
  }));

  const infraUp = database.status === "up" && redis.status === "up";

  const azure = body.azure
    ? {
        configured: body.azure.configured,
        host: body.azure.host ?? null,
        deploymentCount: body.azure.deploymentCount ?? body.azure.deployments?.length ?? 0,
        deployments: body.azure.deployments ?? [],
        fetchError: body.azure.fetchError ?? null,
      }
    : undefined;

  return NextResponse.json({
    status: body.status || (infraUp ? "operational" : "degraded"),
    timestamp: body.timestamp || new Date().toISOString(),
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
