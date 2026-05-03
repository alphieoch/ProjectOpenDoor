import { PostHog } from "posthog-node";
import type { NextRequest } from "next/server";

let instance: PostHog | null | undefined;

function projectApiKey(): string | undefined {
  return (
    process.env.POSTHOG_KEY ||
    process.env.POSTHOG_API_KEY ||
    process.env.NEXT_PUBLIC_POSTHOG_KEY ||
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  );
}

function ingestHost(): string {
  return (
    process.env.POSTHOG_HOST ||
    process.env.NEXT_PUBLIC_POSTHOG_HOST ||
    "https://us.i.posthog.com"
  );
}

export function getPostHogServer(): PostHog | null {
  if (instance === undefined) {
    const key = projectApiKey();
    if (!key) {
      instance = null;
      return null;
    }
    instance = new PostHog(key, {
      host: ingestHost(),
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return instance;
}

export async function shutdownPostHog(): Promise<void> {
  if (instance != null) {
    await instance.shutdown();
  }
  instance = undefined;
}

export function posthogServerCapture(
  req: NextRequest | null,
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): void {
  const ph = getPostHogServer();
  if (!ph) return;
  const sessionId = req?.headers.get("x-posthog-session-id") || undefined;
  const clientDistinctId =
    req?.headers.get("x-posthog-distinct-id") || undefined;
  ph.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      ...(sessionId ? { $session_id: sessionId } : {}),
      ...(clientDistinctId && clientDistinctId !== distinctId
        ? { $anon_distinct_id: clientDistinctId }
        : {}),
    },
  });
}
