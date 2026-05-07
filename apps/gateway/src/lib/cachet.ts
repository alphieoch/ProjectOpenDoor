/**
 * Cachet v2.4 REST API client.
 * https://docs.cachethq.io/docs/api
 */

const CACHET_URL = process.env.CACHET_URL?.replace(/\/$/, "");
const CACHET_API_KEY = process.env.CACHET_API_KEY;
const CACHET_ENABLED = process.env.CACHET_ENABLED === "true" || !!CACHET_API_KEY;

/** Cachet component status codes */
export const CachetStatus = {
  Operational: 1,
  PerformanceIssues: 2,
  PartialOutage: 3,
  MajorOutage: 4,
} as const;

export interface CachetComponent {
  id: number;
  name: string;
  status: number;
  description: string;
  link: string;
}

export interface CachetComponentsResponse {
  data: CachetComponent[];
}

export interface CachetMetric {
  id: number;
  name: string;
  suffix: string;
  description: string;
}

async function cachetFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!CACHET_ENABLED || !CACHET_URL || !CACHET_API_KEY) {
    return null;
  }
  try {
    const res = await fetch(`${CACHET_URL}/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Cachet-Token": CACHET_API_KEY,
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      console.error(`Cachet API error: ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error("Cachet API request failed:", e);
    return null;
  }
}

export async function getComponents(): Promise<CachetComponent[]> {
  const res = await cachetFetch<CachetComponentsResponse>("/components");
  return res?.data ?? [];
}

export async function updateComponent(
  componentId: number,
  status: number
): Promise<boolean> {
  const res = await cachetFetch<{ data: CachetComponent }>(`/components/${componentId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
  return res !== null;
}

export async function createMetricPoint(
  metricId: number,
  value: number,
  timestamp?: number
): Promise<boolean> {
  const body: Record<string, unknown> = { value };
  if (timestamp) {
    body.timestamp = timestamp;
  }
  const res = await cachetFetch<unknown>(`/metrics/${metricId}/points`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res !== null;
}

export async function getMetrics(): Promise<CachetMetric[]> {
  const res = await cachetFetch<{ data: CachetMetric[] }>("/metrics");
  return res?.data ?? [];
}
