/**
 * Vendored from CopilotKit/openbot `supervisor/src/identity.ts` (MIT).
 * Optional SPIRE registration. Unset SPIRE_SOCKET means no identity, which is fine.
 */

import type { ComputerNames } from "./names";
import { BOT_LABEL, NAMESPACE, NAMESPACE_LABEL } from "./names";

const SPIFFE_ENABLED = process.env.SPIRE_SOCKET !== undefined;
const AGENT_SPIFFE_ID =
  process.env.SPIRE_AGENT_ID ?? "spiffe://openbot.local/spire/agent/join_token/openbot";
const TRUST_DOMAIN = process.env.SPIRE_TRUST_DOMAIN ?? "openbot.local";

export function spiffeIdFor(botId: string): string {
  return `spiffe://${TRUST_DOMAIN}/bot/${botId}`;
}

export type EntryResult =
  | { registered: true; spiffeId: string }
  | { registered: false; reason: string };

export async function registerEntry(names: ComputerNames): Promise<EntryResult> {
  if (!SPIFFE_ENABLED) {
    return { registered: false, reason: "SPIRE is not configured." };
  }

  const spiffeId = spiffeIdFor(names.botId);
  const selectors = [
    `docker:label:${BOT_LABEL}:${names.botId}`,
    `docker:label:${NAMESPACE_LABEL}:${NAMESPACE}`,
  ];

  try {
    const process_ = Bun.spawn(
      [
        "spire-server",
        "entry",
        "create",
        "-socketPath",
        process.env.SPIRE_SOCKET ?? "/tmp/spire-server/private/api.sock",
        "-spiffeID",
        spiffeId,
        "-parentID",
        AGENT_SPIFFE_ID,
        ...selectors.flatMap((selector) => ["-selector", selector]),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    const [status, stderr] = await Promise.all([
      process_.exited,
      new Response(process_.stderr).text(),
    ]);

    if (status !== 0 && !stderr.includes("similar entry already exists")) {
      return {
        registered: false,
        reason: stderr.trim().slice(0, 200) || `spire-server exited ${status}`,
      };
    }

    return { registered: true, spiffeId };
  } catch (error) {
    return {
      registered: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
