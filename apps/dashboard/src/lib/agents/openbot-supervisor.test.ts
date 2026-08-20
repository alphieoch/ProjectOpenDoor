import { afterEach, describe, expect, test } from "bun:test";
import {
  attachOpenBotIsolation,
  createSupervisorClient,
  ensureOpenBotIsolation,
  forgetOpenBotComputer,
  isolationStatusSuffix,
  locateOpenBotComputer,
  withIsolationStatus,
} from "@opendoor/shared";

const saved = {
  supervisorUrl: process.env.OPENBOT_SUPERVISOR_URL,
  supervisorToken: process.env.OPENBOT_SUPERVISOR_TOKEN,
  computerUrl: process.env.OPENBOT_COMPUTER_URL,
  agentUrl: process.env.AGENT_COMPUTER_URL,
  computerMode: process.env.OPENBOT_COMPUTER_MODE,
  computerSupervisorUrl: process.env.COMPUTER_SUPERVISOR_URL,
  supervisorAlias: process.env.SUPERVISOR_TOKEN,
};

afterEach(() => {
  restore("OPENBOT_SUPERVISOR_URL", saved.supervisorUrl);
  restore("OPENBOT_SUPERVISOR_TOKEN", saved.supervisorToken);
  restore("OPENBOT_COMPUTER_URL", saved.computerUrl);
  restore("AGENT_COMPUTER_URL", saved.agentUrl);
  restore("OPENBOT_COMPUTER_MODE", saved.computerMode);
  restore("COMPUTER_SUPERVISOR_URL", saved.computerSupervisorUrl);
  restore("SUPERVISOR_TOKEN", saved.supervisorAlias);
  forgetOpenBotComputer("bot-1");
  forgetOpenBotComputer("bot-2");
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function clearSupervisorEnv() {
  delete process.env.OPENBOT_SUPERVISOR_URL;
  delete process.env.OPENBOT_SUPERVISOR_TOKEN;
  delete process.env.COMPUTER_SUPERVISOR_URL;
  delete process.env.SUPERVISOR_TOKEN;
  delete process.env.OPENBOT_COMPUTER_URL;
  delete process.env.AGENT_COMPUTER_URL;
  process.env.OPENBOT_COMPUTER_MODE = "in-process";
}

describe("OpenBot supervisor client", () => {
  test("locate uses the supervisor URL, token, and reported address", async () => {
    const calls: Array<{ url: string; auth?: string | null }> = [];
    const client = createSupervisorClient({
      baseUrl: "http://supervisor.test",
      token: "secret",
      fetchImpl: async (input, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        calls.push({ url: String(input), auth: headers?.authorization ?? null });
        return new Response(
          JSON.stringify({
            botId: "bot-1",
            container: "opendoor-computer-bot-1",
            status: "running",
            url: "http://127.0.0.1:49152",
          }),
          { status: 200 },
        );
      },
    });
    expect(await client.locate("bot-1")).toBe("http://127.0.0.1:49152");
    expect(calls[0]?.url).toBe("http://supervisor.test/computers/bot-1/ensure");
    expect(calls[0]?.auth).toBe("Bearer secret");
  });

  test("locate builds a loopback URL from a published port", async () => {
    const client = createSupervisorClient({
      baseUrl: "http://supervisor.test",
      token: "secret",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ botId: "bot-1", container: "c", status: "running", port: 4107 }),
          { status: 200 },
        ),
    });
    expect(await client.locate("bot-1")).toBe("http://127.0.0.1:4107");
  });

  test("attach falls back to in-process when nothing is configured", async () => {
    clearSupervisorEnv();
    const isolation = await attachOpenBotIsolation("bot-1");
    expect(isolation.mode).toBe("in-process");
    expect(isolationStatusSuffix(isolation)).toContain("in-process");
  });

  test("ensure starts a computer through the supervisor and returns its address", async () => {
    process.env.OPENBOT_SUPERVISOR_URL = "http://supervisor.test";
    process.env.OPENBOT_SUPERVISOR_TOKEN = "secret";
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls += 1;
      expect(String(input)).toBe("http://supervisor.test/computers/bot-1/ensure");
      return new Response(
        JSON.stringify({
          botId: "bot-1",
          container: "opendoor-computer-bot-1",
          status: "running",
          url: "http://127.0.0.1:49152",
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const isolation = await ensureOpenBotIsolation("bot-1");
      expect(isolation.mode).toBe("container");
      expect(isolation.url).toBe("http://127.0.0.1:49152");
      expect(isolation.container).toBe("opendoor-computer-bot-1");
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("locate coalesces concurrent ensure calls for the same bot", async () => {
    process.env.OPENBOT_SUPERVISOR_URL = "http://supervisor.test";
    process.env.OPENBOT_SUPERVISOR_TOKEN = "secret";
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return new Response(
        JSON.stringify({
          botId: "bot-2",
          container: "c",
          status: "running",
          port: 4107,
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const [first, second] = await Promise.all([
        locateOpenBotComputer("bot-2"),
        locateOpenBotComputer("bot-2"),
      ]);
      expect(calls).toBe(1);
      expect(first?.url).toBe("http://127.0.0.1:4107");
      expect(second?.url).toBe("http://127.0.0.1:4107");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("withIsolationStatus replaces an in-process suffix after attach", () => {
    expect(
      withIsolationStatus(
        "OpenBot is live on deepseek-v3 · gateway 269ms · 187 models · in-process computer",
        { mode: "container", url: "http://127.0.0.1:49152", container: "c", runtime: null },
      ),
    ).toBe("OpenBot is live on deepseek-v3 · gateway 269ms · 187 models · isolated Chromium");
  });
});
