import {
  applyNavigate,
  applyRequestHelp,
  applyWriteFile,
  decideThen,
  fetchComputerPage,
  formatPageSnapshot,
  readWorkspaceFile,
  resolveFollowLink,
} from "./agent-computer.js";
import type { AgentWorkspace } from "./agent-workspace.js";
import { liveOpenBotComputer } from "./openbot-computer-client.js";
import { looksLikeLoginWall, toRelWorkspacePath } from "./openbot.js";

export type OpenBotToolContext = {
  botId?: string;
};

type ToolEvent = { name: string; ok: boolean; detail: string };

function num(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(args: Record<string, unknown>, key: string) {
  return typeof args[key] === "string" ? String(args[key]).trim() : "";
}

function formatElements(elements: Array<{ ref: string; role: string; name: string; value?: string }>) {
  if (!elements.length) return "(no interactive elements)";
  return elements
    .slice(0, 40)
    .map((el) => `- ${el.ref} ${el.role} “${el.name}”${el.value ? ` = ${el.value}` : ""}`)
    .join("\n");
}

function markLive(ws: AgentWorkspace): AgentWorkspace {
  return { ...ws, computer: { ...ws.computer, backend: "live" } };
}

export async function runOpenBotComputerTool(
  name: string,
  args: Record<string, unknown>,
  workspace: AgentWorkspace,
  ctx?: OpenBotToolContext,
): Promise<{ result: string; workspace: AgentWorkspace; event: ToolEvent }> {
  const canonical =
    name === "computer_read_page"
      ? "computer_read"
      : name === "request_help"
        ? "computer_request_help"
        : name;
  const live = await liveOpenBotComputer(ctx?.botId);
  const url = str(args, "url");
  const path = str(args, "path");
  const intent = str(args, "intent") || str(args, "reason") || str(args, "query") || str(args, "title");

  const gated = await decideThen(workspace, canonical === "computer_read" ? name : canonical, { url, path, intent }, async () => {
    if (live) return runLive(canonical, args, workspace, live);
    return runFallback(canonical, args, workspace);
  });

  if (gated.allowed === false) {
    return { result: gated.result, workspace: gated.workspace, event: { name, ok: false, detail: "refused" } };
  }
  return {
    ...gated.value,
    workspace: { ...gated.value.workspace, audit: gated.workspace.audit },
  };
}

async function runLive(
  name: string,
  args: Record<string, unknown>,
  workspace: AgentWorkspace,
  live: NonNullable<Awaited<ReturnType<typeof liveOpenBotComputer>>>,
): Promise<{ result: string; workspace: AgentWorkspace; event: ToolEvent }> {
  let ws = markLive(workspace);

  if (name === "computer_navigate") {
    const page = await live.navigate(str(args, "url"));
    const parsed = new URL(page.url);
    ws = {
      ...ws,
      computer: applyNavigate(ws.computer, {
        url: page.url,
        host: parsed.host,
        status: 200,
        title: page.title,
        excerpt: page.text,
        links: [],
        loginWall: looksLikeLoginWall(`${page.title} ${page.text}`),
      }),
    };
    ws = markLive(ws);
    const hint = looksLikeLoginWall(`${page.title} ${page.text}`)
      ? "\nLOGIN_WALL: call computer_request_help if you cannot continue."
      : "";
    return {
      result: `Opened ${page.url}.\n${page.title}\n${page.text}${page.truncated ? "\n[truncated]" : ""}${hint}`,
      workspace: ws,
      event: { name, ok: true, detail: parsed.host },
    };
  }

  if (name === "computer_follow_link") {
    const snap = await live.snapshot();
    const query = str(args, "query").toLowerCase();
    const hit = snap.elements.find(
      (el) =>
        el.name.toLowerCase().includes(query) ||
        el.ref.toLowerCase() === query ||
        `${el.role} ${el.name}`.toLowerCase().includes(query),
    );
    if (!hit) throw new Error("No matching control on the current page. Take a snapshot first.");
    const acted = await live.click({ ref: hit.ref, snapshotId: snap.snapshotId });
    ws = markLive({
      ...ws,
      computer: { ...ws.computer, url: acted.url, snapshotId: snap.snapshotId, elements: snap.elements },
    });
    return {
      result: `Clicked ${hit.ref} “${hit.name}”. Now at ${acted.url}. Call computer_read.`,
      workspace: ws,
      event: { name, ok: true, detail: hit.ref },
    };
  }

  if (name === "computer_read") {
    const page = await live.read();
    ws = markLive({
      ...ws,
      computer: {
        ...ws.computer,
        url: page.url,
        title: page.title,
        excerpt: page.text,
      },
    });
    return {
      result: `${page.title} (${page.url})\n${page.text}${page.truncated ? "\n[truncated]" : ""}`,
      workspace: ws,
      event: { name, ok: true, detail: page.url || "empty" },
    };
  }

  if (name === "computer_screenshot") {
    const shot = await live.screenshot();
    const pointer = shot.pointer
      ? ` Cursor at ${shot.pointer.x},${shot.pointer.y} (${shot.pointer.action}).`
      : "";
    return {
      result: `Screenshot ${shot.width}×${shot.height} CSS pixels of ${shot.url || "the current page"} at ${shot.capturedAt}.${pointer} Those width×height pixels are the coordinate space for computer_click x,y and computer_move. The person watching sees this frame and the live cursor.`,
      workspace: ws,
      event: { name, ok: true, detail: `${shot.width}x${shot.height}` },
    };
  }

  if (name === "computer_snapshot") {
    const snap = await live.snapshot();
    ws = markLive({
      ...ws,
      computer: {
        ...ws.computer,
        url: snap.url,
        title: snap.title,
        snapshotId: snap.snapshotId,
        elements: snap.elements,
      },
    });
    return {
      result: `snapshotId=${snap.snapshotId} ${snap.title} (${snap.url})\n${formatElements(snap.elements)}${snap.truncated ? "\n[truncated]" : ""}`,
      workspace: ws,
      event: { name, ok: true, detail: `snapshot ${snap.snapshotId}` },
    };
  }

  if (name === "computer_move") {
    const x = num(args, "x");
    const y = num(args, "y");
    if (x == null || y == null) throw new Error("computer_move needs x and y in screenshot CSS pixels.");
    const acted = await live.move({ x, y });
    return {
      result: `Moved the cursor to ${x},${y} on ${acted.url}. The person can see the pointer on the live screen.`,
      workspace: ws,
      event: { name, ok: true, detail: `${x},${y}` },
    };
  }

  if (name === "computer_wait") {
    const ms = num(args, "ms") ?? 800;
    const acted = await live.wait({ ms });
    const page = await live.read().catch(() => null);
    ws = markLive({
      ...ws,
      computer: { ...ws.computer, url: acted.url, title: page?.title ?? ws.computer.title },
    });
    return {
      result: `Waited ${ms}ms. Now at ${acted.url}${page?.title ? ` — ${page.title}` : ""}. Call computer_screenshot if you need to click next.`,
      workspace: ws,
      event: { name, ok: true, detail: `${ms}ms` },
    };
  }

  if (name === "computer_click" || name === "computer_type" || name === "computer_key" || name === "computer_scroll") {
    const snapshotId = num(args, "snapshotId") ?? ws.computer.snapshotId ?? undefined;
    const ref = str(args, "ref");
    const text = str(args, "text");
    const selector = str(args, "selector");
    const x = num(args, "x");
    const y = num(args, "y");
    if (name === "computer_click") {
      const hasTarget = Boolean(ref) || Boolean(text) || Boolean(selector) || (x != null && y != null);
      if (!hasTarget) {
        throw new Error("computer_click needs text (preferred for buttons), a CSS selector, a snapshot ref, or x,y in screenshot CSS pixels.");
      }
      if (ref && snapshotId == null) {
        throw new Error("A snapshot ref also needs snapshotId from the last computer_snapshot.");
      }
    }
    if (name === "computer_type" && !text && !str(args, "text")) {
      throw new Error("computer_type needs the text to enter.");
    }
    const acted =
      name === "computer_click"
        ? await live.click({
            ...(ref ? { ref, snapshotId: snapshotId! } : {}),
            ...(text ? { text } : {}),
            ...(selector ? { selector } : {}),
            ...(x != null && y != null ? { x, y } : {}),
          })
        : name === "computer_type"
          ? await live.type({
              ...(ref && snapshotId != null ? { ref, snapshotId } : {}),
              text: str(args, "text"),
              submit: args.submit === true,
            })
          : name === "computer_key"
            ? await live.key({ key: str(args, "key"), ...(ref ? { ref, snapshotId: snapshotId! } : {}) })
            : await live.scroll({ deltaY: num(args, "deltaY") });
    try {
      await live.wait({ ms: 400 });
    } catch {
      /* still report the click */
    }
    const shot = await live.screenshot().catch(() => null);
    ws = markLive({ ...ws, computer: { ...ws.computer, url: acted.url } });
    const pointer = shot?.pointer ? ` Cursor at ${shot.pointer.x},${shot.pointer.y}.` : "";
    const frame = shot ? ` Screenshot now ${shot.width}×${shot.height} CSS pixels.` : "";
    return {
      result: `${acted.action} on ${acted.element?.name || acted.ref || text || "page"} → ${acted.url}.${pointer}${frame} Call computer_screenshot or computer_read if you need another look.`,
      workspace: ws,
      event: { name, ok: true, detail: acted.action },
    };
  }

  if (name === "computer_list_files") {
    const listed = await live.listFiles(toRelWorkspacePath(str(args, "path")) || undefined);
    const files = listed.entries
      .filter((e) => e.kind === "file")
      .map((e) => ({
        path: `/workspace/${e.path}`,
        content: "",
        updatedAt: new Date().toISOString(),
      }));
    ws = markLive({ ...ws, computer: { ...ws.computer, files } });
    return {
      result: listed.entries.length
        ? listed.entries.map((e) => `${e.kind === "folder" ? "dir" : "file"} ${e.path}${e.bytes != null ? ` (${e.bytes} bytes)` : ""}`).join("\n")
        : "No files in /workspace.",
      workspace: ws,
      event: { name, ok: true, detail: `${listed.entries.length} entries` },
    };
  }

  if (name === "computer_read_file") {
    const rel = toRelWorkspacePath(str(args, "path"));
    if (!rel) throw new Error("Invalid workspace path.");
    const file = await live.readFile(rel);
    return {
      result: `${file.path}\n${file.text}${file.truncated ? "\n[truncated]" : ""}`,
      workspace: ws,
      event: { name, ok: true, detail: file.path },
    };
  }

  if (name === "computer_write_file") {
    const rel = toRelWorkspacePath(str(args, "path"));
    if (!rel) throw new Error("Invalid workspace path.");
    const written = await live.writeFile(rel, str(args, "content") || str(args, "contents"), args.append === true);
    ws = { ...ws, computer: applyWriteFile(ws.computer, rel, str(args, "content") || str(args, "contents")) };
    ws = markLive(ws);
    return {
      result: `${written.appended ? "Appended" : "Wrote"} ${written.path} (${written.bytes} bytes).`,
      workspace: ws,
      event: { name, ok: true, detail: written.path },
    };
  }

  if (name === "computer_request_help") {
    const reason = str(args, "reason") || "The bot asked a person to take the wheel.";
    await live.requestControl(reason);
    ws = { ...ws, computer: applyRequestHelp(ws.computer, reason) };
    ws = markLive(ws);
    return {
      result: "Help requested. A person can take the wheel from the computer panel.",
      workspace: ws,
      event: { name, ok: true, detail: "help" },
    };
  }

  if (name === "computer_request_secret") {
    const snapshotId = num(args, "snapshotId") ?? ws.computer.snapshotId;
    const ref = str(args, "ref");
    const label = str(args, "label");
    if (!ref || snapshotId == null || !label) throw new Error("label, ref, and snapshotId are required.");
    await live.requestSecret({ label, ref, snapshotId });
    return {
      result: `Secret requested for ${label} into ${ref}. The value goes to the page; you will never see it.`,
      workspace: ws,
      event: { name, ok: true, detail: "secret" },
    };
  }

  throw new Error(`Unknown OpenBot computer tool: ${name}`);
}

async function runFallback(
  name: string,
  args: Record<string, unknown>,
  workspace: AgentWorkspace,
): Promise<{ result: string; workspace: AgentWorkspace; event: ToolEvent }> {
  let ws = workspace;

  if (name === "computer_navigate") {
    const page = await fetchComputerPage(str(args, "url"));
    ws = { ...ws, computer: applyNavigate(ws.computer, page) };
    const hint = page.loginWall ? "\nLOGIN_WALL: call computer_request_help if you cannot continue." : "";
    return {
      result: `Opened ${page.url} (HTTP ${page.status}).\n${formatPageSnapshot(ws.computer)}${hint}`,
      workspace: ws,
      event: { name, ok: true, detail: page.host },
    };
  }

  if (name === "computer_follow_link") {
    const href = resolveFollowLink(ws.computer, str(args, "query"));
    if (!href) throw new Error("No matching link on the current page. Navigate first.");
    const page = await fetchComputerPage(href);
    ws = { ...ws, computer: applyNavigate(ws.computer, page) };
    return {
      result: `Followed ${href}.\n${formatPageSnapshot(ws.computer)}`,
      workspace: ws,
      event: { name, ok: true, detail: page.host },
    };
  }

  if (name === "computer_read" || name === "computer_read_page") {
    return {
      result: formatPageSnapshot(ws.computer),
      workspace: ws,
      event: { name, ok: true, detail: ws.computer.url || "empty" },
    };
  }

  if (name === "computer_snapshot") {
    const elements = ws.computer.links.map((link, i) => ({
      ref: `e${i + 1}`,
      role: "link",
      name: link.text || link.href,
    }));
    const snapshotId = (ws.computer.snapshotId || 0) + 1;
    ws = {
      ...ws,
      computer: { ...ws.computer, snapshotId, elements },
    };
    return {
      result: `snapshotId=${snapshotId} ${ws.computer.title || "(no page)"} (${ws.computer.url || "none"})\n${formatElements(elements)}\nLive Chromium is not attached; click/type need OPENBOT_COMPUTER_URL.`,
      workspace: ws,
      event: { name, ok: true, detail: `snapshot ${snapshotId}` },
    };
  }

  if (
    name === "computer_screenshot" ||
    name === "computer_click" ||
    name === "computer_move" ||
    name === "computer_type" ||
    name === "computer_key" ||
    name === "computer_scroll" ||
    name === "computer_wait" ||
    name === "computer_request_secret"
  ) {
    throw new Error("That action needs the live OpenBot computer. Start apps/openbot-computer and set OPENBOT_COMPUTER_URL and OPENBOT_COMPUTER_TOKEN.");
  }

  if (name === "computer_list_files") {
    const files = ws.computer.files;
    return {
      result: files.length ? files.map((f) => `${f.path} (${f.content.length} bytes)`).join("\n") : "No files in /workspace.",
      workspace: ws,
      event: { name, ok: true, detail: `${files.length} files` },
    };
  }

  if (name === "computer_read_file") {
    const file = readWorkspaceFile(ws.computer, str(args, "path"));
    return { result: `${file.path}\n${file.content}`, workspace: ws, event: { name, ok: true, detail: file.path } };
  }

  if (name === "computer_write_file") {
    ws = { ...ws, computer: applyWriteFile(ws.computer, str(args, "path"), str(args, "content") || str(args, "contents")) };
    const writtenPath = toRelWorkspacePath(str(args, "path")) || str(args, "path");
    return { result: `Wrote /workspace/${writtenPath.replace(/^\/workspace\//, "")}.`, workspace: ws, event: { name, ok: true, detail: str(args, "path") } };
  }

  if (name === "computer_request_help") {
    ws = { ...ws, computer: applyRequestHelp(ws.computer, str(args, "reason")) };
    return {
      result: "Help requested. A person can take the wheel from the computer panel.",
      workspace: ws,
      event: { name, ok: true, detail: "help" },
    };
  }

  throw new Error(`Unknown OpenBot computer tool: ${name}`);
}
