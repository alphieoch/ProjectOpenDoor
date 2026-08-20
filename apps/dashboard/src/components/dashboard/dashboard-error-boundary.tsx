"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { buttonVariants } from "@/components/ui/button";

const CHUNK_RELOAD_KEY = "od:chunk-reload";

function isStaleChunkError(error: Error) {
  const message = error.message || "";
  return (
    error.name === "ChunkLoadError" ||
    message.includes("Loading chunk") ||
    message.includes("Failed to load chunk")
  );
}

export function DashboardErrorFallback({
  error,
  reset,
}: {
  error?: { message?: string; name?: string } | null;
  reset: () => void;
}) {
  const staleChunk = error instanceof Error ? isStaleChunkError(error) : false;

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h2 className="text-lg font-semibold text-foreground">This page failed to load</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {staleChunk
          ? "A stale bundle was still in the tab. Reload once — the sidebar stays up."
          : "The dashboard shell is still up. Try again, or keep working in Chat or OpenBot."}
      </p>
      {error?.message && !staleChunk ? (
        <p className="max-w-md text-xs text-muted-foreground">{error.message}</p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className={buttonVariants({ size: "sm" })}
          onClick={() => {
            if (staleChunk) {
              window.location.reload();
              return;
            }
            reset();
          }}
        >
          {staleChunk ? "Reload page" : "Try again"}
        </button>
        <Link href="/dashboard" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Overview
        </Link>
        <Link href="/dashboard/chat" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Chat
        </Link>
        <Link href="/dashboard/openbot" className={buttonVariants({ size: "sm", variant: "outline" })}>
          OpenBot
        </Link>
      </div>
    </div>
  );
}

type BoundaryProps = { children: ReactNode };
type BoundaryState = { error: Error | null };

export class DashboardErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[dashboard] page error", error, info.componentStack);
    try {
      posthog.captureException(error);
    } catch {
      // PostHog may be uninitialized
    }
    if (!isStaleChunkError(error) || typeof window === "undefined") return;
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - lastReload < 15_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    window.location.reload();
  }

  render() {
    if (this.state.error) {
      return (
        <DashboardErrorFallback
          error={this.state.error}
          reset={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
