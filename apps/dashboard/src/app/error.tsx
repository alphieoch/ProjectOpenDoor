"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const CHUNK_RELOAD_KEY = "od:chunk-reload";

function isStaleChunkError(error: Error) {
  const message = error.message || "";
  return (
    error.name === "ChunkLoadError" ||
    message.includes("Loading chunk") ||
    message.includes("Failed to load chunk")
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const staleChunk = isStaleChunkError(error);

  useEffect(() => {
    try {
      posthog.captureException(error);
    } catch {
      // PostHog may be uninitialized if env keys are missing
    }
  }, [error]);

  useEffect(() => {
    if (!staleChunk) return;
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - lastReload < 15_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    window.location.reload();
  }, [staleChunk]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-lg font-semibold text-zinc-900">Something went wrong</h2>
      <p className="max-w-md text-center text-sm text-zinc-600">
        {staleChunk
          ? "Studio reloaded after a stale build. If this is still showing, hard-refresh the page."
          : error.message || "An unexpected error occurred."}
      </p>
      <button
        type="button"
        onClick={() => {
          if (staleChunk) {
            window.location.reload();
            return;
          }
          reset();
        }}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        {staleChunk ? "Reload page" : "Try again"}
      </button>
    </div>
  );
}
