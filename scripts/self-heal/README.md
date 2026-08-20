# Self-heal: PostHog → Linear → Jules → GitHub

## Overnight path

1. Dashboard/gateway capture `$exception` to PostHog [ProjectOpenDoor 407244](https://us.posthog.com/project/407244/error_tracking).
2. `posthog-sync.ts` (webhook/cron) or Linear MCP upserts a Linear issue on [Self-heal](https://linear.app/ochiengandco/project/self-heal-cc5e1194b121) with labels **`agent`** + **`self-heal`**.
3. Either:
   - **GitHub (preferred auto):** open/mirror an issue and label `jules` (official App) or `agent`/`self-heal` (workflow on `main`).
   - **Local:** `bun --env-file=.env scripts/self-heal/dispatch.ts`
4. Jules opens a PR. Workflow comments on the GitHub issue. `comment-pr.ts` comments Linear if `LINEAR_API_KEY` is set.

## What is live

| Piece | Status |
| --- | --- |
| Jules CLI v0.1.42 | Auth OK · repo `alphieoch/ProjectOpenDoor` visible |
| Jules GitHub App | Connected (CLI lists this repo) |
| GitHub labels | `agent`, `self-heal`, `jules` |
| Workflow | `.github/workflows/self-heal-jules.yml` (runs after merge to `main`) |
| Linear | [OCH-11](https://linear.app/ochiengandco/issue/OCH-11) |
| PostHog Linear destination | **Not connected** — one click at [integrations](https://us.posthog.com/project/407244/settings/environment-integrations) |
| `JULES_API_KEY` / `LINEAR_API_KEY` | Not in local `.env` or repo secrets yet |

## Commands

```bash
bun scripts/self-heal/status.ts
jules remote list --repo
bun --env-file=.env scripts/self-heal/jules-run.ts --issue OCH-11 --dry-run
bun --env-file=.env scripts/self-heal/posthog-sync.ts --dry-run
bun --env-file=.env scripts/self-heal/dispatch.ts --dry-run

# Official Jules App (works without Actions secrets):
gh issue create --repo alphieoch/ProjectOpenDoor --title "[self-heal] from OCH-11" --body "See OCH-11"
gh issue edit NUMBER --repo alphieoch/ProjectOpenDoor --add-label jules
```

After `JULES_API_KEY` exists: `gh secret set JULES_API_KEY --repo alphieoch/ProjectOpenDoor`

## Secrets

Never commit keys. Optional Actions secrets: `JULES_API_KEY`, `LINEAR_API_KEY`. Local scripts need `LINEAR_API_KEY` for Linear writes.
