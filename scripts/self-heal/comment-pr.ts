#!/usr/bin/env bun
/**
 * If a GitHub PR title/body mentions a Linear id (OCH-123), comment the PR URL
 * on that Linear issue. Safe to run from cron after Jules opens a PR.
 *
 *   bun --env-file=.env scripts/self-heal/comment-pr.ts
 */
import { spawnSync } from "node:child_process";
import { commentOnIssue, loadIssue } from "./lib";

type GhPr = {
  number: number;
  title: string;
  url: string;
  body: string;
  headRefName: string;
};

const repo = process.env.JULES_REPO?.trim() || "alphieoch/ProjectOpenDoor";
const raw = spawnSync(
  "gh",
  [
    "pr",
    "list",
    "--repo",
    repo,
    "--state",
    "open",
    "--limit",
    "30",
    "--json",
    "number,title,url,body,headRefName",
  ],
  { encoding: "utf8" }
);

if (raw.status !== 0) {
  console.error(raw.stderr || "gh pr list failed");
  process.exit(1);
}

const prs = JSON.parse(raw.stdout || "[]") as GhPr[];
const idRe = /\bOCH-\d+\b/gi;
let commented = 0;

for (const pr of prs) {
  const hay = `${pr.title}\n${pr.body}\n${pr.headRefName}`;
  const ids = [...new Set(hay.match(idRe) ?? [])];
  for (const identifier of ids) {
    let issue;
    try {
      issue = await loadIssue(identifier);
    } catch (err) {
      console.warn(`Skip ${identifier}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    const marker = `PR: ${pr.url}`;
    try {
      await commentOnIssue(
        issue.identifier,
        [
          "Jules or a coding agent opened a pull request.",
          marker,
          `Branch: \`${pr.headRefName}\``,
          `Title: ${pr.title}`,
        ].join("\n")
      );
      commented += 1;
      console.log(`${issue.identifier} ← ${pr.url}`);
    } catch (err) {
      console.warn(
        `Could not comment ${issue.identifier}: ${err instanceof Error ? err.message : err}`
      );
    }
  }
}

console.log(`Done. Comments attempted: ${commented}`);
