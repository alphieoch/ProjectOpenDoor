"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LiveScreen } from "./live-screen";
import { ComputerPlaceholder } from "./placeholder";
import { type ControlState, readControl, releaseControl, supplySecret, takeControl } from "./take-the-wheel";

/**
 * Vendored from CopilotKit/openbot `app/src/components/computer/computer-view.tsx` (MIT).
 * Screenshot and control calls go through OpenDoor `/api/agents/:id/computer`.
 */

type Screenshot = {
  base64: string;
  width: number;
  height: number;
  capturedAt: string;
  url?: string;
};

function isBlankBrowser(shot: Screenshot): boolean {
  if (shot.url === undefined) return false;
  const url = shot.url.trim();
  return url === "" || url === "about:blank";
}

const DEFAULT_ASPECT_RATIO = 1280 / 800;
const DEFAULT_MIN_WIDTH = 320;
const DEFAULT_MIN_HEIGHT = 200;
const SETTLED_FRAMES = 3;
const SETTLE_TIMEOUT_MS = 30_000;
const SECRET_CONFIRM_MS = 6_000;

async function preloadFrame(base64: string): Promise<void> {
  try {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
  } catch {
    // Visible image handles decode failures.
  }
}

type Props = {
  computerId: string;
  agentName?: string;
  active?: boolean;
  intervalMs?: number;
  aspectRatio?: number;
  minWidth?: number;
  minHeight?: number;
  onReady?: () => void;
};

async function attachComputer(computerId: string) {
  const response = await fetch(`/api/agents/${encodeURIComponent(computerId)}/computer/attach`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "The live computer could not be started.");
  }
}

