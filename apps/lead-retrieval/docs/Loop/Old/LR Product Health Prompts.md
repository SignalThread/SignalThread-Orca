# LR Product Health P0/P1 Monitoring — Opus Loop Prompt Doc

## Purpose

This document is the loop-ready prompt pack for adding the remaining **Lead Retrieval Admin** Product Health monitoring sources.

The existing **conversation lifecycle** Product Health check is already live, scheduled, wired into Internal-app, and healthy. Do **not** rebuild it. Treat it as the model for signed, safe, aggregate-only health endpoints.

The goal now is to add the remaining **P0** and **P1** Lead Retrieval health sources in the LR Admin repo so Internal-app can wire them in later.

## Repo

```bash
cd ~/Documents/lead\ retrieval\ app
```

Do not work in the mobile repo.
Do not work in Internal-app for this prompt pack.

## Current verified Product Health state

Product Health V1 is live for Lead Retrieval conversation lifecycle:

```text
Internal-app scheduled runner
→ signed request to LR Admin
→ LR conversation lifecycle health endpoint
→ aggregate health JSON
→ Internal-app stores system_health_snapshots
→ Product Health UI shows latest status/history
```

Current verified state:

```text
Status: HEALTHY
Latest run mode: scheduled
Cron: every 15 minutes
Cron route: GET /api/internal/product-health/run
Cron logs: 200
Workflow waits: 0
Readiness mismatches: 0
Total conversations: 1830
Issues: none
```

## Current LR testing/orchestration context from parallel testing work

There is a parallel LR testing branch/effort that must be preserved and respected when running these monitoring prompts. Do not overwrite, revert, or broaden this work unless a specific health prompt directly requires a small compatible change.

Known testing branch/work:

```text
test/core-journey-e2e-plan
```

Testing foundation already completed in the parallel effort:

- core journey matrix
- journey fixture/cleanup/assertion harness
- feature-level journey tests
- Golden Exhibitor Journey
- full coverage audit doc
- Playwright auto dev-server startup fix
- P0 node-test orchestration runner

Important known results from that effort:

```text
npm run test:journeys
84 pass / 1 skipped / 0 fail

npm run test:workflow
362 pass / 0 fail

npm run build
passed
```

P0 orchestration changes already implemented or expected to exist:

- `scripts/run-node-tests.mjs` discovers Node tests across `tests/`, `app/`, and `lib/`.
- It includes `.test.ts`, `.spec.ts`, and `.test.mjs` patterns.
- It excludes Playwright-style specs that import `@playwright/test`, currently including `tests/auth-load.spec.ts`.
- `tests/test-script-inventory.test.ts` verifies discovery and script wiring.
- `package.json` includes `test:node:all`, `test:playwright`, `test:verify`, updated `test:full`, and `test:e2e` as a Playwright alias.
- `playwright.config.ts` includes `baseURL` defaulting to `http://localhost:3000`, `webServer` using `npm run dev`, `reuseExistingServer: true`, `timeout: 180_000`, and excludes `e2e/example.spec.ts` from product Playwright runs.

Known current blockers exposed by real orchestration:

```text
npm run test:node:all currently runs the real discovered Node suite: about 236 files.
It currently fails with 14 pre-existing product-test failures.
npm run test:full also fails at test:node:all and does not reach Playwright/auth setup yet.
```

Known failing areas are stale/source-contract or pre-existing test issues, not Product Health monitoring work unless your prompt directly changes one of them:

- migration latestness/source-contract tests
- exhibitor viewer permissions expectations
- workflow signal/detail source expectations
- CRM conversation insight shape
- several `.mjs` tests importing exports that no longer exist

Known Playwright status:

- Playwright now starts/reuses the dev server correctly.
- `e2e/auth.setup.ts` reaches the app.
- Auth setup still fails because seeded sessions do not land on expected routes:
  - `platform_admin` times out waiting for `/admin`
  - `organizer_admin` times out waiting for `/app/organizer`
  - `exhibitor_admin` remains on `/login`

Do **not** chase or fix the Playwright auth setup issue inside Prompts 6–12 unless a health prompt directly touches test auth bypass/session seeding. That is a separate focused testing task.

