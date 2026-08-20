# Self-heal pipeline

Overnight path:

**PostHog `$exception`** → Linear issue (`agent` + `self-heal`) → GitHub label / workflow **or** `dispatch.ts` → **Jules session** → PR → comment on GitHub (and Linear if `LINEAR_API_KEY` is set)

## Live IDs

- **Linear project:** https://linear.app/ochiengandco/project/self-heal-cc5e1194b121
- **Linear queue:** https://linear.app/ochiengandco/issue/OCH-11
- **PostHog errors:** https://us.posthog.com/project/407244/error_tracking
- **PostHog Linear connect:** https://us.posthog.com/project/407244/settings/environment-integrations
- **Jules App:** https://github.com/apps/google-labs-jules
- **Jules web:** https://jules.google.com
- **Smoke session:** https://jules.google.com/session/8786047558730748385

## How each hop talks

| Hop | Mechanism |
| --- | --- |
| PostHog → Linear | Native Linear destination **not connected** (0 integrations). Use `scripts/self-heal/posthog-sync.ts` on a PostHog webhook / cron, or Linear MCP. After connecting Linear in PostHog, add an error-tracking alert (`template-linear` or webhook). |
| Linear → Jules | `dispatch.ts` / `jules-run.ts`, or mirror to a GitHub issue and label it. |
| GitHub → Jules | Official: label **`jules`**. Actions: label **`agent`** / **`self-heal`** runs `.github/workflows/self-heal-jules.yml` (needs the file on `main`). If `JULES_API_KEY` is set, uses `google-labs-code/jules-action@v1.0.0`. Else the workflow applies `jules` so the App starts. |
| Jules → PR | App comments the PR; Actions path uses `AUTO_CREATE_PR`. `comment-pr.ts` writes the PR URL to Linear when `LINEAR_API_KEY` exists. |

## Secrets (do not commit)

```bash
gh secret set JULES_API_KEY --repo alphieoch/ProjectOpenDoor   # from jules.google.com Settings
gh secret set LINEAR_API_KEY --repo alphieoch/ProjectOpenDoor # optional Linear comments
```

Repo variable (optional allowlist): `JULES_ALLOWLIST=alphieoch`

See `scripts/self-heal/README.md` for CLI commands.
