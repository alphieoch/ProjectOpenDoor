import { SEARCH_TOOL_ID, getPlatformTool } from "@opendoor/shared";
import { ragSearch, RagSearchError, RagSearchNotConfiguredError } from "@/lib/tools/rag-search";
import { authorizeOpenDoorSearch, settleOpenDoorSearch } from "@/lib/tools/search-spend";
import { normalizeSearchResult, type SearchInvokeSuccess } from "@/lib/tools/search-contract";
import type { SessionPayload } from "@/lib/auth";

export type SearchInvokeFailure = {
  error: string;
  code?: "empty_query" | "not_enabled" | "not_configured" | "tool_failed";
};

export async function invokeOpenDoorSearch(input: {
  orgId: string;
  query: string;
  userId?: string | null;
  isSiteAdmin?: boolean;
  session?: SessionPayload;
  maxResults?: number;
}): Promise<
  | { ok: true; status: 200; body: SearchInvokeSuccess }
  | { ok: false; status: 400 | 402 | 404 | 502 | 503; body: SearchInvokeFailure }
> {
  const tool = getPlatformTool(SEARCH_TOOL_ID);
  if (!tool) return { ok: false, status: 404, body: { error: "Tool not found" } };

  const query = input.query.trim();
  if (!query) {
    return { ok: false, status: 400, body: { error: "Enter a question to search.", code: "empty_query" } };
  }

  const gate = await authorizeOpenDoorSearch({
    orgId: input.orgId,
    userId: input.userId,
    isSiteAdmin: input.isSiteAdmin,
    session: input.session,
  });
  if (!gate.ok) {
    return {
      ok: false,
      status: gate.status,
      body: {
        error: gate.error,
        code: gate.status === 404 ? "tool_failed" : "not_enabled",
      },
    };
  }

  let raw: unknown;
  try {
    raw = await ragSearch({
      query,
      maxResults: input.maxResults,
    });
  } catch (err) {
    if (err instanceof RagSearchNotConfiguredError) {
      return { ok: false, status: 503, body: { error: err.message, code: "not_configured" } };
    }
    if (err instanceof RagSearchError) {
      const status = err.status === 400 ? 400 : err.status === 503 ? 503 : 502;
      return {
        ok: false,
        status,
        body: {
          error: err.message,
          code: status === 400 ? "empty_query" : status === 503 ? "not_configured" : "tool_failed",
        },
      };
    }
    const message = err instanceof Error ? err.message : "Search failed";
    return { ok: false, status: 502, body: { error: message, code: "tool_failed" } };
  }

  const result = normalizeSearchResult(raw);
  if (!result || (!result.answer && result.citations.length === 0)) {
    return { ok: false, status: 502, body: { error: "Search returned no answer.", code: "tool_failed" } };
  }

  const charge = await settleOpenDoorSearch({
    orgId: input.orgId,
    userId: input.userId,
    isSiteAdmin: input.isSiteAdmin,
    coveredByAddon: gate.coveredByAddon,
  });
  if ("error" in charge) {
    return { ok: false, status: charge.status, body: { error: charge.error } };
  }

  const citations = result.citations;
  const answer = result.answer;
  return {
    ok: true,
    status: 200,
    body: {
      tool: SEARCH_TOOL_ID,
      query: result.query || query,
      answer,
      citations,
      provider: result.provider,
      chargedCents: charge.chargedCents,
      unlimited: charge.unlimited,
      step: {
        status: "ok",
        text: answer,
        results: citations,
        citations,
        provider: result.provider,
      },
    },
  };
}