Do **not** fix the 14 newly surfaced Node-suite failures as part of these Product Health prompts unless your health-monitoring changes caused one of them. Report them as pre-existing if they still fail.

Preserve the test orchestration files and scripts. If you must touch any of these files, explain exactly why in the summary and keep the change scoped:

- `package.json`
- `playwright.config.ts`
- `scripts/run-node-tests.mjs`
- `tests/test-script-inventory.test.ts`
- `tests/journeys/FULL_TEST_COVERAGE_AUDIT.md`
- journey harness/fixture files


Existing LR endpoint:

```text
GET /api/internal/health/lead-retrieval/conversation-lifecycle
```

It returns safe aggregate health only:

- conversation counts
- transcription/synthesis status counts
- readiness mismatches
- workflow waits
- issues
- status
- checkedAt

It must not return customer content, transcript text, audio URLs, row IDs, provider payloads, or repair mutations.

## Critical context from prior work

The first live check exposed a real monitoring bug and data-quality issue:

- Initial live check showed `CRITICAL` with 20 readiness mismatches.
- Root cause: the LR health endpoint was only reading Supabase’s default first 1,000 `lead_conversations` rows.
- Fix: paginate over all relevant conversation rows.
- Result dropped from 20 mismatches → 5.
- Filtering empty/no-speech transcripts dropped 5 → 1.
- Final stale readiness row was safely reconciled.
- Current result is healthy: readiness mismatches 0, workflow waits 0.

This means every new health source must be **row-count safe** and must not rely on implicit Supabase default limits when correctness requires full coverage.

## Non-negotiable execution mode

You are running in **Opus auto-approve loop mode**.

Proceed continuously through the prompt. Do not ask for acceptance, confirmation, review gates, or permission between steps. Do not stop after planning. Do not add manual approval checkpoints. Implement, test, and summarize.

Only stop for true critical blockers, such as:

- the task requires a destructive production data mutation
- the task requires exposing secrets or customer content
- the task requires changing the protected mobile capture/recording posting behavior
- the task requires a non-idempotent or unsafe migration that cannot be made safe
- the repo is in a state where continuing would clearly destroy unrelated user work
- required environment/secrets are missing and there is no safe local/test fallback

For normal uncertainty, inspect the code and make the safest production-quality implementation decision. Do not bounce the decision back to the user.

## Protected paths and boundaries

Mobile app was not touched in previous Product Health work and must remain untouched here.

Do **not** change:

- mobile lead creation payloads
- mobile recording upload payload shape
- additive recording semantics
- current recording UX
- mobile posting behavior
- Expo app routes/screens
- mobile Supabase client behavior

If you discover a real issue that appears to require touching mobile behavior, stop and report exactly why. Do not change mobile code.

These LR Admin prompts should be read-only health/monitoring work unless a migration is strictly needed to support safe monitoring metadata. Prefer no schema changes for LR Admin unless the existing data model cannot support the aggregate check.

## Safety rules for every LR health endpoint

Every endpoint added in this doc must be:

- signed/internal only, using the same signing approach as the existing conversation lifecycle health endpoint
- aggregate-only
- read-only
- deterministic
- scoped and performance-aware
- safe for production
- compatible with scheduled polling from Internal-app
- compatible with future snapshot storage

Never return:

- transcript text
- audio URLs
- raw recording URLs
- customer notes
- raw badge payloads
- lead names
- attendee names
- company-specific customer content
- email body content
- row-level IDs unless they are non-sensitive synthetic check IDs already used by monitoring
- provider payloads
- secrets
- stack traces in production responses

Do not perform repair mutations from health endpoints.
If a future repair path is needed, it must be a separate explicitly guarded repair flow, not part of these prompts.

## Shared health response contract

Use one shared contract/helper if the repo structure supports it. Avoid seven one-off shapes.

Recommended response shape:

```ts
type ProductHealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

type ProductHealthIssueSeverity = 'warning' | 'critical'

type ProductHealthIssue = {
  code: string
  severity: ProductHealthIssueSeverity
  message: string
  count?: number
  oldestAgeMinutes?: number
  threshold?: number
}

type LeadRetrievalHealthResponse = {
  product: 'lead-retrieval'
  source: string
  status: ProductHealthStatus
  checkedAt: string
  summary: string
  metrics: Record<string, number | string | boolean | null>
  issues: ProductHealthIssue[]
  window?: {
    recentMinutes?: number
    staleAfterMinutes?: number
  }
}
```

