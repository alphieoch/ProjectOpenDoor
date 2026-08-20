# Self-heal: PostHog → Linear → Jules

Overnight queue so coding agents can pick work while people are away.

## What works on this machine (2026-08-20)

| Piece | Status |
| --- | --- |
| Jules CLI | Installed: `/opt/homebrew/bin/jules` **v0.1.42** |
| Jules Google login | Working (`jules remote list --repo` returns repos) |
| Jules GitHub repo | Connected: `alphieoch/ProjectOpenDoor` is in `jules remote list --repo` |
| Linear project | [Self-heal](https://linear.app/ochiengandco/project/self-heal-cc5e1194b121) · labels `agent`, `self-heal` |
| Queue issue | [OCH-11](https://linear.app/ochiengandco/issue/OCH-11/wire-jules-onto-alphieochprojectopendoor-self-heal-queue) |
| PostHog | Project **ProjectOpenDoor** `407244` · [error tracking](https://us.posthog.com/project/407244/error_tracking) · no Linear destination yet |

## Jules commands that work here

```bash
jules version
jules remote list --repo
jules remote list --session
```

Verified live session: https://jules.google.com/session/8786047558730748385

```bash
jules remote new --repo alphieoch/ProjectOpenDoor --session "Read OCH-11. Do nothing to main. Work from cursor/prod-leftovers-status-ci-auth."
```

Or via the repo script (adds Linear context + comments the session if `LINEAR_API_KEY` is set):

```bash
bun --env-file=.env scripts/self-heal/jules-run.ts --issue OCH-11 --dry-run
bun --env-file=.env scripts/self-heal/jules-run.ts --issue OCH-11
bun --env-file=.env scripts/self-heal/jules-run.ts --prompt "tiny hello: do not change files"
bun --env-file=.env scripts/self-heal/dispatch.ts --dry-run
```

Cursor Cloud Agents pick the same Linear issues (`agent` / `self-heal` on project Self-heal).

## Connect this repo

Already connected. Confirm anytime:

```bash
bun scripts/self-heal/status.ts
```

If the repo disappears from the list, re-grant [Google Labs Jules](https://github.com/apps/google-labs-jules/installations/new) on `alphieoch/ProjectOpenDoor`. Login again with `jules login` only if Google OAuth expires.

## Overnight path

1. Dashboard / gateway already capture `$exception` to PostHog project `407244`.
2. Cron or a person runs `bun --env-file=.env scripts/self-heal/dispatch.ts` (or a PostHog alert webhook later).
3. Script upserts/picks the next Linear issue labeled `agent` (Todo) on project Self-heal.
4. `jules remote new` starts a cloud VM session against `alphieoch/ProjectOpenDoor`.
5. When a PR exists, `bun --env-file=.env scripts/self-heal/comment-pr.ts` comments the PR URL on Linear.

## Env (never commit real keys)

```
LINEAR_API_KEY=           # Linear personal/workspace key (issue read + comment)
LINEAR_SELF_HEAL_TEAM_ID= # defaults to Ochieng&Co team UUID
JULES_REPO=alphieoch/ProjectOpenDoor
JULES_SOURCE_BRANCH=cursor/prod-leftovers-status-ci-auth
POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_PROJECT_ID=407244
```

`LINEAR_API_KEY` is not in the local `.env` yet — dispatch/comment need it. Linear MCP already created the project, labels, and OCH-11.
