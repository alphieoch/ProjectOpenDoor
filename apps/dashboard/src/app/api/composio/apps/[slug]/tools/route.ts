import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getComposio } from "@/lib/composio/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  await requireAuth();
  const { slug } = await params;

  try {
    const composio = getComposio();
    const tools = await composio.tools.getRawComposioTools({ toolkits: [slug] });

    return NextResponse.json({
      tools: tools.map((t) => ({
        slug: t.slug,
        name: t.name ?? t.slug,
        description: t.description ?? null,
        toolkit: t.toolkit?.slug ?? slug,
      })),
    });
  } catch (err: unknown) {
    console.error("Composio tools error:", err);
    const message = err instanceof Error ? err.message : "Failed to fetch tools";
    return NextResponse.json({ error: message, tools: [] }, { status: 500 });
  }
}