If the existing conversation lifecycle endpoint already has a slightly different shape, preserve backwards compatibility and extend through shared normalization rather than breaking the existing wired Internal-app client.

Status rules:

- `healthy`: no actionable issues
- `warning`: degraded or stale but not immediately event-floor blocking
- `critical`: event-floor capture/access/automation path is likely blocked or materially broken
- `unknown`: endpoint cannot determine health safely, usually due to missing optional table/feature in local dev; production should avoid unknown where possible

## Existing env vars relevant to signed health

Internal-app Vercel:

```text
CRON_SECRET=...
PRODUCT_HEALTH_CRON_SECRET=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
LEAD_RETRIEVAL_HEALTH_BASE_URL=https://lr.signalthread.ai
INTERNAL_HEALTH_SIGNING_SECRET=...
INTERNAL_APP_BASE_URL=https://internal-app-phi.vercel.app
PRODUCT_HEALTH_ALERT_WEBHOOK_URL=optional
```

LR Admin Vercel:

```text
INTERNAL_HEALTH_SIGNING_SECRET=same value as Internal-app
```

Do not print secret values.
Do not commit secrets.

## Validation requirements for every prompt

Before editing:

```bash
git status --short
```

If there are existing changes, preserve them. Do not reset, checkout, overwrite, or reformat unrelated testing/orchestration files. Work around existing branch state safely and report it.

Inspect existing patterns first:

- existing conversation lifecycle health endpoint
- existing signing verification helper
- existing Supabase server/service clients
- existing tests for internal health routes
- relevant table names and status enums before assuming schema
- `package.json` test scripts before choosing validation commands

Add targeted tests for each health source. Tests should prove:

- unsigned requests are rejected
- signed requests return the safe aggregate shape
- status calculation works for healthy/warning/critical cases where practical
- no customer content fields are exposed
- pagination/large-row coverage is safe where applicable

Prefer targeted deterministic tests over broad brittle snapshots. Health tests should be compatible with the new Node test runner discovery where applicable.

After implementation, run targeted validation first, then broader validation as far as the current repo state allows. Prefer:

```bash
node --import tsx --test <new-or-updated-health-test-file>
npm run typecheck
npm run build
```

Also run the relevant package script if it exists and is appropriate for the changed files, such as:

```bash
npm run test:node:all
npm run test:verify
npm run test:playwright -- --list
```

Current known reality: `npm run test:node:all` / `npm run test:full` may fail from pre-existing surfaced test failures unrelated to Product Health. Do not treat those as blockers for the health prompt unless your changes introduced or worsened the failure. Report the exact failures and identify them as pre-existing when supported by the current branch context.

Do not run broad Playwright auth setup as part of these prompts unless you changed auth/session/test bypass behavior. The known `e2e/auth.setup.ts` redirect/session failure is a separate focused task.

Do not invent passing results. Report exactly what ran and what passed/failed.

## Output required after each prompt

After each prompt, provide a concise implementation summary:

- files changed
- endpoints added/changed
- metrics tracked
- thresholds used
- tests added
- validation commands run and results
- any critical risks or follow-ups

Do not ask whether to continue unless a true critical blocker exists.

---

# Prompt 6 — LR P0 Capture + Recording Ingestion Health

## Goal

Add signed aggregate health monitoring for the event-floor capture path.

This answers:

```text
Can exhibitors capture leads and submit recordings during an event?
```

## Repo

```bash
cd ~/Documents/lead\ retrieval\ app
```

## Implement

Add a signed internal endpoint for capture and recording ingestion health.

Recommended route:

```text
GET /api/internal/health/lead-retrieval/capture-recording-ingestion
```

Use the existing internal health signing pattern from the conversation lifecycle endpoint.

## Track

Aggregate metrics should include, where the schema supports it:

