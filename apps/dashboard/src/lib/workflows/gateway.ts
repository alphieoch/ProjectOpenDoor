import {
  assistantGatewayHeaders,
  assistantGatewaySecret,
  assistantGatewayUrl,
} from "@/lib/assistant-gateway";

export type WorkflowGatewayContext = {
  organizationId: string;
  url: string;
  headers: Record<string, string>;
  configured: boolean;
};

export function workflowGatewayContext(organizationId: string): WorkflowGatewayContext {
  return {
    organizationId,
    url: assistantGatewayUrl(),
    headers: assistantGatewayHeaders(organizationId),
    configured: Boolean(assistantGatewaySecret()),
  };
}

export async function gatewayJson<T = Record<string, unknown>>(
  ctx: WorkflowGatewayContext,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${ctx.url}${path}`, {
    ...init,
    headers: {
      ...ctx.headers,
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}
