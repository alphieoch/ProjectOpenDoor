import { NextRequest, NextResponse } from "next/server";
import { SEARCH_TOOL_ID } from "@opendoor/shared";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { enforceAuthRateLimit } from "@/lib/auth-rate-limit";
import { publicErrorMessage } from "@/lib/client-error";
import { invokeOpenDoorSearch } from "@/lib/tools/search-invoke";
import { DELETE as disableTool, POST as enableTool } from "../[id]/route";

/**
 * POST /api/tools/search — run OpenDoor Search when `query` is present.
 * POST without a query enables the tool (same as POST /api/tools/:id).
 * DELETE disables it so `/api/tools/search` does not shadow entitle routes.
 */
export async function POST(req: NextRequest) {
  const clone = req.clone();
  const body = (await clone.json().catch(() => ({}))) as Record<string, unknown>;
  const hasQueryField = "query" in body || "prompt" in body;
  const query =
    typeof body.query === "string"
      ? body.query
      : typeof body.prompt === "string"
        ? body.prompt
        : "";

  if (hasQueryField && !query.trim()) {
    return NextResponse.json({ error: "query is required", code: "empty_query" }, { status: 400 });
  }

  if (!query.trim()) {
    return enableTool(req, { params: Promise.resolve({ id: SEARCH_TOOL_ID }) });
  }

  try {
    const session = await requireAuth();
    const limited = enforceAuthRateLimit("search", req, session.email || session.userId);
    if (limited) return limited;
    const maxResults =
      typeof body.maxResults === "number"
        ? body.maxResults
        : typeof body.max_results === "number"
          ? body.max_results
          : undefined;

    const result = await invokeOpenDoorSearch({
      orgId: session.orgId as string,
      query,
      userId: sessionActorId(session),
      isSiteAdmin: session.isSiteAdmin,
      session,
      maxResults,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const message = publicErrorMessage(error, "Search failed");
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  return disableTool(req, { params: Promise.resolve({ id: SEARCH_TOOL_ID }) });
}
