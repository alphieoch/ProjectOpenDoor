---
sidebar_position: 3
---

# Production Readiness Handoff

Use this page as the handoff brief for the next agent that continues production hardening.

## Current context

- Branch with homepage/onboarding work: `cursor/onboarding-homepage-refresh-c227`
- Base branch: `main`
- App areas touched:
  - `apps/dashboard/src/app/page.tsx`
  - `apps/dashboard/src/app/onboarding/page.tsx`
  - `apps/dashboard/src/components/ui/auth-page.tsx`
- New behavior:
  - `/signup` opens signup mode through `/login?signup=1`.
  - New email/password signups redirect to `/onboarding`.
  - Existing email/password logins still redirect to `/dashboard`.
  - `/onboarding` is authenticated and derives setup progress from org credits, API key count, and plan.

## Critical first step: fix the Cloud/dev toolchain

The previous agent could not run local validation because the Cloud image did not include:

- `node`
- `npm`
- `pnpm`
- `bun`
- `corepack`

Before changing behavior, make sure the environment can run:

```bash
pnpm --filter @opendoor/dashboard typecheck
pnpm --filter @opendoor/dashboard build
pnpm lint
```

If this is still a Cursor Cloud environment issue, start an environment setup agent at:

```text
https://cursor.com/onboard
```

Use this prompt:

```text
This repository is a Bun/pnpm monorepo for ProjectOpenDoor. The package manager is pnpm@9.0.0 and the root package.json requires bun >=1.0.0. Cloud agents currently have no node, npm, pnpm, bun, or corepack available, so they cannot run typecheck/build/lint. Please update the Cursor Cloud environment so future agents have Node LTS, corepack, pnpm 9, and Bun installed and available on PATH. Verify these commands work from /workspace: node --version, corepack --version, pnpm --version, bun --version, pnpm --filter @opendoor/dashboard typecheck.
```

## Agent prompt: production hardening implementation

Copy/paste this to the next implementation agent:

```text
Continue production hardening for ProjectOpenDoor from branch cursor/onboarding-homepage-refresh-c227. First verify the toolchain works and run git status. Do not revert existing work.

Focus on making the new signup -> onboarding flow production-ready:

1. Validation and CI
   - Run dashboard typecheck/build/lint.
   - Fix any errors from apps/dashboard/src/app/page.tsx, apps/dashboard/src/app/onboarding/page.tsx, and apps/dashboard/src/components/ui/auth-page.tsx.
   - If no CI exists, add a GitHub Actions workflow for install, typecheck, lint, and build using pnpm and Bun as required by the repo.

2. Onboarding state
   - Replace derived-only setup progress with persisted onboarding state where appropriate.
   - Add database migration(s) for onboarding completion fields or an onboarding_steps table.
   - Use Supabase MCP for database work and run migrations after creating them.
   - Track at least: workspace_created, api_key_created, first_request_sent, team_invited, billing_configured, onboarding_completed_at.
   - Redirect users with completed onboarding away from /onboarding unless they explicitly visit it.

3. Signup/auth hardening
   - Add server-side validation for signup input shape, email normalization, org name length, and password quality.
   - Add rate limiting for login and signup.
   - Prepare hooks for email verification and password reset if not already present.
   - Ensure auth cookies are secure in production and redirects are safe.

4. Observability
   - Add consistent analytics/log events for onboarding viewed, onboarding step clicked, API key setup started, playground opened from onboarding, billing opened from onboarding, and onboarding completed.
   - Add server-side error tracking/logging around signup and onboarding data loading.

5. UX completeness
   - Add copyable OpenAI-compatible curl snippet on onboarding.
   - Add clear loading/error/empty states for onboarding data.
   - Mobile QA the homepage and onboarding layouts.

6. Billing and credits
   - Verify signup credits are granted once and cannot be duplicated.
   - Verify Stripe price IDs and webhook handling in test mode.
   - Add fallback/error UI where billing calls can fail.

7. Security checks
   - Do not commit secrets.
   - Confirm .env remains ignored.
   - Add or verify secret scanning in CI.
   - Rotate any keys that were exposed in chat before production use.

Run the full validation suite before committing. Commit and push each logical change. Update the draft PR for cursor/onboarding-homepage-refresh-c227 when done.
```

## Supabase/Postgres prompt

Use this with an agent that has Supabase MCP access:

```text
Use Supabase MCP for all database tasks. Inspect the current ProjectOpenDoor schema and migrations. Design and apply the minimal migration needed to persist onboarding progress for organizations/users. Prefer additive, backwards-compatible schema changes. After applying migrations, run Supabase advisors for security and performance. Return the migration names, schema changes, advisor findings, and any follow-up fixes needed.
```

## Production readiness checklist

### Must complete before launch

- [ ] Toolchain works in Cloud and CI.
- [ ] Typecheck passes.
- [ ] Dashboard build passes.
- [ ] Lint passes or lint configuration is fixed.
- [ ] Homepage responsive QA completed.
- [ ] Signup opens signup mode from `/signup`.
- [ ] New signup redirects to `/onboarding`.
- [ ] Existing login redirects to `/dashboard`.
- [ ] `/onboarding` requires auth.
- [ ] Onboarding progress is persisted or explicitly accepted as derived state.
- [ ] Signup/login rate limiting is in place.
- [ ] Email/password validation is hardened.
- [ ] Secrets exposed outside the repo are rotated.
- [ ] Stripe webhooks are tested.
- [ ] Signup credits cannot be granted twice.
- [ ] Supabase migrations have been applied.
- [ ] Supabase security/performance advisors have been reviewed.
- [ ] Error tracking/logging covers signup and onboarding.

### Strongly recommended

- [ ] Playwright smoke test: homepage -> signup -> onboarding -> create API key.
- [ ] API tests for signup, login, API key creation, and billing checkout.
- [ ] Onboarding events are visible in analytics.
- [ ] Copyable curl snippet works in onboarding.
- [ ] Completed users are redirected away from onboarding by default.
- [ ] Production environment variable inventory is documented.

## Notes for reviewers

- The current onboarding page intentionally avoids writing new database state. It reads existing org/API-key data so the first version is safe to ship behind normal auth.
- The next production-hardening pass should decide whether onboarding progress belongs on `organizations.metadata`, a first-class JSON column, or a normalized table. Prefer a migration that keeps existing signups working.
- Rotate any real secrets shared outside managed secret storage before deploying production.
