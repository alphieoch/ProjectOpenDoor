#!/usr/bin/env bun
/**
 * Start a Jules remote session for ProjectOpenDoor.
 *
 *   bun --env-file=.env scripts/self-heal/jules-run.ts --prompt "fix flaky login"
 *   bun --env-file=.env scripts/self-heal/jules-run.ts --issue OCH-11
 *   bun --env-file=.env scripts/self-heal/jules-run.ts --issue OCH-11 --dry-run
 */
import { spawnSync } from "node:child_process";
import { linearGql, loadIssue, commentOnIssue, defaultJulesRepo } from "./lib";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function julesBin(): string {
  return process.env.JULES_BIN?.trim() || "jules";
}

function buildPrompt(opts: {
  title: string;
  body: string;
  issueUrl?: string;
  identifier?: string;
  branch: string;
}): string {
  const lines = [
    opts.title.trim(),
    "",
    opts.body.trim(),
    "",
    `Repository: ${defaultJulesRepo()}`,
    `Work from git branch \`${opts.branch}\`. Do not change \`main\`. Open a PR against that branch (or a throwaway branch based on it).`,
  ];
  if (opts.identifier) lines.push(`Linear issue: ${opts.identifier}`);
  if (opts.issueUrl) lines.push(`Linear URL: ${opts.issueUrl}`);
  lines.push(
    "When done, open a pull request and leave the PR URL in the Linear issue."
  );
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

function startJules(repo: string, session: string): { ok: boolean; output: string } {
  const result = spawnSync(
    julesBin(),
    ["remote", "new", "--repo", repo, "--session", session],
    { encoding: "utf8", cwd: process.cwd() }
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { ok: result.status === 0, output };
}

function extractSessionId(output: string): string | undefined {
  const id = output.match(/\b(\d{16,})\b/);
  return id?.[1];
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const promptArg = arg("--prompt");
  const issueId = arg("--issue");
  const repo = arg("--repo") || defaultJulesRepo();
  const branch =
    arg("--branch") ||
    process.env.JULES_SOURCE_BRANCH?.trim() ||
    spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" })
      .stdout.trim() ||
    "cursor/prod-leftovers-status-ci-auth";

  let title = promptArg?.split("\n")[0]?.slice(0, 120) || "Jules self-heal task";
  let body = promptArg && promptArg.includes("\n") ? promptArg : "";
  let issueUrl: string | undefined;
  let identifier: string | undefined;

  if (issueId) {
    const issue = await loadIssue(issueId);
    identifier = issue.identifier;
    title = issue.title;
    body = issue.description || "";
    issueUrl = issue.url;
  } else if (!promptArg) {
    console.error("Usage: jules-run.ts --prompt \"…\" | --issue OCH-11 [--dry-run] [--repo owner/name] [--branch name]");
    process.exit(2);
  }

  const session = buildPrompt({ title, body, issueUrl, identifier, branch });
  console.log(`Repo:    ${repo}`);
  console.log(`Branch:  ${branch}`);
  if (identifier) console.log(`Linear:  ${identifier} ${issueUrl ?? ""}`);
  console.log("--- prompt ---");
  console.log(session);
  console.log("--------------");

  if (dryRun) {
    console.log(
      `[dry-run] ${julesBin()} remote new --repo ${repo} --session <prompt>`
    );
    return;
  }

  const { ok, output } = startJules(repo, session);
  console.log(output || "(no Jules output)");
  if (!ok) {
    console.error(
      "Jules did not start a session. If the repo is missing, grant Google Labs Jules access at https://github.com/apps/google-labs-jules/installations/new then re-run `jules remote list --repo`."
    );
    process.exit(1);
  }

  const sessionId = extractSessionId(output);
  const sessionUrl = sessionId
    ? `https://jules.google.com/session/${sessionId}`
    : undefined;

  if (identifier && (sessionId || output)) {
    try {
      await commentOnIssue(
        identifier,
        [
          "Jules session started from `scripts/self-heal/jules-run.ts`.",
          sessionId ? `Session ID: \`${sessionId}\`` : null,
          sessionUrl ? `Jules: ${sessionUrl}` : null,
          `Repo: \`${repo}\` · requested branch: \`${branch}\``,
          "",
          "```",
          output.slice(0, 1500),
          "```",
        ]
          .filter(Boolean)
          .join("\n")
      );
      console.log(`Commented on ${identifier}`);
    } catch (err) {
      console.warn(
        `Could not comment on Linear (${err instanceof Error ? err.message : err}). Set LINEAR_API_KEY or comment the session URL by hand.`
      );
    }
  }
}

void main();
