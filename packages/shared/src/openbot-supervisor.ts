/**
 * Where an OpenBot computer lives, asked of the supervisor.
 * Contract matches CopilotKit/openbot `server/src/computer/supervisor.ts` (MIT).
 *
 * Without a supervisor, OPENBOT_COMPUTER_URL is one shared computer.
 * With a supervisor, each Bot gets its own container.
 */

import type { AgentComputer, ComputerIsolation } from "./openbot.js";
import type { AgentWorkspace } from "./agent-workspace.js";

export type ComputerLocation = {
  botId: string;
  container: string;
  status: string;
  port?: number;
  url?: string;
  startedAt?: string;
};

export type SupervisorOptions = {
  baseUrl: string;
  token?: string;
  hostForPort?: (port: number) => string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export const LOCAL_OPENBOT_SUPERVISOR_URL = "http://127.0.0.1:4300";
export const LOCAL_OPENBOT_SUPERVISOR_TOKEN = "opendoor-openbot-supervisor-dev";
export const LOCAL_OPENBOT_COMPUTER_TOKEN = "opendoor-openbot-dev";

const ISOLATION_STATUS_RE = / · (isolated Chromium|shared Chromium|in-process computer)$/;

function env(name: string) {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return processEnv?.[name] || "";
}

export function useLocalOpenBotDefaults() {
  if (env("OPENBOT_COMPUTER_MODE") === "in-process") return false;
  return env("NODE_ENV") === "development";
}

export function openBotComputerToken() {
  return env("OPENBOT_COMPUTER_TOKEN") || env("COMPUTER_TOKEN") || (useLocalOpenBotDefaults() ? LOCAL_OPENBOT_COMPUTER_TOKEN : "");
}

export function openBotSupervisorConfig(): SupervisorOptions | null {
  const baseUrl = (
    env("OPENBOT_SUPERVISOR_URL") ||
    env("COMPUTER_SUPERVISOR_URL") ||
    (useLocalOpenBotDefaults() ? LOCAL_OPENBOT_SUPERVISOR_URL : "")
  ).replace(/\/$/, "");
  const token =
    env("OPENBOT_SUPERVISOR_TOKEN") ||
    env("SUPERVISOR_TOKEN") ||
    (useLocalOpenBotDefaults() ? LOCAL_OPENBOT_SUPERVISOR_TOKEN : "");
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

export function hasOpenBotSupervisor() {
  return openBotSupervisorConfig() != null;
}

export class SupervisorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupervisorError";
  }
}

export function createSupervisorClient(options: SupervisorOptions) {
  const doFetch = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 120_000;
  const hostForPort = options.hostForPort ?? ((port: number) => `http://127.0.0.1:${port}`);

  async function call(path: string, method = "POST"): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new SupervisorError(
        `The container supervisor at ${base} could not be reached (${error instanceof Error ? error.message : String(error)}).`,
      );
    }

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new SupervisorError(body?.error ?? `The supervisor answered ${response.status}.`);
    }
    return (body ?? {}) as Record<string, unknown>;
  }

  return {
    async locate(botId: string): Promise<string> {
      const state = (await call(`/computers/${encodeURIComponent(botId)}/ensure`)) as ComputerLocation;
      if (state?.url) return state.url;
      if (state?.port) return hostForPort(state.port);
      throw new SupervisorError(
        `The computer for ${botId} started but reported no address, so it cannot be reached.`,
      );
    },

    async ensure(botId: string): Promise<ComputerLocation> {
      return (await call(`/computers/${encodeURIComponent(botId)}/ensure`)) as ComputerLocation;
    },

    async stop(botId: string): Promise<void> {
      await call(`/computers/${encodeURIComponent(botId)}/stop`);
    },

    async reset(botId: string): Promise<void> {
      await call(`/computers/${encodeURIComponent(botId)}/reset`);
    },

    async list(): Promise<ComputerLocation[]> {
      const body = (await call("/computers", "GET")) as { computers?: ComputerLocation[] };
      return body?.computers ?? [];
    },
  };
}

export type SupervisorClient = ReturnType<typeof createSupervisorClient>;

const locatedCache = new Map<string, { url: string; at: number; container?: string }>();
const locating = new Map<string, Promise<ComputerLocation>>();
const LOCATE_TTL_MS = 60_000;

export function forgetOpenBotComputer(botId: string) {
  locatedCache.delete(botId);
}

