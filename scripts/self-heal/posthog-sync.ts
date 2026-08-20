#!/usr/bin/env bun
/**
 * PostHog error → Linear self-heal issue (labels agent + self-heal).
 *
 *   bun --env-file=.env scripts/self-heal/posthog-sync.ts --dry-run
 *   bun --env-file=.env scripts/self-heal/posthog-sync.ts --file payload.json
 *   cat webhook.json | bun --env-file=.env scripts/self-heal/posthog-sync.ts
 *
 * Webhook shape: PostHog $error_tracking_issue_created / hogfunction payload,
 * or { id, name, description, url }.
 */
import { readFileSync } from "node:fs";
import {
  posthogFingerprintToken,
  upsertSelfHealIssue,
} from "./lib";

const dryRun = process.argv.includes("--dry-run");
const fileFlag = process.argv.indexOf("--file");
const filePath = fileFlag >= 0 ? process.argv[fileFlag + 1] : undefined;

function readPayload(): unknown {
  if (filePath) return JSON.parse(readFileSync(filePath, "utf8"));
  if (!process.stdin.isTTY) {
    const raw = readFileSync(0, "utf8").trim();
    if (raw) return JSON.parse(raw);
  }
  return null;
}

function pick(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const props = obj.properties;
  if (props && typeof props === "object") {
    const p = props as Record<string, unknown>;
    for (const k of keys) {
      const v = p[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

function normalize(raw: unknown): {
  id: string;
  title: string;
  description: string;
  url: string;
} {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const event = (obj.event && typeof obj.event === "object"
    ? obj.event
    : obj) as Record<string, unknown>;
  const id =
    pick(event, "id", "issue_id", "distinct_id") ||
    pick(obj, "id", "issue_id") ||
    "unknown";
  const title =
    pick(event, "name", "title", "$exception_type") ||
    pick(obj, "name", "title") ||
    "PostHog exception";
  const description =
    pick(event, "description", "$exception_message") ||
    pick(obj, "description", "body") ||
    "";
  const url =
    pick(event, "url", "issue_url") ||
    pick(obj, "url") ||
    `https://us.posthog.com/project/407244/error_tracking/${encodeURIComponent(id)}`;
  return { id, title, description, url };
}

const raw = readPayload();
if (!raw) {
  console.log(
    "No webhook payload. Pass --file or stdin. Native Linear destination is not connected yet — connect at https://us.posthog.com/project/407244/settings/environment-integrations then point an error-tracking alert (template-linear or webhook) here."
  );
  if (dryRun) {
    console.log("[dry-run] would upsert a Linear agent/self-heal issue from a PostHog payload");
    process.exit(0);
  }
  process.exit(2);
}

const n = normalize(raw);
const token = posthogFingerprintToken(n.id);
const description = [
  n.description || "(no stack snippet)",
  "",
  "---",
  `**${token}**`,
  `**PostHog:** ${n.url}`,
  "**Labels:** agent, self-heal",
  "**Pickup:** Jules (`jules` / `agent` GitHub label) or `bun scripts/self-heal/dispatch.ts`",
].join("\n");

const title = `[self-heal] ${n.title}`.slice(0, 200);
console.log(`Token: ${token}`);
console.log(`Title: ${title}`);

if (dryRun) {
  console.log("[dry-run] skip Linear upsert");
  process.exit(0);
}

const { issue, created } = await upsertSelfHealIssue({
  title,
  description,
  token,
  url: n.url,
});
console.log(`${created ? "Created" : "Existing"} ${issue.identifier} ${issue.url}`);
