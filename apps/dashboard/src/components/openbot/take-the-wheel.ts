/**
 * Vendored from CopilotKit/openbot `app/src/components/computer/take-the-wheel.ts` (MIT).
 * Paths point at OpenDoor's agent computer proxy instead of OpenBot's /api/computers.
 */

export type ControlState = {
  holder: "bot" | "human";
  since: string;
  reason?: string;
  requested: boolean;
  secretWanted?: string;
};

function computerUrl(agentId: string, path: string) {
  return `/api/agents/${encodeURIComponent(agentId)}/computer${path}`;
}

async function callControl(agentId: string, path: string, init?: RequestInit): Promise<ControlState | null> {
  const response = await fetch(computerUrl(agentId, path), {
    credentials: "include",
    ...init,
  });
  if (!response.ok) return null;
  return (await response.json()) as ControlState;
}

export function readControl(agentId: string) {
  return callControl(agentId, "/control");
}

export function takeControl(agentId: string) {
  return callControl(agentId, "/control/take", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
}

export function releaseControl(agentId: string) {
  return callControl(agentId, "/control/release", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
}

export async function supplySecret(agentId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(computerUrl(agentId, "/human/secret"), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? "That could not be entered." };
  } catch {
    return { ok: false, error: "The assistant's computer could not be reached." };
  }
}

let inputQueue: Promise<unknown> = Promise.resolve();

export function sendHumanInput(
  agentId: string,
  kind: "click" | "type" | "key" | "scroll",
  body: Record<string, unknown>,
): void {
  inputQueue = inputQueue
    .then(() =>
      fetch(computerUrl(agentId, `/human/${kind}`), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    )
    .catch(() => undefined);
}

export {
  COMPUTER_VIEWPORT,
  letterboxedImageRect,
  pageCoordinates,
  screenshotToViewport,
  viewportToOverlay,
} from "@opendoor/shared";
