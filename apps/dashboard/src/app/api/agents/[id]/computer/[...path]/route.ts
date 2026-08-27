import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ensureAgentSchema } from "@/lib/agents/ensure-schema";
import {
  ensureComputerForAgent,
  liveComputerForAgent,
  persistComputerHandover,
  workspaceControl,
} from "@/lib/agents/computer-proxy";
import { hasLiveOpenBotComputer, liveComputerSetupHint, publicComputerIsolation, readWorkspace, syncLiveComputerControl } from "@opendoor/shared";
import { publicErrorMessage } from "@/lib/client-error";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; path: string[] }> };

function joinPath(parts: string[]) {
  return `/${parts.filter(Boolean).join("/")}`;
}

async function owned(req: NextRequest, ctx: Ctx) {
  const session = await requireAuth();
  await ensureAgentSchema();
  const { id } = await ctx.params;
  const loaded = await liveComputerForAgent(session.orgId, id);
  if (!loaded.row) return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) };
  if (loaded.row.runtime !== "openbot") {
    return { error: NextResponse.json({ error: "This agent has no computer." }, { status: 409 }) };
  }
  return { session, req, loaded, path: joinPath((await ctx.params).path) };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const resolved = await owned(req, ctx);
  if ("error" in resolved) return resolved.error;
  const { loaded, path } = resolved;

  if (path === "/status") {
    const isolation = readWorkspace(loaded.row.config).computer.isolation;
    return NextResponse.json({
      attached: loaded.computer != null,
      isolation: publicComputerIsolation(isolation),
      canAttach: hasLiveOpenBotComputer(),
      hint: loaded.computer ? null : liveComputerSetupHint(),
    });
  }

  if (path === "/screenshot") {
    if (!loaded.computer) {
      return NextResponse.json(
        { error: "The live computer is not attached.", hint: liveComputerSetupHint() },
        { status: 503 },
      );
    }
    try {
      return NextResponse.json(await loaded.computer.screenshot());
    } catch (error) {
      return NextResponse.json(
        { error: publicErrorMessage(error, "The screen is not available right now.") },
        { status: 502 },
      );
    }
  }

  if (path === "/control") {
    if (loaded.computer) {
      try {
        return NextResponse.json(await loaded.computer.control());
      } catch {
        // Fall through to workspace state.
      }
    }
    return NextResponse.json(workspaceControl(loaded.row));
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const resolved = await owned(req, ctx);
  if ("error" in resolved) return resolved.error;
  const { loaded, path, session } = resolved;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (path === "/attach") {
    try {
      const ensured = await ensureComputerForAgent(session.orgId, loaded.row.id);
      if (!ensured.computer || !ensured.isolation) {
        return NextResponse.json({ error: liveComputerSetupHint() }, { status: 503 });
      }
      return NextResponse.json({
        attached: true,
        isolation: publicComputerIsolation(ensured.isolation),
        statusMessage: ensured.row?.statusMessage ?? null,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: publicErrorMessage(error, liveComputerSetupHint()),
          hint: liveComputerSetupHint(),
        },
        { status: 503 },
      );
    }
  }

  if (path === "/control/take" || path === "/control/release") {
    const control = path.endsWith("take") ? "take" : "release";
    try {
      await syncLiveComputerControl(loaded.row.id, control);
    } catch {
      // Workspace still records the handover.
    }
    if (loaded.computer) {
      try {
        const state = control === "take" ? await loaded.computer.takeControl() : await loaded.computer.releaseControl();
        await persistComputerHandover(loaded.row, control);
        return NextResponse.json(state);
      } catch (error) {
        await persistComputerHandover(loaded.row, control);
        return NextResponse.json(
          { error: publicErrorMessage(error, "Could not change control.") },
          { status: 502 },
        );
      }
    }
    const saved = await persistComputerHandover(loaded.row, control);
    return NextResponse.json(workspaceControl(saved));
  }

  if (!loaded.computer) {
    return NextResponse.json({ error: "The live computer is not attached." }, { status: 503 });
  }

  try {
    if (path === "/human/secret") {
      return NextResponse.json(await loaded.computer.humanSecret(String(body.text ?? "")));
    }
    if (path === "/human/click") {
      return NextResponse.json(
        await loaded.computer.humanClick({ x: Number(body.x), y: Number(body.y) }),
      );
    }
    if (path === "/human/type") {
      return NextResponse.json(await loaded.computer.humanType({ text: String(body.text ?? "") }));
    }
    if (path === "/human/key") {
      return NextResponse.json(await loaded.computer.humanKey({ key: String(body.key ?? "") }));
    }
    if (path === "/human/scroll") {
      return NextResponse.json(
        await loaded.computer.humanScroll({
          x: typeof body.x === "number" ? body.x : undefined,
          y: typeof body.y === "number" ? body.y : undefined,
          deltaY: typeof body.deltaY === "number" ? body.deltaY : undefined,
        }),
      );
    }
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return NextResponse.json(
      { error: publicErrorMessage(error, "That did not work.") },
      { status: Number.isFinite(status) && status >= 400 ? status : 502 },
    );
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
