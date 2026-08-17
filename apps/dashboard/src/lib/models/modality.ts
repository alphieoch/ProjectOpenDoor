export type ModelModality = "chat" | "embedding" | "rerank";

export function inferModelModality(id: string, label = ""): ModelModality {
  const s = `${id} ${label}`.toLowerCase();
  if (/(^|[\s/_-])rerank(er)?([\s/_-]|$)/.test(s)) return "rerank";
  if (
    /text-embedding|embed|nomic-embed|e5-|gte-|minilm|voyage-|bge-/.test(s) ||
    /(^|[\s/_-])bge([\s/_-]|$)/.test(s)
  ) {
    return "embedding";
  }
  return "chat";
}

export function isChatModality(modality: ModelModality | string | undefined): boolean {
  return !modality || modality === "chat";
}

export function formatGatewayError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const row = data as { error?: unknown; message?: unknown; policy_action?: unknown };
  if (typeof row.error === "string" && row.error.trim()) {
    if (row.policy_action === "require_approval") {
      return `${row.error} Approve the model in Governance → Approvals, then retry.`;
    }
    return row.error;
  }
  if (row.error && typeof row.error === "object") {
    const nested = row.error as { message?: unknown; type?: unknown };
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
  }
  if (typeof row.message === "string" && row.message.trim()) return row.message;
  return fallback;
}