- recent lead insert activity
- recent lead insert count over a short event-floor window, such as 15/30/60 minutes
- recent recording upload activity
- recordings accepted by server/API
- recording rows created
- conversation rows created after recording upload
- recordings entering transcription pipeline
- recordings stuck before transcription begins
- upload/conversation creation failures if logged in existing tables
- oldest pending ingestion age
- event/company scoped counts where safe and useful

## Health logic

Treat this as **P0**.

A `critical` status is appropriate when evidence indicates the active capture/recording ingestion path is blocked, such as:

- recent recording uploads exist but no corresponding conversation rows are being created
- recordings remain pending before transcription beyond the configured threshold
- ingestion failure counts spike in the recent window
- capture inserts are failing according to available server logs/tables

A `warning` status is appropriate when:

- activity is stale but not enough evidence proves breakage
- old pending records exist but count/age is low
- optional telemetry is unavailable locally but endpoint can still report partial health

A `healthy` status is appropriate when:

- recent capture/recording flow has no pending/stuck ingestion beyond thresholds
- failure counts are zero or below warning threshold
- no upload-to-conversation gap is detected

Do not mark lack of recent lead creation as critical by itself unless the system has active-event context proving there should be activity. Low traffic is not automatically an outage.

## Important implementation details

Use actual schema names from the repo. Do not assume table names. Inspect migrations/types/API routes for recording upload, lead creation, conversation creation, and transcription queue behavior.

Do not modify the mobile capture or recording payloads.
Do not change mobile upload semantics.
Do not change additive recording UX.
Do not add repair mutations.

If needed, add shared helper functions under an internal health/lib folder so later P0/P1 checks can reuse:

- status calculation
- safe issue formatting
- date/age calculation
- paginated Supabase reads or count helpers
- response sanitization

## Tests

Add targeted tests for:

- signed endpoint auth
- response shape
- healthy state
- pending/stuck ingestion state
- no sensitive fields in response
- row-count/pagination safety if full-table reads are required

## Done means

- endpoint exists and is signed/internal only
- endpoint returns aggregate-only safe JSON
- endpoint detects capture/recording ingestion blockers
- no mobile repo/files touched
- tests and validation pass or failures are clearly reported

---

# Prompt 7 — LR P0 Workflow Waits Health

## Goal

Add a dedicated signed aggregate health endpoint for workflow waits and blocked automation handoffs.

This answers:

```text
Are automations blocked after capture?
```

## Repo

```bash
cd ~/Documents/lead\ retrieval\ app
```

## Implement

Add a signed internal endpoint for workflow wait health.

Recommended route:

```text
GET /api/internal/health/lead-retrieval/workflow-waits
```

This is separate from the existing conversation lifecycle endpoint. The existing endpoint can keep reporting workflow waits as part of lifecycle, but this prompt should create the dedicated source needed by Product Health.

## Track

Aggregate metrics should include, where available:

- total active workflow waits
- waits by reason/type
- waits waiting on audio
- waits waiting on conversation creation
- waits waiting on transcript/transcription
- waits waiting on insights/synthesis
- waits waiting on campaign handoff if applicable
- oldest wait age
- stuck handoff count
- blocked automation count
- recent wait creation count
- recent wait resolution count if available

## Health logic

Treat this as **P0**.

A `critical` status is appropriate when:

- active waits exceed threshold and oldest wait age is beyond event-floor tolerance
- waits are accumulating with no recent resolutions
- a known required workflow stage is blocked for many records
- automation handoffs are stuck beyond threshold

A `warning` status is appropriate when:

- low count of stale waits exists
- wait count is elevated but still resolving
- only non-critical/terminal waits exist

A `healthy` status is appropriate when:

- active waits are zero or below threshold
- oldest wait age is within tolerance
- no blocked automation evidence exists

## Important implementation details

Inspect existing workflow runner/tick/reconciler code before choosing table names or statuses.

Do not change workflow execution behavior unless a tiny bug fix is strictly required for health calculation and is covered by tests. Prefer read-only aggregation.

If existing workflow wait definitions are scattered, add a small canonical health classifier helper for wait reason/status grouping rather than duplicating logic inside the route.

## Tests

Add targeted tests for:

- signed endpoint auth
- wait grouping by reason/type
- oldest wait age calculation
- healthy/warning/critical status calculation
- safe aggregate response with no row/customer content exposure