export function ComputerView({
  computerId,
  agentName = "The assistant",
  active = true,
  intervalMs = 1000,
  aspectRatio = DEFAULT_ASPECT_RATIO,
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  onReady,
}: Props) {
  const [shot, setShot] = useState<Screenshot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attached, setAttached] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [control, setControl] = useState<ControlState | null>(null);
  const [secret, setSecret] = useState("");
  const [secretProblem, setSecretProblem] = useState<string | null>(null);
  const [sendingSecret, setSendingSecret] = useState(false);
  const driving = control?.holder === "human";
  const drivingRef = useRef(false);
  drivingRef.current = driving;
  const secretPending = Boolean(control?.secretWanted);
  const secretPendingRef = useRef(false);
  secretPendingRef.current = secretPending;
  const generation = useRef(0);
  const watchUntil = useRef(0);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const handBack = async () => {
    const state = await releaseControl(computerId);
    if (state) setControl(state);
  };

  const startComputer = async () => {
    if (attaching) return false;
    setAttaching(true);
    setProblem("Starting the isolated Chromium computer…");
    try {
      await attachComputer(computerId);
      setAttached(true);
      setProblem(null);
      onReadyRef.current?.();
      return true;
    } catch (error) {
      setAttached(false);
      setProblem(error instanceof Error ? error.message : "The live computer could not be started.");
      return false;
    } finally {
      setAttaching(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setAttached(false);
    setShot(null);
    void (async () => {
      setAttaching(true);
      setProblem("Starting the isolated Chromium computer…");
      try {
        await attachComputer(computerId);
        if (cancelled) return;
        setAttached(true);
        setProblem(null);
        onReadyRef.current?.();
      } catch (error) {
        if (cancelled) return;
        setAttached(false);
        setProblem(error instanceof Error ? error.message : "The live computer could not be started.");
      } finally {
        if (!cancelled) setAttaching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [computerId]);

  useEffect(() => {
    if (!attached) return;
    const mine = ++generation.current;
    let timer: ReturnType<typeof setTimeout>;
    let unchanged = 0;
    let lastFrame = "";
    const graceStartedAt = Date.now();

    const shouldContinue = () => {
      if (active) return true;
      if (drivingRef.current) return true;
      if (secretPendingRef.current) return true;
      if (Date.now() < watchUntil.current) return true;
      if (Date.now() - graceStartedAt > SETTLE_TIMEOUT_MS) return false;
      return unchanged < SETTLED_FRAMES;
    };

    const tick = async () => {
      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(computerId)}/computer/screenshot`, {
          credentials: "include",
        });
        if (generation.current !== mine) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setProblem(body?.error ?? "The screen is not available right now.");
        } else {
          const next = (await response.json()) as Screenshot;
          unchanged = next.base64 === lastFrame ? unchanged + 1 : 0;
          lastFrame = next.base64;
          await preloadFrame(next.base64);
          if (generation.current !== mine) return;
          setShot(next);
          setProblem(null);
        }
      } catch {
        if (generation.current !== mine) return;
        setProblem("The screen is not available right now.");
      } finally {
        if (generation.current === mine && shouldContinue()) {
          timer = setTimeout(tick, intervalMs);
        }
      }
    };

    void tick();
    return () => {
      generation.current++;
      clearTimeout(timer);
    };
  }, [attached, computerId, active, intervalMs, secretPending]);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const state = await readControl(computerId);
      if (!live) return;
      if (state) setControl(state);
      timer = setTimeout(tick, 1000);
    };
    void tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [computerId]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const frameStyle = { aspectRatio, minWidth, minHeight };
  const blankBrowser = shot ? isBlankBrowser(shot) : false;
  const showScreen = shot !== null && !blankBrowser;

  return (
    <>
      <figure className="overflow-hidden rounded-2xl border" style={{ borderColor: "hsl(var(--border))" }}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={!showScreen}
          className="relative block w-full enabled:cursor-zoom-in"
          style={{ ...frameStyle, background: "hsl(var(--muted))" }}
          aria-label="Open the assistant's screen full size"
        >
          {showScreen ? (
            <img
              src={`data:image/png;base64,${shot.base64}`}
              alt="What the assistant is looking at"
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : null}
          {blankBrowser ? <ComputerPlaceholder className="absolute inset-0 h-full w-full" /> : null}
          {showScreen ? null : (
            <span
              className={`absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center text-sm ${
                blankBrowser ? "bg-black/25 text-white" : ""
              }`}
              style={blankBrowser ? undefined : { color: "hsl(var(--muted-foreground))" }}
            >
              {problem ? (
                <>
                  <span className="font-medium">
                    {attaching ? "Starting the live computer" : "You cannot see the screen right now"}
                  </span>
                  <span>{problem}</span>
                  {attaching ? (
                    <span>This can take a minute the first time while the isolated Chromium container starts.</span>
                  ) : (
                    <span>Start the isolated Chromium computer to watch it work live.</span>
                  )}
                </>
              ) : blankBrowser ? (
                <span>The assistant has not opened a page yet.</span>
              ) : (
                <span>Waiting for the assistant&apos;s screen…</span>
              )}
            </span>
          )}
        </button>

        {!showScreen && (!attached || attaching || problem) ? (
          <div
            className="flex items-center justify-between gap-3 border-t px-3 py-2 text-sm"
            style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))" }}
          >
            <span style={{ color: "hsl(var(--muted-foreground))" }}>
              {attaching ? "Starting isolated Chromium…" : "The live computer is not attached."}
            </span>
            <button
              type="button"
              className="btn-primary shrink-0 text-xs"
              disabled={attaching}
              onClick={() => void startComputer()}
            >
              {attaching ? "Starting…" : "Start computer"}
            </button>
          </div>
        ) : null}

        {control?.secretWanted ? (
          <form
            className="border-t px-3 py-2 text-sm"
            style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))" }}
            onSubmit={async (event) => {
              event.preventDefault();
              if (!secret || sendingSecret) return;
              setSendingSecret(true);
              watchUntil.current = Date.now() + SECRET_CONFIRM_MS;
              const result = await supplySecret(computerId, secret);
              setSendingSecret(false);
              setSecret("");
              setSecretProblem(result.ok ? null : (result.error ?? null));
              const state = await readControl(computerId);
              if (state) setControl(state);
            }}
          >
            <label className="block" htmlFor="openbot-secret">
              <span className="font-medium">The assistant needs </span>
              <span>{control.secretWanted}</span>
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="openbot-secret"
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Typed here, never shown to the assistant"
                className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
                style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))" }}
              />
              <button type="submit" disabled={!secret || sendingSecret} className="btn-primary shrink-0 text-xs">
                {sendingSecret ? "Sending…" : "Send to the page"}
              </button>
            </div>
            <p className="mt-1 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              This goes straight to the page. It is not shown in the conversation and the assistant never receives it.
            </p>
            {secretProblem ? (
              <p className="mt-1 text-xs" style={{ color: "hsl(var(--destructive))" }}>
                {secretProblem}
              </p>
            ) : null}
          </form>
        ) : null}

        {driving ? (
          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-sm" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))" }}>
            <span>You have control of this browser.</span>
            <span className="flex shrink-0 gap-2">
              <button type="button" onClick={() => setExpanded(true)} className="btn-ghost text-xs">
                Open full size
              </button>
              <button type="button" onClick={() => void handBack()} className="btn-primary text-xs">
                Hand back
              </button>
            </span>
          </div>
        ) : null}

        {control?.requested && !driving ? (
          <div className="flex items-start justify-between gap-3 border-t bg-amber-500/10 px-3 py-2 text-sm" style={{ borderColor: "hsl(var(--border))" }}>
            <span>
              <strong className="font-medium">The assistant needs you.</strong> {control.reason}
            </span>
            <button
              type="button"
              className="btn-primary shrink-0 text-xs"
              onClick={async () => {
                const state = await takeControl(computerId);
                if (state) setControl(state);
                setExpanded(true);
              }}
            >
              Take the wheel
            </button>
          </div>
        ) : null}
      </figure>

      {expanded && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="The assistant's screen"
              className="fixed inset-0 z-[100] flex flex-col bg-background text-foreground"
            >
              <header className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium tracking-tight">{agentName}</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span
                      className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
                      aria-hidden
                    />
                    {driving
                      ? "You have control — bot clicks are paused"
                      : `The assistant's screen${active ? ", updating live" : ""}`}
                    {driving && control?.reason ? ` · ${control.reason}` : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {driving ? (
                    <button
                      type="button"
                      onClick={() => {
                        setExpanded(false);
                        void handBack();
                      }}
                      className="btn-primary text-xs"
                    >
                      Hand back
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        const state = await takeControl(computerId);
                        if (state) setControl(state);
                      }}
                      className="btn-primary text-xs"
                    >
                      Take the wheel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="btn-ghost text-xs"
                  >
                    Close
                  </button>
                </div>
              </header>
              <div className="relative min-h-0 flex-1 bg-background">
                <LiveScreen computerId={computerId} driving={driving} onProblem={setProblem} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
