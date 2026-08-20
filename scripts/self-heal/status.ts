#!/usr/bin/env bun
/** Print Jules + queue status without secrets. */
import { spawnSync } from "node:child_process";

const repo = process.env.JULES_REPO?.trim() || "alphieoch/ProjectOpenDoor";
const jules = process.env.JULES_BIN?.trim() || "jules";

function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
}

const version = run(jules, ["version"]);
const repos = run(jules, ["remote", "list", "--repo"]);
const connected = repos
  .split(/\s+/)
  .some((r) => r.toLowerCase() === repo.toLowerCase());

console.log(version);
console.log(`Expected repo: ${repo}`);
console.log(`Connected repos:\n${repos || "(none)"}`);
console.log(
  connected
    ? `OK: Jules can see ${repo}`
    : `BLOCKED: grant https://github.com/apps/google-labs-jules/installations/new then re-run this script`
);
console.log(`Linear queue: https://linear.app/ochiengandco/project/self-heal-cc5e1194b121`);
console.log(`Tracker: https://linear.app/ochiengandco/issue/OCH-11`);
