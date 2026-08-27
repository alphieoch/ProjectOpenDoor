#!/usr/bin/env bun
/**
 * Pick the next Linear `agent` / `self-heal` issue and start Jules.
 *
 *   bun --env-file=.env scripts/self-heal/dispatch.ts
 *   bun --env-file=.env scripts/self-heal/dispatch.ts --dry-run
 */
import { spawnSync } from "node:child_process";
import { nextAgentIssue } from "./lib";

const dryRun = process.argv.includes("--dry-run");

const issue = await nextAgentIssue();
if (!issue) {
  console.log("No unstarted Linear issues labeled agent or self-heal.");
  process.exit(0);
}

console.log(`Next issue: ${issue.identifier} — ${issue.title}`);
console.log(issue.url);

const args = [
  "scripts/self-heal/jules-run.ts",
  "--issue",
  issue.identifier,
];
if (dryRun) args.push("--dry-run");

const result = spawnSync("bun", args, {
  encoding: "utf8",
  stdio: "inherit",
  cwd: process.cwd(),
});
process.exit(result.status ?? 1);
