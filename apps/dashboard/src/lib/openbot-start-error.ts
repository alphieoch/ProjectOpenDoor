import { formatGatewayError } from "@/lib/models/modality";

export function formatAgentStartError(
  data: unknown,
  status: number,
  fallback = "Could not start that coworker",
) {
  const body = formatGatewayError(data, "");
  const detail = body || fallback;
  if (!status || status === 200 || status === 201) return detail;
  if (body) return `${body} (${status})`;
  return `${fallback} (${status})`;
}