export function peekOpenBotComputer(botId: string): ComputerLocation | null {
  const hit = locatedCache.get(botId);
  if (!hit || Date.now() - hit.at >= LOCATE_TTL_MS) return null;
  return { botId, container: hit.container ?? "", status: "running", url: hit.url };
}

export async function locateOpenBotComputer(botId: string): Promise<ComputerLocation | null> {
  const config = openBotSupervisorConfig();
  if (!config) return null;
  const cached = peekOpenBotComputer(botId);
  if (cached) return cached;
  const pending = locating.get(botId);
  if (pending) return pending;

  const work = (async () => {
    const client = createSupervisorClient(config);
    const state = await client.ensure(botId);
    const url = state.url || (state.port ? `http://127.0.0.1:${state.port}` : undefined);
    if (!url) {
      throw new SupervisorError(
        `The computer for ${botId} started but reported no address, so it cannot be reached.`,
      );
    }
    locatedCache.set(botId, { url, at: Date.now(), container: state.container });
    return { ...state, url };
  })().finally(() => {
    locating.delete(botId);
  });

  locating.set(botId, work);
  return work;
}

function computerRuntime() {
  return env("OPENBOT_COMPUTER_RUNTIME") || env("COMPUTER_RUNTIME") || null;
}

export function liveComputerSetupHint() {
  if (hasOpenBotSupervisor()) {
    return "Start the isolated Chromium computer with docker compose up -d openbot-supervisor.";
  }
  return "Set OPENBOT_SUPERVISOR_URL and OPENBOT_SUPERVISOR_TOKEN, then run docker compose up -d openbot-supervisor.";
}

export async function attachOpenBotIsolation(botId: string): Promise<ComputerIsolation> {
  const runtime = computerRuntime();
  if (openBotSupervisorConfig()) {
    // Warm the container without blocking boot. The desk attach / first computer tool waits on locate().
    void locateOpenBotComputer(botId).catch(() => {});
    return { mode: "container", url: null, container: null, runtime };
  }
  const shared = env("OPENBOT_COMPUTER_URL") || env("AGENT_COMPUTER_URL");
  if (shared) return { mode: "shared", url: shared.replace(/\/$/, ""), container: null, runtime: null };
  return { mode: "in-process", url: null, container: null, runtime: null };
}

export async function ensureOpenBotIsolation(botId: string): Promise<ComputerIsolation> {
  const runtime = computerRuntime();
  if (openBotSupervisorConfig()) {
    const location = await locateOpenBotComputer(botId);
    if (!location?.url) {
      throw new SupervisorError(
        `The computer for ${botId} started but reported no address, so it cannot be reached.`,
      );
    }
    return { mode: "container", url: location.url, container: location.container || null, runtime };
  }
  const shared = env("OPENBOT_COMPUTER_URL") || env("AGENT_COMPUTER_URL");
  if (shared) return { mode: "shared", url: shared.replace(/\/$/, ""), container: null, runtime: null };
  throw new SupervisorError(liveComputerSetupHint());
}

export async function detachOpenBotIsolation(botId: string) {
  forgetOpenBotComputer(botId);
  const config = openBotSupervisorConfig();
  if (!config) return;
  try {
    await createSupervisorClient(config).stop(botId);
  } catch {
    // Stopping the agent must still succeed if Docker is down.
  }
}

export function applyIsolation(computer: AgentComputer, isolation: ComputerIsolation): AgentComputer {
  return {
    ...computer,
    isolation,
    backend: isolation.mode === "in-process" ? "fetch" : "live",
  };
}

export async function attachOpenBotComputer(workspace: AgentWorkspace, botId: string): Promise<AgentWorkspace> {
  const isolation = await attachOpenBotIsolation(botId);
  return {
    ...workspace,
    computer: applyIsolation(workspace.computer, isolation),
  };
}

export function isolationStatusSuffix(isolation?: ComputerIsolation | null) {
  if (!isolation) return "";
  if (isolation.mode === "container") return " · isolated Chromium";
  if (isolation.mode === "shared") return " · shared Chromium";
  return " · in-process computer";
}

export function withIsolationStatus(message: string | null | undefined, isolation: ComputerIsolation) {
  const base = (message || "").replace(ISOLATION_STATUS_RE, "");
  return `${base}${isolationStatusSuffix(isolation)}`;
}
