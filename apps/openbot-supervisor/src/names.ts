/**
 * Vendored from CopilotKit/openbot `supervisor/src/names.ts` (MIT).
 * https://github.com/CopilotKit/openbot
 *
 * A Bot id becomes a container name and two volume names. Callers never name Docker objects.
 */

const MAX_BOT_ID = 64;
const ALLOWED = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const DEFAULT_NAMESPACE = "openbot";

export const NAMESPACE = (() => {
  const configured = process.env.COMPUTER_NAMESPACE?.trim();
  if (!configured) return DEFAULT_NAMESPACE;
  if (!ALLOWED.test(configured) || configured.length > MAX_BOT_ID) {
    throw new Error(
      "COMPUTER_NAMESPACE may contain only letters, digits, hyphen and underscore, and must start with a letter or digit.",
    );
  }
  return configured;
})();

export type ComputerNames = {
  botId: string;
  container: string;
  profileVolume: string;
  workspaceVolume: string;
};

export type NameResult =
  | { ok: true; names: ComputerNames }
  | { ok: false; reason: string };

export const OWNER_LABEL = "openbot.supervisor";
export const BOT_LABEL = "openbot.bot-id";
export const NAMESPACE_LABEL = "openbot.namespace";

export function namesFor(botId: unknown): NameResult {
  if (typeof botId !== "string" || botId.length === 0) {
    return { ok: false, reason: "A bot id is required." };
  }
  if (botId.length > MAX_BOT_ID) {
    return { ok: false, reason: `A bot id may be at most ${MAX_BOT_ID} characters.` };
  }
  if (!ALLOWED.test(botId)) {
    return {
      ok: false,
      reason:
        "A bot id may contain only letters, digits, hyphen and underscore, and must start with a letter or digit.",
    };
  }

  return {
    ok: true,
    names: {
      botId,
      container: `${NAMESPACE}-computer-${botId}`,
      profileVolume: `${NAMESPACE}-profile-${botId}`,
      workspaceVolume: `${NAMESPACE}-workspace-${botId}`,
    },
  };
}
