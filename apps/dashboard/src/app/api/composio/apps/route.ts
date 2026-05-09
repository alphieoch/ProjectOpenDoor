import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

const COMPOSIO_BASE = "https://backend.composio.dev";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized", apps: [] }, { status: 401 });
  }

  const search = req.nextUrl.searchParams.get("search") ?? "";
  const cursor = req.nextUrl.searchParams.get("cursor") ?? "";

  const url = new URL(`${COMPOSIO_BASE}/api/v1/apps`);
  url.searchParams.set("limit", "50");
  if (search) url.searchParams.set("search", search);
  if (cursor) url.searchParams.set("cursor", cursor);

  try {
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": process.env.COMPOSIO_API_KEY! },
      next: { revalidate: 300 }, // 5-minute cache
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch apps", apps: [] }, { status: res.status });
    }

    const data = await res.json();

    // Normalize the response shape
    const apps = (data.items ?? data.apps ?? []).map((app: Record<string, unknown>) => ({
      slug:         app.key ?? app.slug ?? app.name,
      name:         app.displayName ?? app.name,
      logo:         app.logo ?? app.logoUrl ?? null,
      description:  app.description ?? null,
      actionsCount: app.no_of_apps ?? app.actionsCount ?? null,
      authSchemes:  app.auth_schemes ?? [],
    }));

    return NextResponse.json({ apps, nextCursor: data.nextCursor ?? null });
  } catch {
    return NextResponse.json({ error: "Failed to fetch apps", apps: [] }, { status: 500 });
  }
}
