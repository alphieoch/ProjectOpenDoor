import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { jsonSchema, tool } from "ai";
import type { Tool } from "ai";

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

/** Commands we allow users to run. Everything else is rejected. */
const ALLOWED_COMMANDS = new Set([
  "npx",
  "uvx",
  "docker",
  "node",
  "python",
  "python3",
  "bun",
  "npm",
  "pnpm",
  "yarn",
]);

/** Reject absolute paths and shell injection attempts. */
function validateCommand(command: string): void {
  const trimmed = command.trim();

  if (!trimmed) {
    throw new Error("Command is empty");
  }

  // Reject absolute paths to system directories
  if (
    trimmed.startsWith("/bin/") ||
    trimmed.startsWith("/usr/bin/") ||
    trimmed.startsWith("/sbin/") ||
    trimmed.startsWith("/usr/sbin/") ||
    trimmed.startsWith("/usr/local/bin/") ||
    trimmed.startsWith("/System/") ||
    trimmed.startsWith("C:\\Windows\\")
  ) {
    throw new Error(`Absolute system paths are not allowed: ${trimmed}`);
  }

  // Reject shell metacharacters
  const dangerous = /[;|&$()`<>\\]/;
  if (dangerous.test(trimmed)) {
    throw new Error(`Command contains forbidden characters: ${trimmed}`);
  }

  // Extract the base command (ignore relative paths like ./node_modules/.bin/npx)
  const base = trimmed.replace(/^\.\.?\//, "").split("/").pop() ?? trimmed;

  if (!ALLOWED_COMMANDS.has(base)) {
    throw new Error(
      `Command "${base}" is not in the allowlist. ` +
        `Allowed: ${Array.from(ALLOWED_COMMANDS).join(", ")}`
    );
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export interface McpToolResult {
  tools: Record<string, Tool<string, any, any>>;
  cleanup: () => Promise<void>;
}

/**
 * Spawn MCP servers over stdio, discover their tools, and wrap them for the
 * Vercel AI SDK.  Returns the tools + a cleanup function that MUST be called
 * to kill the spawned child processes.
 */
export async function buildMcpTools(
  configs: McpServerConfig[]
): Promise<McpToolResult> {
  const transports: StdioClientTransport[] = [];
  const clients: Client[] = [];
  const allTools: Record<string, Tool<string, any, any>> = {};

  for (const config of configs) {
    if (config.enabled === false) continue;
    if (!config.command) {
      console.warn(`MCP server "${config.name}" has no command, skipping`);
      continue;
    }

    try {
      // Security check
      validateCommand(config.command);
    } catch (err: any) {
      console.error(`MCP security rejection for "${config.name}":`, err.message);
      continue;
    }

    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: config.env,
        stderr: "pipe",
      });
      transports.push(transport);

      const client = new Client(
        { name: "opendoor-chat", version: "1.0.0" },
        { capabilities: {} }
      );
      clients.push(client);

      // Connect client (this internally starts the transport)
      await withTimeout(
        client.connect(transport),
        30_000,
        `MCP server "${config.name}" connect`
      );

      // List tools with timeout
      const toolList = await withTimeout(
        client.listTools(),
        10_000,
        `MCP server "${config.name}" listTools`
      );

      for (const t of toolList.tools) {
        const toolName = `${config.name}.${t.name}`;
        allTools[toolName] = tool({
          description:
            t.description ?? `${config.name} tool: ${t.name}`,
          parameters: jsonSchema(t.inputSchema as any),
          execute: async (args) => {
            const result = await withTimeout(
              client.callTool({
                name: t.name,
                arguments: args as Record<string, unknown>,
              }),
              60_000,
              `MCP tool "${toolName}" call`
            );
            // Extract text content from the tool result
            const textParts = (result.content ?? [])
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("\n");
            return textParts || JSON.stringify(result);
          },
        });
      }
    } catch (err: any) {
      console.error(
        `Failed to connect to MCP server "${config.name}" (${config.command}):`,
        err.message || err
      );
      // Continue with other servers — don't let one bad config crash the chat
    }
  }

  async function cleanup() {
    for (const client of clients) {
      try {
        await client.close();
      } catch {
        // ignore
      }
    }
    for (const transport of transports) {
      try {
        await transport.close();
      } catch {
        // ignore
      }
    }
  }

  return { tools: allTools, cleanup };
}
