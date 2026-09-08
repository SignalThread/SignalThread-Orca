# Opus Loop Brief — LR Product Health P0/P1 Monitoring

## Read this before running the prompt pack

You are running the **LR Product Health P0/P1 monitoring prompt loop** in auto-approve mode.

Primary prompt doc:

```bash
LR_PRODUCT_HEALTH_OPUS_PROMPTS.md
```

Primary repo:

```bash
cd ~/Documents/lead\ retrieval\ app
```

Do **not** work in Internal-app for this loop.
Do **not** work in the mobile app repo for this loop.

## Objective

Build the remaining **Lead Retrieval Admin** signed aggregate health endpoints for Product Health.

The existing conversation lifecycle check is already live, scheduled from Internal-app, healthy, and wired into the Product Health UI. Do **not** rebuild it.

This loop should add only the remaining LR Admin monitoring sources:

1. Prompt 6 — P0 Capture + Recording Ingestion Health
2. Prompt 7 — P0 Workflow Waits Health
3. Prompt 8 — P0 Auth / Tenant / Event Access Health
4. Prompt 9 — P1 Campaign Readiness Health
5. Prompt 10 — P1 Invite / License / Seat Access Health
6. Prompt 11 — P1 Provider Failure Spike Health
7. Prompt 12 — P1 Job / Cron Freshness Health

Internal-app wiring is intentionally later. Do not add Internal-app code in this loop.

## Run mode

Run this as a continuous implementation loop.

Start at Prompt 6 and continue through Prompt 12 without stopping for review, approval, or acceptance between prompts.

After each prompt:

- implement the scoped LR Admin changes
- add or update targeted tests for that health source
- run the targeted validation for that prompt
- run safe broader validation where practical
- record the result clearly
- continue directly to the next prompt

Do not pause after a prompt just because tests pass.
Do not ask whether to continue.
Do not create artificial review gates.
Do not split the work into “Prompt 1 only” or “acceptance checkpoint” behavior.

## Hard-stop rules

Only stop the loop for a true critical issue, such as:

- a change would require touching the mobile app lead creation payload, recording upload payload, additive recording UX, or app posting behavior
- the schema is missing a table/column that cannot be safely inferred from migrations/types/runtime code
- the implementation would require a production data mutation or repair job
- secrets/auth for the signed internal endpoint pattern are missing in a way that prevents safe local validation
- a migration is required and cannot be made idempotent/production-safe
- a test failure is clearly caused by the monitoring work and cannot be isolated safely

Do **not** stop for known pre-existing test failures from the parallel test orchestration work. Report them as pre-existing and continue.

## Schema-open requirement

Keep the schema context open while implementing.

Before each prompt, inspect the actual LR Admin schema sources instead of guessing table or column names. Use the repo’s current sources of truth, including whichever of these exist:

- Supabase migrations
- Prisma schema
- generated database types
- route/service code that already reads the relevant tables
- existing tests and fixtures

Do not invent fields.
Do not assume older summary names are current.
Do not rely on Supabase default 1,000-row behavior for aggregate health checks.
Do not make unbounded or row-count-fragile queries where pagination/count windows are needed.

If two schema sources conflict, prefer the one proven by active route/service code and tests, then document the conflict in the prompt summary.

## Health endpoint design standard

Each new health source should follow the established conversation lifecycle pattern:

- signed internal-only endpoint
- aggregate JSON only
- no customer content
- no transcript text
- no audio URLs
- no row IDs in responses
- no provider payloads
- no repair mutations
- no customer-facing behavior changes
- explicit `checkedAt`
- explicit `status`: `healthy`, `warning`, or `critical`
- stable machine-readable issue objects
- narrow, scoped, performance-aware queries
- deterministic thresholds documented in code/tests

Where practical, share helpers/types instead of creating seven one-off response shapes.

## Protected boundaries

Mobile is a protected path.

Do not modify:

- mobile lead creation payloads
- recording upload payload shape
- additive recording behavior
- mobile recording UX
- mobile posting behavior
- mobile app repo files

The mobile app is a thin operational client over the shared Supabase backend. Product Health should observe backend state safely; it should not change capture behavior.

## Existing testing/orchestration context

There is a parallel LR testing effort on/around:

```text
test/core-journey-e2e-plan
```

Already completed there:

- core journey matrix
- journey fixture/cleanup/assertion harness
- feature-level journey tests
- Golden Exhibitor Journey
- full coverage audit doc
- Playwright dev-server startup fix
- P0 Node test orchestration runner

Known good results from that effort:

```text
npm run test:journeys
84 pass / 1 skipped / 0 fail

npm run test:workflow
362 pass / 0 fail

npm run build
passed
```

Known current blockers exposed by orchestration:

```text
npm run test:node:all
currently surfaces about 14 pre-existing failures

npm run test:full
currently fails at test:node:all before reaching Playwright/auth setup
```

Known Playwright auth setup issue:

- Playwright now starts/reuses the dev server correctly.
- `e2e/auth.setup.ts` reaches the app.
- Auth setup still fails because seeded sessions do not land on expected routes:
  - `platform_admin` times out waiting for `/admin`
  - `organizer_admin` times out waiting for `/app/organizer`
  - `exhibitor_admin` remains on `/login`

Do not fix these inside the Product Health loop unless your monitoring changes directly caused or touched them.

Preserve these orchestration files unless a prompt directly requires a small compatible change:

- `package.json`
- `playwright.config.ts`
- `scripts/run-node-tests.mjs`
- `tests/test-script-inventory.test.ts`
- journey test files
- full coverage audit docs

## Validation approach

For each prompt, run the most relevant targeted tests first.

Expected validation order:

1. targeted unit/service/API tests for the health source just implemented
2. any existing health endpoint tests
3. `npm run build`
4. broader tests where practical, while clearly separating pre-existing failures from new failures

Do not claim the full suite is green if `test:node:all` or `test:full` still fails for known pre-existing reasons.

A good prompt summary says:

```text
Implemented Prompt X.
Changed files:
- ...

Validation:
- targeted health tests: passed
- npm run build: passed
- broader suite: still has known pre-existing failures in ..., not caused by this prompt

Continued to Prompt Y.
```

## Engineering bar

This work must meet the Lead Retrieval engineering standard:

- production-quality
- scalable
- performance-aware
- low-breakage
- tested before merge
- no shortcut fixes that create future mess
- single source of truth
- safe data handling
- deterministic tests
- no brittle patches

Health monitoring should be boring, safe, and trustworthy. It should help Internal-app answer whether the event-floor system is healthy without exposing sensitive customer data or mutating production state.

## End state

When the loop is complete, LR Admin should expose all seven remaining signed aggregate health sources needed by Internal-app:

- Capture + Recording Ingestion
- Workflow Waits
- Auth / Tenant / Event Access
- Campaign Readiness
- Invite / License / Seat Access
- Provider Failure Spike
- Job / Cron Freshness

Each should have targeted validation and a clear summary of changed files, tests run, known pre-existing failures, and any follow-up needed for Internal-app wiring.
