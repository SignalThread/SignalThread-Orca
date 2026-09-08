# LR Coverage Matrix

> Prompt 1 of `docs/Loop/TESTING_PROMPTS.md`. Columns are the plan's Coverage Matrix
> Template verbatim (`LR_TEST_PLAN_V3.md` → *Coverage Matrix Template*).
> Baseline as of 2026-08-10. See `BASELINE_AUDIT.md` for method and headline findings.
>
> This matrix records **what is true today**, not what is planned. Every subsequent
> prompt updates the rows it touches. A cell that improves must be accompanied by a named
> test in the Test IDs column.

## Legend

| Code | Meaning |
|---|---|
| `E2E` | proven in a real browser (Playwright) |
| `API` | proven by invoking a route handler / service against real code |
| `U` | proven by a unit test against the real function |
| `DEV` | written as a Maestro device flow, **not executed** — no simulator in this environment |
| `~src` | **weaker claim** — asserts product source text read off disk, not behavior |
| `~fake` | **weaker claim** — proven only against the in-memory `fake-supabase` shim |
| `~gated` | test exists but is skipped by default (e.g. `JOURNEY_LIVE_DB!=1`) |
| `✗` | no coverage |
| `DB*` | written as a real database test, **not executed** — no test Supabase project exists (finding LR-INF-001) |
| `n/a — <reason>` | not applicable, with the reason |

`DB*` is **not coverage either**, for the same reason `DEV` is not: the test exists and is
committed, but nothing has observed it pass. The runner reports both as `not-run`.

`~src`, `~fake` and `~gated` are **not coverage**. They are listed so the gap is explicit
rather than invisible. Per plan §79 they are worse than a blank cell, because they read
as green.

Cells marked `✗` are all test gaps owned by the prompt named in the row's **Owner**
column, due at that prompt's completion.

---

## Cross-cutting state of the baseline

Applies to every row below, so it is stated once rather than repeated 34 times:

- **RLS/API security** — no test in either repo authenticates as a role and queries
  Postgres. Every `rls` cell below is `✗` or `~src`, without exception. Owner: Prompt 4.
- **Persistence** — live-database round-trips exist only behind `JOURNEY_LIVE_DB=1`,
  which is unset everywhere. Every `persistence` cell reading `~gated` means the test is
  written but does not run. Owner: Prompts 2 and 4.
- **Concurrency** — no test in either repo exercises two simultaneous actors. Owner:
  Prompt 14.
- **Accessibility** — deferred wholesale by plan v3.1 §60. Every cell reads
  `n/a — deferred v3.1`.
- **Visual** — no screenshot baseline exists in either repo. Plan v3.1 §61 scopes this to
  five screens; those five are marked `✗`, the rest `n/a — descoped v3.1`.
- **Production synthetic** — `scripts/canaries/` exists and is run manually. Nothing is
  asserted post-deploy. Owner: Prompt 14.
- **Migration impact** — no test asserts behavior across a schema upgrade. Owner:
  Prompt 12.

---

## Matrix

