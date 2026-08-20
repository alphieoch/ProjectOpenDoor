/**
 * Vendored from CopilotKit/openbot `supervisor/src/docker.ts` (MIT).
 * Four verbs only: ensure, stop, reset, list. No Docker passthrough.
 */

import Docker from "dockerode";
import {
  BOT_LABEL,
  type ComputerNames,
  DEFAULT_NAMESPACE,
  NAMESPACE,
  NAMESPACE_LABEL,
  OWNER_LABEL,
} from "./names";

const docker = new Docker(
  process.env.DOCKER_SOCKET ? { socketPath: process.env.DOCKER_SOCKET } : undefined,
);

const COMPUTER_PORT = "4100/tcp";
const ATTEMPTS = 2;

function statusOf(error: unknown): number | undefined {
  return (error as { statusCode?: number }).statusCode;
}

export type ComputerState = {
  botId: string;
  container: string;
  status: string;
  startedAt?: string;
  port?: number;
  url?: string;
};

export class DockerUnavailableError extends Error {
  constructor(cause: string) {
    super(`The supervisor could not reach Docker (${cause}). A computer cannot be started without it.`);
    this.name = "DockerUnavailableError";
  }
}

export async function reachable(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

function portOf(ports?: Docker.Port[]): number | undefined {
  const published = ports?.find((p) => p.PrivatePort === 4100)?.PublicPort;
  return published ?? undefined;
}

function ours(labels: Record<string, string> | undefined): boolean {
  if (labels?.[OWNER_LABEL] !== "true") return false;
  return (labels[NAMESPACE_LABEL] ?? DEFAULT_NAMESPACE) === NAMESPACE;
}

function labelsFor(names: ComputerNames): Record<string, string> {
  return {
    [OWNER_LABEL]: "true",
    [BOT_LABEL]: names.botId,
    [NAMESPACE_LABEL]: NAMESPACE,
  };
}

export async function listOwned(): Promise<ComputerState[]> {
  try {
    const containers = (
      await docker.listContainers({
        all: true,
        filters: { label: [`${OWNER_LABEL}=true`] },
      })
    ).filter((container) => ours(container.Labels));
    return containers.map((container) => ({
      botId: container.Labels?.[BOT_LABEL] ?? "unknown",
      container: (container.Names?.[0] ?? "").replace(/^\//, ""),
      status: container.State,
      ...(container.Created ? { startedAt: new Date(container.Created * 1000).toISOString() } : {}),
      ...(portOf(container.Ports) ? { port: portOf(container.Ports) } : {}),
    }));
  } catch (error) {
    throw new DockerUnavailableError(String(error));
  }
}

async function inspectOwned(names: ComputerNames): Promise<{ status: string; port?: number } | null> {
  try {
    const info = await docker.getContainer(names.container).inspect();
    if (!ours(info.Config?.Labels)) return null;
    const published = info.NetworkSettings?.Ports?.[COMPUTER_PORT]?.[0]?.HostPort;
    return {
      status: info.State?.Status ?? "unknown",
      ...(published ? { port: Number.parseInt(published, 10) } : {}),
    };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return null;
    throw new DockerUnavailableError(String(error));
  }
}

async function waitUntilAnswering(container: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const info = await docker.getContainer(container).inspect();
      const health = info.State?.Health?.Status;
      if (!health) {
        if (info.State?.Running) return;
      } else if (health === "healthy") {
        return;
      }
    } catch {
      // Mid-creation, or gone. The deadline ends this.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export type EnsureOptions = {
  image: string;
  environment: string[];
  network?: string;
  runtime?: string;
  memoryBytes?: number;
  pidsLimit?: number;
  spireSocketVolume?: string;
};

function hostConfig(names: ComputerNames, options: EnsureOptions) {
  return {
    Binds: [
      `${names.profileVolume}:/profiles`,
      `${names.workspaceVolume}:/workspace`,
      ...(options.spireSocketVolume ? [`${options.spireSocketVolume}:/tmp/spire-agent/public:ro`] : []),
    ],
    ...(options.network
      ? {}
      : {
          PortBindings: {
            [COMPUTER_PORT]: [{ HostIp: "127.0.0.1", HostPort: "" }],
          },
        }),
    RestartPolicy: { Name: "unless-stopped" },
    ...(options.network ? { NetworkMode: options.network } : {}),
    ...(options.runtime ? { Runtime: options.runtime } : {}),
    SecurityOpt: ["no-new-privileges:true"],
    CapDrop: ["ALL"],
    ...(options.memoryBytes ? { Memory: options.memoryBytes } : {}),
    PidsLimit: options.pidsLimit ?? 512,
    ShmSize: 1_073_741_824,
  };
}

export async function ensure(names: ComputerNames, options: EnsureOptions): Promise<ComputerState> {
  for (let attempt = ATTEMPTS; attempt > 0; attempt--) {
    const existing = await inspectOwned(names);

    if (!existing) {
      for (const volume of [names.profileVolume, names.workspaceVolume]) {
        try {
          await docker.createVolume({
            Name: volume,
            Labels: labelsFor(names),
          });
        } catch (error) {
          if (statusOf(error) !== 409) {
            throw new DockerUnavailableError(String(error));
          }
        }
      }

      try {
        await docker.createContainer({
          name: names.container,
          Image: options.image,
          Labels: labelsFor(names),
          Env: options.environment,
          ExposedPorts: { [COMPUTER_PORT]: {} },
          HostConfig: hostConfig(names, options),
        });
      } catch (error) {
        if (statusOf(error) !== 409) {
          throw new DockerUnavailableError(String(error));
        }
      }
    }

    if (existing?.status !== "running") {
      try {
        await docker.getContainer(names.container).start();
      } catch (error) {
        const status = statusOf(error);
        if (status === 404 && attempt > 1) continue;
        if (status !== 304) {
          throw new DockerUnavailableError(String(error));
        }
      }
    }

    const settled = await inspectOwned(names);
    await waitUntilAnswering(names.container);

    return {
      botId: names.botId,
      container: names.container,
      status: settled?.status ?? "unknown",
      ...(settled?.port ? { port: settled.port } : {}),
      ...(options.network
        ? { url: `http://${names.container}:4100` }
        : settled?.port
          ? { url: `http://127.0.0.1:${settled.port}` }
          : {}),
    };
  }

  throw new DockerUnavailableError(`The computer for ${names.botId} was removed while it was being started.`);
}

export async function stop(names: ComputerNames): Promise<boolean> {
  if (!(await inspectOwned(names))) return false;
  try {
    await docker.getContainer(names.container).stop({ t: 30 });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status !== 304 && status !== 404) {
      throw new DockerUnavailableError(String(error));
    }
  }
  return true;
}

export async function reset(names: ComputerNames): Promise<boolean> {
  if (!(await inspectOwned(names))) return false;

  try {
    await docker.getContainer(names.container).remove({ force: true, v: false });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 404) {
      throw new DockerUnavailableError(String(error));
    }
  }

  try {
    await docker.getVolume(names.profileVolume).remove();
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status !== 404 && status !== 409) {
      throw new DockerUnavailableError(String(error));
    }
  }
  return true;
}
