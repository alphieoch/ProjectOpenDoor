import { PostHog } from "posthog-node";
import { randomUUID } from "crypto";

let client: PostHog | null | undefined;

function ingestHost(): string {
  return (
    process.env.POSTHOG_HOST ||
    process.env.NEXT_PUBLIC_POSTHOG_HOST ||
    "https://us.i.posthog.com"
  );
}

export function getGatewayPostHog(): PostHog | null {
  if (client === undefined) {
    const key = process.env.POSTHOG_API_KEY || process.env.POSTHOG_KEY;
    if (!key) {
      client = null;
      return null;
    }
    client = new PostHog(key, {
      host: ingestHost(),
      flushAt: 20,
      flushInterval: 5000,
    });
  }
  return client;
}

export async function shutdownGatewayPostHog(): Promise<void> {
  if (client) {
    await client.shutdown();
    client = undefined;
  }
}

export function sanitizeMessagesForAi(
  messages: unknown[]
): { role?: string; content: string }[] {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-6).map((m: any) => ({
    role: m?.role,
    content:
      typeof m?.content === "string"
        ? m.content.slice(0, 1200)
        : JSON.stringify(m?.content ?? "").slice(0, 1200),
  }));
}

export function assistantChoicesFromText(text: string, max = 8000) {
  const t = text.slice(0, max);
  return [{ role: "assistant" as const, content: t || "(empty)" }];
}

export function captureAiGeneration(opts: {
  distinctId: string;
  model: string;
  providerSlug: string;
  input: unknown;
  outputChoices: unknown[];
  inputTokens: number;
  outputTokens: number;
  latencySeconds: number;
  stream?: boolean;
  timeToFirstTokenSeconds?: number;
  extra?: Record<string, unknown>;
}): void {
  const ph = getGatewayPostHog();
  if (!ph) return;
  const traceId = randomUUID();
  ph.capture({
    distinctId: opts.distinctId,
    event: "$ai_generation",
    properties: {
      $ai_trace_id: traceId,
      $ai_model: opts.model,
      $ai_provider: opts.providerSlug,
      $ai_input: opts.input,
      $ai_output_choices: opts.outputChoices,
      $ai_input_tokens: opts.inputTokens,
      $ai_output_tokens: opts.outputTokens,
      $ai_latency: opts.latencySeconds,
      ...(opts.stream !== undefined ? { $ai_stream: opts.stream } : {}),
      ...(opts.timeToFirstTokenSeconds != null
        ? { $ai_time_to_first_token: opts.timeToFirstTokenSeconds }
        : {}),
      ...opts.extra,
    },
  });
}

export function captureGatewayEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>
): void {
  const ph = getGatewayPostHog();
  if (!ph) return;
  ph.capture({ distinctId, event, properties });
}

export function captureGatewayException(
  distinctId: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const ph = getGatewayPostHog();
  if (!ph) return;
  if (error instanceof Error) {
    ph.captureException(error, extra, distinctId);
    return;
  }
  ph.capture({
    distinctId,
    event: "$exception",
    properties: { $exception_message: String(error), ...extra },
  });
}