| Feature / Action | Canonical rule owner | Roles | Company scope | Event scope | Lifecycle | Data states | Offline/network | Retry/idempotency | Concurrency | Persistence | RLS/API security | Web | Mobile | Cross-surface | Provider | Performance | Accessibility | Visual | Migration impact | Production synthetic | Severity | Test IDs | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sign in / session resolve | `lib/auth/session.ts` | `U` partial | ✗ | ✗ | ✗ | `U` | n/a — web | ✗ | ✗ | `~gated` | ✗ | `E2E` | `U` | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P0 | `e2e/auth.spec.ts`, `e2e/login-otp-smoke.spec.ts`, `tests/login-role-not-configured.test.ts` | P4 |
| Session expiry / refresh / revoke | `lib/auth/session.ts` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `U` | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P0 | `MOBILE/lib/auth/*.test.ts` | P4 |
| Invite issue / redeem / expire | `lib/exhibitor/exhibitor-invite-role.ts` | `U` | `~src` | ✗ | `U` | `U` | n/a | ✗ | ✗ | `~gated` | ✗ | `~src` | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P0 | `tests/invite-lifecycle.test.ts`, `tests/invite-redeem-plan.test.ts`, `tests/company-scoped-invite.test.ts` | P4 |
| Role normalization (`exhibitor_viewer` etc.) | `lib/auth/role-scope.ts` | `U` | ✗ | ✗ | n/a | `U` | n/a | n/a | n/a | n/a | ✗ | `~src` **RED** | `U` | ✗ | n/a | n/a | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P0 | `tests/exhibitor-app-access-web-entry.test.ts` (failing), `tests/users-role-exhibitor-viewer-migration.test.ts` | P4 |
| Platform-admin account context switch | `lib/auth/session.ts` | `U` | `~src` | ✗ | ✗ | ✗ | n/a | n/a | ✗ | ✗ | ✗ | `~src` | n/a | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P0 | `tests/access-matrix-surfaces.test.ts` | P4 |
| Cross-company read denial | `lib/server/company-event-access.ts` | ✗ | `~src` | ✗ | n/a | ✗ | n/a | n/a | ✗ | ✗ | ✗ | `~src` | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `tests/cross-tenant-resource-isolation.test.ts` (5/6 `~src`) | P4 |
| Cross-company mutation denial | `lib/server/company-event-access.ts` | `API` | `API` | ✗ | n/a | ✗ | n/a | ✗ | ✗ | `API` | `API` | `API` | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `tests/isolation/email-templates-tenant-isolation.test.ts` — 12 behavioral tests, drill-verified | P4 |
| Cross-event isolation — leads | `lib/server/company-event-access.ts` | ✗ | ✗ | `~src` | ✗ | ✗ | n/a | ✗ | ✗ | `~gated` | ✗ | `~src` | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `tests/imported-lead-event-scope-contract.test.ts` (4/4 `~src`) | P4 |
| Cross-event isolation — import publish | `lib/import-wizard/` | ✗ | ✗ | `~src` | ✗ | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | `~src` | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `tests/publish-leads-materialization-scope.test.ts` (9/9 `~src`) — plan note A | P4 |
| AI Briefing Strategy is company-level, not event-level | `lib/events/briefing-strategy` | ✗ | ✗ | `U` | ✗ | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | `U` | n/a | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/event-briefing-strategy-merge.test.ts` | P4 |
| RLS policy enforcement (all tables) | `supabase/migrations/*.sql` | `DB*` | `DB*` | `DB*` | n/a | n/a | n/a | n/a | ✗ | ✗ | `DB*` | n/a | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `tests/db/rls-enforcement.test.ts` — **written, NOT RUN**, blocked by LR-INF-001 | P4 |
| Seat / license claim and release | `lib/server/event-user-access.ts` | `U` | `U` | `U` | `U` | `U` | n/a | ✗ | ✗ | `~gated` | ✗ | `U` | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/internal-health-invite-license-seat-access.test.ts`, `e2e/licenses.spec.ts` | P4 |
| Lead capture (mobile QR / manual) | `MOBILE/lib/capture/` | `U` | `U` | `U` | `U` | `U` | `U` | `U` | ✗ | ✗ | ✗ | n/a | `U`+`DEV` | ✗ | n/a | ✗ | n/a — deferred v3.1 | ✗ | ✗ | ✗ | P1 | `MOBILE/lib/capture/*.test.ts` (18 files), `.maestro/flows/subflows/mobile_smoke_manual_capture.yaml` | P6 |
| Badge template learning isolation | `MOBILE/lib/capture/` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | ✗ — plan §35 v3 addition, zero coverage | P6 |
| Lead create (web) | `app/api/exhibitor/leads/create` | ✗ | `~src` | `~src` | ✗ | `U` | n/a | `~src` | ✗ | `~gated` | ✗ | `~src` | n/a | `~src` | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/journeys/lead-create.e2e.test.ts` | P5 |
| Lead update / rating → priority | `lib/leads/temperature.ts` | ✗ | ✗ | ✗ | n/a | `U` | n/a | ✗ | ✗ | `~gated` | ✗ | `U` | `U` | `~src` | n/a | ✗ | n/a — deferred v3.1 | ✗ | ✗ | ✗ | P1 | `tests/journeys/lead-update.e2e.test.ts`, `MOBILE` lead tests | P5 |
| Lead delete (hard) | `lib/server/exhibitorLeadDelete.ts` | ✗ | `U` | `U` | n/a | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `tests/exhibitor-lead-delete-partition.test.ts` — no DB end-state assertion | P4 |
| Import — source detection and mapping | `lib/import-wizard/field-mapping` | ✗ | ✗ | ✗ | n/a | `U` | n/a | ✗ | ✗ | n/a | ✗ | `U` | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | ✗ | ✗ | ✗ | P1 | `tests/field-mapping-derive.test.ts`, `tests/custom-field-mapping.test.ts` | P5 |
| Import — Full Name preservation (`Sarah Meister`) | `lib/import-wizard/field-mapping` | n/a | n/a | n/a | n/a | ✗ | n/a | n/a | n/a | n/a | n/a | n/a | ✗ | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | ✗ — plan note D, no dedicated regression | P5 |
| Import — readiness vs server validation parity | `lib/import-wizard/` | ✗ | ✗ | ✗ | n/a | `U` | n/a | ✗ | ✗ | n/a | ✗ | `~src` | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | ✗ | ✗ | ✗ | P1 | `tests/import-batch-validation-derive.test.ts` — plan note E | P5 |
| Import — file security (formula injection, oversize) | `lib/import-wizard/` | n/a | ✗ | ✗ | n/a | ✗ | n/a | ✗ | ✗ | n/a | ✗ | ✗ | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | ✗ — plan §52, zero coverage | P5 |
| Autosave — AI Briefing Strategy partial update | `lib/events/briefing-strategy` | ✗ | ✗ | `U` | n/a | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | ✗ — plan note B, **no dedicated regression despite being a shipped defect** | P5 |
| Event create — field parity incl. Location | `app/admin/events/new/actions.ts` | ✗ | ✗ | ✗ | `U` | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P2 | ✗ — plan note J | P5 |
| Event switcher navigation from Create Event | `components/layout/` | ✗ | ✗ | ✗ | ✗ | n/a | n/a | n/a | n/a | n/a | n/a | ✗ | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P2 | ✗ — plan note F | P5 |
| Zero-event exhibitor onboarding | `components/app/no-active-event-entry` | ✗ | ✗ | `U` | `U` | ✗ | n/a | n/a | n/a | n/a | ✗ | `E2E` | ✗ | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P2 | `e2e/exhibitor-zero-event-onboarding.spec.ts` — plan note G | P5 |
| Filters render actual rows and counts | `components/exhibitor/leads/` | ✗ | ✗ | ✗ | n/a | ✗ | n/a | n/a | ✗ | ✗ | n/a | `~src` | ✗ | n/a | n/a | ✗ | n/a — deferred v3.1 | ✗ | ✗ | ✗ | P2 | `tests/admin-users-filters.test.ts`, `tests/exhibitor-leads-filter-ui-contract.test.ts` (4/4 `~src`) — plan note I | P5 |
| Lead export scope and format | `lib/leads/export` | `U` | `U` | `U` | n/a | `U` | n/a | ✗ | ✗ | `~gated` | ✗ | `U` | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/leads-export-*.test.ts` (6 files) — healthiest area in the repo | P5 |
| Offline capture → outbox drain | `MOBILE/lib/sync/` | ✗ | ✗ | `U` | ✗ | `U` | `U` | `U` | ✗ | ✗ | n/a | n/a | `U`+`DEV` | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `MOBILE/lib/sync/*.test.ts` (14 files), `.maestro/flows/subflows/e2e_offline_capture_reconnect.yaml` | P6 |
| Outbox dependency ordering (lead before audio) | `MOBILE/lib/sync/` | n/a | ✗ | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | n/a | n/a | n/a | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | ✗ — plan §72 | P6 |
| Local SQLite migration with pending outbox rows | `MOBILE/lib/local-db/initLocalDb.ts` | n/a | n/a | n/a | n/a | ✗ | ✗ | ✗ | n/a | n/a | n/a | n/a | `U` v4→v5 only | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `MOBILE/lib/local-db/initLocalDb.test.ts` — v1–v3 paths do not exist in code | P6 |
| Device handover (User A → User B) | `MOBILE/lib/local-db/wipeLocalCaches.ts` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | n/a | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | ✗ — plan §72, zero coverage | P6 |
| Audio recording device mechanics | `MOBILE/lib/audio/` | n/a | n/a | ✗ | n/a | `U` | `U` | `U` | ✗ | n/a | n/a | n/a | `U`+`DEV` | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | 17 `MOBILE` audio files, 50 clean cases | P7 |
| Recording-to-lead binding (record on A, navigate to B) | `MOBILE/lib/audio/` | n/a | ✗ | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | n/a | n/a | n/a | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | ✗ — plan §69, **prior production defect, no regression test** | P7 |
| Chunked audio upload / resume / abort | `app/api/.../conversation upload` | ✗ | `~src` | `~src` | n/a | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `~src` | n/a | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/conversation-chunked-upload-route.test.ts` (7/10 `~src`) | P7 |
| Conversation processing state machine | `lib/conversations/conversation-lifecycle.ts` | ✗ | ✗ | ✗ | `U` | `U` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/conversation-processing-lifecycle.test.ts` (4/16 `~src`) | P7 |
| Failure classification before retry | `lib/conversations/` | n/a | ✗ | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | n/a | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | ✗ — plan §69, bulk reprocess is currently unguarded | P7 |
| Conversation intelligence read model | `lib/conversations/conversation-intelligence-read-model.ts` | ✗ | `~src` | `~src` | ✗ | `~src` | n/a | n/a | ✗ | ✗ | ✗ | `~src` | n/a | ✗ | n/a | ✗ | n/a — deferred v3.1 | ✗ | ✗ | ✗ | **P0** | 88 `~src` cases across `tests/brief*`, `tests/*intelligence*` — highest weak concentration | P8 |
| **Read-source provenance (canonical vs fallback)** | `lib/testing/provenance.ts` **[P3]** | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `U` | `U` | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `tests/seams/seam-behavior.test.ts` — seam built; read paths adopt it in P8 | P8 |
| Dashboard counts reconcile to authoritative rows | `lib/server/event-workspace-*-data.ts` | ✗ | ✗ | `~src` | `U` | `~src` | n/a | n/a | ✗ | ✗ | ✗ | `~src` | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | ✗ | ✗ | ✗ | P1 | 60 `~src` cases in `tests/event-workspace-page.test.ts`, `tests/*command-center*` | P8 |
| Workflow trigger match / no-match | `lib/workflows/trigger-rules/` | ✗ | ✗ | `U` | `U` | `U` | n/a | `U` | ✗ | `~gated` | ✗ | `U` | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/workflow-trigger-resolver.test.ts`, `tests/workflow-trigger-rule-ui-config.test.ts` (60/65 real) | P9 |
| Workflow single-tick claim guarantees | `lib/workflows/runner/claim-next-step.ts` | n/a | ✗ | ✗ | n/a | ✗ | n/a | `U` | ✗ **cron/kick overlap reachable** | ✗ | ✗ | n/a | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/workflow-create-run-idempotency.test.ts` — no CAS race test; **no lease-expiry reset exists** | P9 |
| Missing optional conversation context ≠ fatal | `lib/workflows/step-handlers/` | n/a | n/a | ✗ | n/a | `U` | n/a | n/a | n/a | n/a | ✗ | n/a | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | partial — plan note C | P9 |
| Campaign draft signs as initiating user | `lib/campaigns/` | ✗ | ✗ | ✗ | n/a | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | `~src` | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/campaign-generate-draft-route.test.ts` (8/8 `~src`) — plan note H | P9 |
| Campaign send — exact recipient set, no duplicates | `lib/campaigns/` | ✗ | ✗ | ✗ | `U` | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | `~src` | n/a | n/a | ✗ | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `tests/campaign-send-status.test.ts`, `tests/campaign-send-route.test.ts` | P9 |
| Signal library CRUD + permission parity | `app/api/signals/` | `U` | `U` | `U` | n/a | `U` | n/a | ✗ | ✗ | ✗ | ✗ | `E2E` | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P2 | `tests/signal-create-payload.test.ts`, `e2e/signals.spec.ts` — only 2 `~src` cases | P9 |
| Google OAuth — ticket contract, state, PKCE | `lib/integrations/mobile-oauth/` | ✗ | `~src` | n/a | n/a | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `~src` | ✗ | ✗ | ✗ | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `tests/mobile-oauth-bridge.test.ts` (15 cases, `~src`), `tests/google-oauth-routes.test.ts` | P10 |
| Google token refresh / lease / reconnect-required | `lib/integrations/google/token-manager.ts` | n/a | ✗ | n/a | n/a | `U` | ✗ | `U` | `U` | ✗ | ✗ | n/a | ✗ | n/a | `U` | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/google-token-manager.test.ts` (16/17 genuine DI tests — a model to copy) | P10 |
| Gmail send — From, Reply-To, MIME | `lib/integrations/google/gmail-client.ts` | ✗ | ✗ | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | n/a | `U` | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | 20 cases, 4 `~src`; no recorded-replay fixtures | P10 |
| Calendar availability, 2-week horizon, DST | `lib/integrations/google/calendar-client.ts` | ✗ | ✗ | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | ✗ | `~src` | ✗ | n/a — deferred v3.1 | ✗ | ✗ | ✗ | P1 | `tests/google-calendar-contract.test.ts` (7/7 `~src`) — blocked on injectable clock | P10 |
| Follow-up create / update / clear | `lib/follow-ups/lead-follow-up-service.ts` | ✗ | ✗ | ✗ | n/a | `U` | ✗ | `U` | ✗ | `~gated` | ✗ | `U` | `U` | ✗ | ✗ | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/lead-follow-up-service.test.ts` (7/8 genuine) | P10 |
| AI prompt assembly scope containment | `lib/campaigns/signal-prompt-composer.ts` | n/a | ✗ | ✗ | n/a | ✗ | n/a | ✗ | n/a | n/a | ✗ | n/a | n/a | ✗ | ✗ | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | ✗ — plan §70, no prompt snapshot exists | P11 |
| Model pinning / drift detection | `lib/campaigns/llm-draft-generator.ts` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✗ | n/a | n/a | n/a | ✗ | n/a | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | ✗ — `OPENAI_MODEL` defaults to `gpt-4o-mini` at line 38, unpinned and unasserted | P11 |
| API route inventory — auth/scope/validation | all `app/api/**/route.ts` | ✗ | `~src` | `~src` | n/a | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | `~src` | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `tests/route-contracts.test.ts` (**RED**), 41/79 `~src` — no inventory gate | P12 |
| Middleware policy parity | `middleware.ts` | ✗ | ✗ | ✗ | n/a | n/a | n/a | n/a | n/a | n/a | ✗ | ✗ | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | ✗ — plan §49 v3; **the one production OAuth outage came from here** | P12 |
| Inbound webhook signature / replay | `app/api/webhooks/` | n/a | ✗ | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | n/a | n/a | ✗ | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | ✗ — plan §48 | P12 |
| Outbound webhook / CRM payload scope | `lib/integrations/outbound` | n/a | ✗ | ✗ | n/a | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | n/a | ✗ | ✗ | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | ✗ — plan §74; HubSpot/ZoomInfo tests cover connect/disconnect only | P12 |
| Migration sequence integrity (0076 gap legitimate) | `supabase/migrations/` | n/a | n/a | n/a | n/a | n/a | n/a | `U` idempotent | n/a | n/a | ✗ | n/a | n/a | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | ✗ — verified by hand this prompt (0001–0097, only 0076 missing); no automated assertion | P12 |
| Generated types vs live schema | `types/database.ts` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✗ | n/a | n/a | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P1 | `tests/schema-contract.test.ts` — does not compare against a live database | P12 |
| Shipped-client contract replay | — none yet | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✗ | n/a | ✗ | ✗ | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | ✗ — plan §73, no frozen snapshot per store binary | P12 |
| Bypass flags reject in production | 9 flags, see audit §6 | ✗ | ✗ | ✗ | n/a | n/a | n/a | n/a | n/a | n/a | ✗ | ✗ | ✗ | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | `tests/e2e-auth-bypass-policy.test.ts`, `tests/apple-review-login-policy.test.ts` — both `~src`, neither asserts production rejection | P13 |
| IDOR / XSS / CSRF / SSRF / formula injection | various | ✗ | ✗ | ✗ | n/a | ✗ | n/a | n/a | n/a | n/a | ✗ | ✗ | ✗ | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | ✗ — plan §53, zero hand-written security cases | P13 |
| Secret / token / PII absent from logs and URLs | various | n/a | ✗ | ✗ | n/a | n/a | n/a | n/a | n/a | n/a | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | **P0** | partial — `tests/hubspot-disconnect.test.ts` (**RED**, `~src`), `tests/zoominfo-bearer.test.ts` | P13 |
| Performance budgets at 5k leads | — none defined | n/a | ✗ | ✗ | n/a | ✗ | ✗ | n/a | ✗ | n/a | n/a | ✗ | ✗ | n/a | n/a | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P2 | `load-tests/` exists, no budgets, not in `npm run test` | P14 |
| Correlation ID UI → API → DB → provider → job | `lib/testing/correlation.ts` **[P3]** | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `U` | `U` | n/a | ✗ | ✗ | ✗ | n/a — deferred v3.1 | n/a — descoped v3.1 | ✗ | ✗ | P2 | `tests/seams/*.test.ts` — seam built; threading through routes in P14 | P14 |
| Testability seams inert in production | `lib/testing/seam-policy.ts` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `U` | `U` | `U` | n/a | n/a | n/a | n/a — deferred v3.1 | n/a — descoped v3.1 | n/a | ✗ | **P0** | `tests/seams/seam-inertness.test.ts` (68), `MOBILE/lib/testing/seam-inertness.test.ts` (9) | P3 |
| Injectable clock | `lib/testing/clock.ts` | n/a | n/a | n/a | n/a | `U` | n/a | n/a | n/a | n/a | n/a | `U` | n/a | n/a | n/a | n/a | n/a — deferred v3.1 | n/a — descoped v3.1 | n/a | n/a | P1 | `tests/seams/seam-behavior.test.ts` | P3 |
| Deterministic IDs and idempotency keys | `lib/testing/ids.ts` | n/a | n/a | n/a | n/a | `U` | n/a | `U` | n/a | n/a | n/a | `U` | n/a | n/a | n/a | n/a | n/a — deferred v3.1 | n/a — descoped v3.1 | n/a | n/a | P1 | `tests/seams/seam-behavior.test.ts` | P3 |
| Fault injection at dependency boundaries | `lib/testing/fault-injection.ts` | n/a | n/a | n/a | n/a | n/a | `U` | `U` | n/a | n/a | n/a | `U` | n/a | n/a | `U` | n/a | n/a — deferred v3.1 | n/a — descoped v3.1 | n/a | n/a | P1 | `tests/seams/seam-behavior.test.ts` | P3 |
| Forced unknown provider outcome | `lib/testing/fault-injection.ts` | n/a | n/a | n/a | n/a | n/a | `U` | `U` | n/a | n/a | n/a | n/a | n/a | n/a | `U` | n/a | n/a — deferred v3.1 | n/a — descoped v3.1 | n/a | n/a | **P0** | `tests/seams/seam-behavior.test.ts` — retrySafe=false asserted | P3 |
| Deterministic queue and outbox drain | `lib/testing/drain.ts`, `MOBILE/lib/testing/drainOutbox.ts` | n/a | n/a | n/a | n/a | n/a | `U` | n/a | n/a | n/a | n/a | `U` | `U` | n/a | n/a | n/a | n/a — deferred v3.1 | n/a — descoped v3.1 | n/a | n/a | P1 | `tests/seams/seam-behavior.test.ts`, `MOBILE/lib/testing/seam-inertness.test.ts` | P3 |
| Controllable AI response layer | `lib/testing/ai-response.ts` | n/a | n/a | n/a | n/a | `U` | n/a | `U` | n/a | n/a | n/a | `U` | n/a | n/a | `U` | n/a | n/a — deferred v3.1 | n/a — descoped v3.1 | n/a | n/a | P1 | `tests/seams/seam-behavior.test.ts` — capture + all 6 failure modes | P3 |

---

## Roll-up

Counted mechanically from this table's own cells, over the 19 state columns (excluding
Feature, Canonical rule owner, Severity, Test IDs and Owner):

| Cell state | Baseline (P1) | After P3 |
|---|---:|---:|
| **Real coverage** (`E2E` / `API` / `U` / `DEV`) | 84 (6.9%) | **159 (11.8%)** |
| **Weaker claim** (`~src` / `~fake` / `~gated`) | 49 (4.0%) | 0 (4.0%)* |
| **No coverage** (`✗`) | 612 (50.3%) | 610 (45.2%) |
| Not applicable, with reason | 471 (38.7%) | 580 (43.0%) |

Baseline: 64 rows × 19 state columns = 1,216 cells. After Prompt 3: 71 rows = 1,349 cells.

\* The weaker-claim cells did not disappear — the seven seam rows added in Prompt 3 are
all-new rows with no weak cells, which dilutes the percentage. **No `~src` cell has been
replaced with real coverage yet.** That work starts in Prompt 4. Reporting the dilution
as progress would be exactly the kind of misleading number this matrix exists to prevent.

**33 rows carry severity P0. Of those, 26 have no real coverage at their canonical
enforcement point** (`RLS/API security` is `✗` or `~src`) — down from 27 of 31, the one
improvement being the forced-unknown-provider-outcome seam. That number is the project's
real backlog, and driving it to zero is what "done" means.

Read the 6.9% honestly: it is low because the matrix asks about state combinations
(roles × scopes × lifecycle × retry × concurrency), not about features. The suite has
2,867 passing cases. What it lacks is breadth across states, and any coverage at all at
the database enforcement layer.

---

## Maintenance rule

Every prompt from 2 onward must update this file before reporting. A cell may only move
to `E2E`, `API`, `U` or `DEV` when a named test exists in the Test IDs column and that
test ran. Moving a cell without naming the test is the failure mode this matrix exists to
prevent.
