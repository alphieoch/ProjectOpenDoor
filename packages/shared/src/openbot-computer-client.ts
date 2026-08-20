/**
 * HTTP client for the MIT OpenBot computer (`apps/openbot-computer`).
 * Contract matches CopilotKit/openbot `server/src/computer/client.ts` (MIT).
 */

import type {
  ActionResult,
  ClickInput,
  ControlState,
  KeyInput,
  MoveInput,
  WaitInput,
  ListFilesResult,
  NavigateResult,
  ReadFileResult,
  ReadResult,
  ScreenshotResult,
  ScrollInput,
  SnapshotResult,
  TypeInput,
  WriteFileResult,
} from "./openbot-schema.js";
import { checkNavigationTarget } from "./openbot-target.js";
import { privateImageAuthHeaders } from "./gcp-id-token.js";
import {
  hasOpenBotSupervisor,
  locateOpenBotComputer,
  openBotComputerToken,
  peekOpenBotComputer,
} from "./openbot-supervisor.js";

export type OpenBotComputerConfig = {
  baseUrl: string;
  token: string;
  allowPrivateHosts?: boolean;
  timeoutMs?: number;
};

function env(name: string) {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return processEnv?.[name] || "";
}

export function openBotComputerConfig(): OpenBotComputerConfig | null {
  const baseUrl = (env("OPENBOT_COMPUTER_URL") || env("AGENT_COMPUTER_URL")).replace(/\/$/, "");
  const token = openBotComputerToken();
  if (!baseUrl || !token) return null;
  return {
    baseUrl,
    token,
    allowPrivateHosts: env("AGENT_COMPUTER_ALLOW_PRIVATE_HOSTS") === "true",
  };
}

export function hasLiveOpenBotComputer() {
  return hasOpenBotSupervisor() || openBotComputerConfig() != null;
}

export class OpenBotComputerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenBotComputerError";
  }
}

export function createOpenBotComputerClient(config: OpenBotComputerConfig) {
  const timeoutMs = config.timeoutMs ?? 45_000;
  const base = config.baseUrl.replace(/\/$/, "");

  function bind(botId?: string) {
    async function call(path: string, init?: RequestInit) {
      let response: Response;
      try {
        const iam = await privateImageAuthHeaders(`${base}${path}`);
        response = await fetch(`${base}${path}`, {
          ...init,
          headers: {
            ...iam,
            ...((init?.headers as Record<string, string> | undefined) || {}),
            "x-openbot-computer-token": config.token,
            ...(botId ? { "x-openbot-bot-id": botId } : {}),
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new OpenBotComputerError(
          err instanceof Error && err.name === "TimeoutError"
            ? "The assistant's computer did not respond in time."
            : "The assistant's computer is not running.",
        );
      }
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        const detail = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
        throw new OpenBotComputerError(detail, response.status);
      }
      return body;
    }

    async function post(path: string, payload: unknown) {
      return call(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    return {
      async health() {
        return call("/health");
      },
      async navigate(url: string) {
        const verdict = checkNavigationTarget(url, { allowPrivateHosts: config.allowPrivateHosts });
        if (verdict.allowed === false) throw new OpenBotComputerError(verdict.reason, 403);
        return (await post("/navigate", { url: verdict.url })) as NavigateResult;
      },
      async read() {
        return (await call("/read")) as ReadResult;
      },
      async screenshot() {
        return (await call("/screenshot")) as ScreenshotResult;
      },
      async snapshot() {
        return (await post("/snapshot", {})) as SnapshotResult;
      },
      async click(input: ClickInput) {
        return (await post("/click", input)) as ActionResult;
      },
      async move(input: MoveInput) {
        return (await post("/move", input)) as ActionResult;
      },
      async wait(input: WaitInput = {}) {
        return (await post("/wait", input)) as ActionResult;
      },
      async type(input: TypeInput) {
        return (await post("/type", input)) as ActionResult;
      },
      async key(input: KeyInput) {
        return (await post("/key", input)) as ActionResult;
      },
      async scroll(input: ScrollInput) {
        return (await post("/scroll", input)) as ActionResult;
      },
      async readFile(path: string) {
        return (await post("/files/read", { path })) as ReadFileResult;
      },
      async writeFile(path: string, contents: string, append?: boolean) {
        return (await post("/files/write", { path, contents, append })) as WriteFileResult;
      },
      async listFiles(path?: string) {
        return (await post("/files/list", path ? { path } : {})) as ListFilesResult;
      },
      async control() {
        return (await call("/control")) as ControlState;
      },
      async requestControl(reason: string) {
        return (await post("/control/request", { reason })) as ControlState;
      },
      async takeControl() {
        return (await post("/control/take", {})) as ControlState;
      },
      async releaseControl() {
        return (await post("/control/release", {})) as ControlState;
      },
      async requestSecret(input: { label: string; ref: string; snapshotId: number }) {
        return (await post("/control/secret", input)) as ControlState;
      },
      async humanSecret(text: string) {
        return post("/human/secret", { text });
      },
      async humanClick(input: { x: number; y: number }) {
        return post("/human/click", input);
      },
      async humanType(input: { text: string }) {
        return post("/human/type", input);
      },
      async humanKey(input: { key: string }) {
        return post("/human/key", input);
      },
      async humanScroll(input: { x?: number; y?: number; deltaY?: number }) {
        return post("/human/scroll", input);
      },
    };
  }

  return {
    ...bind(),
    forBot(botId: string) {
      return bind(botId);
    },
  };
}

export type LiveOpenBotComputerOptions = {
  /** When false, only a cached or stored address is used. Default true so tools start the container. */
  ensure?: boolean;
  fallbackUrl?: string | null;
};

export async function liveOpenBotComputer(botId?: string, opts?: LiveOpenBotComputerOptions) {
  const token = openBotComputerToken();
  const allowPrivateHosts = env("AGENT_COMPUTER_ALLOW_PRIVATE_HOSTS") === "true";
  const ensure = opts?.ensure !== false;

  const bind = (url: string) => {
    const client = createOpenBotComputerClient({
      baseUrl: url,
      token,
      allowPrivateHosts,
    });
    return botId ? client.forBot(botId) : client;
  };

  if (botId && hasOpenBotSupervisor() && token) {
    try {
      const location = ensure ? await locateOpenBotComputer(botId) : peekOpenBotComputer(botId);
      if (location?.url) return bind(location.url);
    } catch {
      // Fall through to a stored or shared computer if one is configured.
    }
  }

  const fallback = opts?.fallbackUrl?.replace(/\/$/, "");
  if (fallback && token) return bind(fallback);

  const config = openBotComputerConfig();
  if (!config) return null;
  return bind(config.baseUrl);
}

export async function syncLiveComputerControl(botId: string, control: "take" | "release") {
  const computer = await liveOpenBotComputer(botId);
  if (!computer) return;
  if (control === "take") await computer.takeControl();
  else await computer.releaseControl();
}