## Done means

- dedicated workflow waits endpoint exists
- it safely reports P0 workflow wait health
- it does not alter workflow execution semantics
- tests and validation pass or failures are clearly reported

---

# Prompt 8 — LR P0 Auth / Tenant / Event Access Health

## Goal

Add signed aggregate health monitoring for access readiness across auth, tenant scope, and event access.

This answers:

```text
Can the right users get into the right event/company during showtime?
```

## Repo

```bash
cd ~/Documents/lead\ retrieval\ app
```

## Implement

Add a signed internal endpoint for auth / tenant / event access health.

Recommended route:

```text
GET /api/internal/health/lead-retrieval/access-readiness
```

## Track

Aggregate metrics should include, where the schema supports it:

- active users with missing company context
- users with invalid or missing role values
- active event access rows
- event_users/member access counts
- users assigned to companies without active event access
- event access rows pointing to missing users/companies/events
- role/RLS mismatch indicators
- company/event scoping gaps
- login/access failures if available from existing logs/tables
- users without valid event/company context
- active events with no valid exhibitor access rows, where applicable

## Health logic

Treat this as **P0**.

A `critical` status is appropriate when:

- valid users for active/showtime events cannot be scoped to company/event
- active event access is materially missing or broken
- role mismatches would block expected exhibitor access
- orphaned/missing access rows indicate real login/event access failure risk

A `warning` status is appropriate when:

- small numbers of stale/orphaned access rows exist but do not clearly block active events
- optional login failure telemetry is missing
- non-active/future/past events have access gaps

A `healthy` status is appropriate when:

- active users have valid company/event context
- active event access rows are consistent
- no role/scope mismatch indicators are found

## Important implementation details

This touches high-risk auth/RBAC/access territory. Follow the project standard:

- server-side truth only
- narrow queries
- no UI-only assumptions
- no broad auth refactors
- no RLS changes unless absolutely necessary and tested

Inspect:

- users table
- event_users / memberships table
- companies/events/licenses relationships
- route guards and RBAC helpers
- existing role enums
- existing RLS-sensitive access helpers

Do not change user roles, access rows, RLS, invites, or licenses as part of a health endpoint unless a tiny schema/type bug must be fixed to compile. This prompt is primarily read-only monitoring.

## Tests

Add targeted tests for:

- signed endpoint auth
- missing company context aggregate
- invalid role aggregate
- event access gap aggregate
- healthy/warning/critical status calculation
- no sensitive user/customer data in response

## Done means

- access readiness endpoint exists
- it reports aggregate access risk without leaking user-level data
- it does not change auth/RBAC behavior
- tests and validation pass or failures are clearly reported

---

# Prompt 9 — LR P1 Campaign Readiness Health

## Goal

Add signed aggregate health monitoring for campaign and follow-up readiness.

This answers:

```text
Can captured leads be used for follow-up/campaigns?
```

## Repo

```bash
cd ~/Documents/lead\ retrieval\ app
```

## Implement

Add a signed internal endpoint for campaign readiness health.

Recommended route:

```text
GET /api/internal/health/lead-retrieval/campaign-readiness
```

## Track

Aggregate metrics should include, where available:

- campaign draft generation success/failure counts
- campaign draft generation failures in recent window
- stuck campaign drafts
- stuck campaign messages
- campaigns blocked before ready state
- recipient eligibility counts
- leads eligible for campaign handoff
- lead-to-campaign handoff gaps
- messages missing required generated content
- send/readiness blockers
- provider/send-prep failure indicators if implemented

## Health logic

Treat this as **P1**.

A `critical` status is appropriate only when campaign readiness is broadly blocked for active/recent use, such as:

- widespread draft generation failures
- campaigns stuck in a state that prevents follow-up across many records
- recipient eligibility is broken due to access/scope/data issue

A `warning` status is appropriate when:

- some draft/message generation failures exist
- stale drafts/messages exist beyond threshold
- handoff health is degraded but core capture still works

A `healthy` status is appropriate when:

- no meaningful stuck drafts/messages exist
- generation failures are zero or below threshold
- recipient eligibility logic appears usable

## Important implementation details

Inspect campaign routes/services before implementing:

