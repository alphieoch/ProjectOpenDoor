"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pageCoordinates, sendHumanInput, viewportToOverlay } from "./take-the-wheel";

/**
 * Vendored from CopilotKit/openbot `app/src/components/computer/live-screen.tsx` (MIT).
 * OpenDoor draws polled screenshots onto the canvas and forwards input over HTTP.
 * Bot clicks and the overlay cursor share screenshot CSS pixels (shot.width × shot.height).
 */

type Pointer = {
  x: number;
  y: number;
  action?: string;
};

type Props = {
  computerId: string;
  driving: boolean;
  onProblem?: (problem: string | null) => void;
};

export function LiveScreen({ computerId, driving, onProblem }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const frameSize = useRef<{ width: number; height: number } | null>(null);
  const [connected, setConnected] = useState(false);
  const [pointer, setPointer] = useState<Pointer | null>(null);
  const [overlay, setOverlay] = useState<{ x: number; y: number } | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const generation = useRef(0);

  const placeCursor = useCallback((next: Pointer | null, size: { width: number; height: number } | null) => {
    const stage = stageRef.current;
    if (!next || !size || !stage) {
      setOverlay(null);
      return;
    }
    const box = stage.getBoundingClientRect();
    setOverlay(
      viewportToOverlay(next, { naturalWidth: size.width, naturalHeight: size.height }, box),
    );
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setStageSize({ width: box.width, height: box.height });
      placeCursor(pointer, frameSize.current);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [placeCursor, pointer]);

  useEffect(() => {
    const mine = ++generation.current;
    let timer: ReturnType<typeof setTimeout>;
    let closed = false;

    const tick = async () => {
      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(computerId)}/computer/screenshot`, {
          credentials: "include",
        });
        if (generation.current !== mine || closed) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setConnected(false);
          onProblem?.(body?.error ?? "The live screen could not be reached.");
        } else {
          const shot = (await response.json()) as {
            base64: string;
            width?: number;
            height?: number;
            pointer?: Pointer;
          };
          const canvas = canvasRef.current;
          if (!canvas || !shot.base64) return;
          const binary = Uint8Array.from(atob(shot.base64), (c) => c.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([binary], { type: "image/png" }));
          if (closed || generation.current !== mine) {
            bitmap.close();
            return;
          }
          const size = {
            width: shot.width ?? bitmap.width,
            height: shot.height ?? bitmap.height,
          };
          frameSize.current = size;
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
          bitmap.close();
          setConnected(true);
          onProblem?.(null);
          if (shot.pointer && Number.isFinite(shot.pointer.x) && Number.isFinite(shot.pointer.y)) {
            setPointer(shot.pointer);
            placeCursor(shot.pointer, size);
          }
        }
      } catch {
        if (generation.current !== mine) return;
        setConnected(false);
        onProblem?.("The live screen could not be reached.");
      } finally {
        if (generation.current === mine && !closed) {
          timer = setTimeout(tick, driving ? 200 : 700);
        }
      }
    };

    void tick();
    return () => {
      closed = true;
      generation.current++;
      clearTimeout(timer);
    };
  }, [computerId, driving, onProblem, placeCursor]);

  const at = useCallback((event: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const size = frameSize.current;
    if (!canvas || !size) return null;
    return pageCoordinates(
      { naturalWidth: size.width, naturalHeight: size.height },
      canvas.getBoundingClientRect(),
      event,
    );
  }, []);

  const onMouse = useCallback(
    (kind: "pressed" | "released" | "moved") => (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!driving || kind === "moved") return;
      const point = at(event);
      if (!point) return;
      if (kind === "pressed") sendHumanInput(computerId, "click", point);
    },
    [at, computerId, driving],
  );

  useEffect(() => {
    if (!driving) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") return;
      event.preventDefault();
      if (event.key.length === 1) {
        sendHumanInput(computerId, "type", { text: event.key });
        return;
      }
      sendHumanInput(computerId, "key", { key: event.key });
    };
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text");
      if (!text) return;
      event.preventDefault();
      sendHumanInput(computerId, "type", { text });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, [computerId, driving]);

  return (
    <div ref={stageRef} className="relative h-full min-h-0 w-full bg-background" data-stage-width={stageSize.width}>
      <canvas
        ref={canvasRef}
        className={`block h-full w-full object-contain ${driving ? "cursor-crosshair" : ""}`}
        {...(driving
          ? {
              onMouseDown: onMouse("pressed"),
              onMouseUp: onMouse("released"),
              onMouseMove: onMouse("moved"),
              onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
              onWheel: (event: React.WheelEvent<HTMLCanvasElement>) => {
                const point = at(event);
                if (!point) return;
                event.preventDefault();
                sendHumanInput(computerId, "scroll", { ...point, deltaY: event.deltaY });
              },
            }
          : {})}
        aria-label={
          driving
            ? "The assistant's screen. You have control: click and type here."
            : "The assistant's screen, live"
        }
        data-connected={connected}
      />
      {!driving && overlay ? (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: overlay.x,
            top: overlay.y,
            transform: "translate(-18%, -8%)",
            transition: "left 160ms ease-out, top 160ms ease-out",
          }}
          data-bot-cursor={pointer?.action ?? "idle"}
        >
          <svg width="22" height="24" viewBox="0 0 22 24" aria-hidden="true">
            <path
              d="M2 1.5 20 12.2l-7.1 1.5 2.6 8.2-3.6 1.1-2.6-8.1L2 19.2V1.5Z"
              className="fill-primary stroke-background"
              strokeWidth="1.4"
            />
          </svg>
          <span
            className={`absolute left-4 top-4 size-2 rounded-full bg-primary ${
              pointer?.action === "click" ? "animate-ping" : ""
            }`}
          />
        </div>
      ) : null}
    </div>
  );
}
