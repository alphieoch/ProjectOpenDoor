#!/usr/bin/env bun
/**
 *   bun --env-file=.env scripts/self-heal/linear-comment.ts --issue OCH-11 --body "…"
 */
import { commentOnIssue } from "./lib";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const issue = arg("--issue");
const body = arg("--body");
if (!issue || !body) {
  console.error("Usage: linear-comment.ts --issue OCH-11 --body \"…\"");
  process.exit(2);
}
await commentOnIssue(issue, body);
console.log(`Commented on ${issue}`);