- `/api/campaigns`
- campaign generation routes
- recipients routes
- messages routes
- campaign status enums
- Signal Library usage in campaign drafts

Do not rewrite campaign builder UX.
Do not alter recipient eligibility rules unless an existing test-covered bug must be fixed.
Do not integrate SendGrid here unless already present and needed for aggregate readiness.

## Tests

Add targeted tests for:

- signed endpoint auth
- draft generation failure aggregation
- stuck draft/message aggregation
- recipient eligibility aggregate
- healthy/warning/critical status calculation
- no email/customer content leakage

## Done means

- campaign readiness endpoint exists
- it reports aggregate P1 campaign/follow-up readiness
- campaign behavior is not rewritten
- tests and validation pass or failures are clearly reported

---

# Prompt 10 — LR P1 Invite / License / Seat Access Health

## Goal

Add signed aggregate health monitoring for onboarding/access capacity.

This answers:

```text
Can exhibitors get access before/during the event?
```

## Repo

```bash
cd ~/Documents/lead\ retrieval\ app
```

## Implement

Add a signed internal endpoint for invite/license/seat access health.

Recommended route:

```text
GET /api/internal/health/lead-retrieval/invite-license-seat-access
```

## Track

Aggregate metrics should include, where schema supports it:

- active license presence
- active licenses by status
- expired licenses tied to active/future events
- missing licenses for active/future event/company assignments
- seat exhaustion count
- licenses at or above capacity
- licenses near capacity
- pending invite count
- pending invite age buckets
- invite redemption failure indicators if available
- invites tied to missing/expired licenses
- event/company assignment gaps
- orphaned invite/access rows

## Health logic

Treat this as **P1**.

A `critical` status is appropriate when:

- active/future event exhibitors cannot onboard because licenses are missing/expired/exhausted
- seat enforcement appears to block legitimate access broadly
- invite redemption is failing at high rate if telemetry exists

A `warning` status is appropriate when:

- licenses are near capacity
- old pending invites are building up
- expired/missing licenses affect non-active events
- isolated assignment gaps exist

A `healthy` status is appropriate when:

- active/future access capacity looks valid
- no seat exhaustion for current event access
- pending invite buildup is within threshold

## Important implementation details

This is high-risk business-rule territory. Do not create parallel seat/license enforcement logic. The endpoint should observe canonical server-side truth, not invent new rules.

Inspect existing canonical functions/routes for:

- license enforcement
- seat consumption
- invite redemption
- event/company assignment
- users/event_users relationships

Do not change seat enforcement behavior unless a tiny existing bug must be fixed and tested.
Do not mutate invites/licenses/access rows.
Do not rely on derived counters as authority if canonical rows exist.

## Tests

Add targeted tests for:

- signed endpoint auth
- license missing/expired aggregate
- seat exhausted/near-capacity aggregate
- pending invite buildup aggregate
- healthy/warning/critical status calculation
- no user/email/customer data leakage

## Done means

- invite/license/seat access health endpoint exists
- it observes canonical access/capacity truth
- it does not alter onboarding behavior
- tests and validation pass or failures are clearly reported

---

# Prompt 11 — LR P1 Provider Failure Spike Health

## Goal

Add signed aggregate health monitoring for AI/provider failure spikes.

This answers:

```text
Are AI/provider failures spiking even if the core app is online?
```

## Repo

```bash
cd ~/Documents/lead\ retrieval\ app
```

## Implement

Add a signed internal endpoint for provider failure spike health.

Recommended route:

```text
GET /api/internal/health/lead-retrieval/provider-failure-spikes
```

## Track

Aggregate metrics should include, where available:

- transcription failures in recent windows
- transcription failure rate
- synthesis/insights failures in recent windows
- synthesis failure rate
- OpenAI/provider failure counts
- provider timeout/rate-limit/auth failure indicators if logged
- empty/no-speech counts
- empty/no-speech rate
- terminal vs actionable failure counts
- recent successful transcription count
- recent successful synthesis count
- failure rate trend over 15/60/180 minute windows where practical

## Health logic

Treat this as **P1**.

A `critical` status is appropriate when:

- provider failures are high enough to make AI functionality broadly unavailable
- recent success count drops to zero while attempts continue
- provider auth/rate-limit errors indicate system-wide failure

