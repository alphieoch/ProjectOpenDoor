import { gatewayBaseUrl } from "@/lib/public-urls";

export function assistantGatewayUrl() {
  return (process.env.GATEWAY_URL || gatewayBaseUrl()).replace(/\/$/, "");
}

export function assistantGatewaySecret() {
  return process.env.GATEWAY_INTERNAL_KEY || process.env.INTERNAL_API_KEY || "";
}

export function assistantGatewayHeaders(orgId: string, extra?: Record<string, string>) {
  const secret = assistantGatewaySecret();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
    "X-OpenDoor-Organization-Id": orgId,
    ...extra,
  };
}

export function inferAssistantFamily(
  modelId: string | null | undefined
): "closed" | "open_weight" {
  const model = (modelId || "").toLowerCase();
  if (
    model.startsWith("custom:") ||
    model.startsWith("premium:") ||
    model.startsWith("ollama:") ||
    model.includes("llama") ||
    model.includes("deepseek") ||
    model.includes("qwen") ||
    model.includes("mistral")
  ) {
    return "open_weight";
  }
  return "closed";
}
