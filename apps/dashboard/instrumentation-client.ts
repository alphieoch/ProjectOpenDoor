import posthog from "posthog-js";

const key =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ||
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (typeof window !== "undefined" && key) {
  const ingestHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  const uiHost =
    process.env.NEXT_PUBLIC_POSTHOG_UI_HOST ||
    (ingestHost.includes("eu") ? "https://eu.posthog.com" : "https://us.posthog.com");

  posthog.init(key, {
    api_host: "/ingest",
    ui_host: uiHost,
    defaults: "2026-01-30",
    capture_exceptions: true,
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: {},
    persistence: "localStorage+cookie",
    debug: process.env.NODE_ENV === "development",
  });
}