A `warning` status is appropriate when:

- failure rate is elevated but successes continue
- empty/no-speech spikes need attention but may be legitimate floor noise/no-audio cases
- isolated provider errors occur below critical threshold

A `healthy` status is appropriate when:

- failure rate is below threshold
- successes continue
- empty/no-speech rate is within expected tolerance

## Important implementation details

The existing conversation lifecycle endpoint already learned to separate empty/no-speech from real actionable failure. Reuse that classification if possible.

Do not treat legitimate no-speech/empty transcripts as provider outages by default. Report them separately.

Do not return provider payloads, prompts, transcripts, audio references, or raw error bodies. Aggregate error classes only.

## Tests

Add targeted tests for:

- signed endpoint auth
- provider failure aggregation
- terminal vs actionable failure classification
- no-speech/empty classification
- healthy/warning/critical threshold calculation
- no provider/customer content leakage

## Done means

- provider failure spike endpoint exists
- it separates actionable provider failures from no-speech/empty cases
- it returns aggregate-only safe JSON
- tests and validation pass or failures are clearly reported

---

# Prompt 12 — LR P1 Job / Cron Freshness Health

## Goal

Add signed aggregate health monitoring for LR background jobs and cron freshness.

This answers:

```text
Are LR’s own internal jobs actually running?
```

## Repo

```bash
cd ~/Documents/lead\ retrieval\ app
```

## Implement

Add a signed internal endpoint for job/cron freshness health.

Recommended route:

```text
GET /api/internal/health/lead-retrieval/job-cron-freshness
```

## Track

Aggregate metrics should include, where available:

- workflow tick freshness
- reconciler freshness
- last successful background job run
- last failed background job run
- job failure counts in recent windows
- cron heartbeat gaps
- stale background processing indicators
- jobs currently overdue
- jobs with repeated failures
- queued work age if queues exist

## Health logic

Treat this as **P1**, but allow `critical` if background processing is clearly stopped and would block event-floor outcomes.

A `critical` status is appropriate when:

- required LR background jobs have not run beyond critical freshness threshold
- workflow ticks/reconcilers are stale while pending work exists
- repeated job failures indicate background processing is unavailable

A `warning` status is appropriate when:

- job freshness is stale but not beyond critical threshold
- isolated failures exist but later success occurred
- optional job heartbeat telemetry is unavailable and fallback checks are partial

A `healthy` status is appropriate when:

- required jobs are fresh
- last success is within threshold
- failure counts are below warning threshold

## Important implementation details

Inspect existing cron/job routes and Vercel cron config before adding anything:

- workflow tick route
- reconciler route
- any scheduled job route handlers
- job logs/heartbeat tables if present
- Vercel cron config if present

Do not create a new scheduler unless the repo already has no way to observe existing jobs and the smallest safe implementation is a heartbeat. Prefer observing existing logs/tables/status fields.

If heartbeat metadata is needed, make the migration idempotent and safe. Do not add non-idempotent migrations.

Do not mutate job state from the health endpoint.

## Tests

Add targeted tests for:

- signed endpoint auth
- fresh job state
- stale job state
- failed job state
- pending work plus stale job critical calculation
- safe aggregate response

## Done means

- job/cron freshness endpoint exists
- it reports LR background job freshness safely
- it does not alter job execution behavior
- tests and validation pass or failures are clearly reported

---

# End-state after Prompt 12

After these LR prompts, LR Admin should expose signed aggregate health endpoints for:

```text
P0
- conversation lifecycle                 existing, do not rebuild
- capture + recording ingestion          Prompt 6
- workflow waits                         Prompt 7
- auth / tenant / event access           Prompt 8

P1
- campaign readiness                     Prompt 9
- invite / license / seat access         Prompt 10
- provider failure spikes                Prompt 11
- job / cron freshness                   Prompt 12
```

Then Internal-app can wire them in later:

```text
Prompt 13 — Wire P0 Health Sources into Product Health
Prompt 14 — Wire P1 Health Sources into Product Health
Prompt 15 — Redesign Product Health Home + LR Detail IA
```

Do not implement Prompts 13–15 from this LR Admin prompt pack.
