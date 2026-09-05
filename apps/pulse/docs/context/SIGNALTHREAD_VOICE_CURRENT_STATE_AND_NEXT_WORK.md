# SignalThread current state and next work

> **State captured: 2026-08-05 (America/New_York).** Source-confidence note: High confidence for local Git/repository state; medium confidence for open-work interpretation; production deployment, live database migration status, and browser behavior are unverified.

## Checkout state

- Repository: `/Users/ali/Documents/Booth Audio`
- Branch: `main`, tracking `origin/main`
- HEAD: `c513932` — “Add flexible event imports and listening windows” (2026-08-04)
- Working tree: dirty before this documentation task and still preserved.
- Context package: newly added under `docs/context/` only.

Pre-existing product changes:

- Modified: `app/app/page.test.ts`
- Modified: `components/admin/SettingsMenu.test.ts`
- Modified: `components/admin/SettingsMenu.tsx`
- Modified: `components/app/events/EventWorkspaceShell.test.ts`
- Modified: `components/app/events/EventWorkspaceShell.tsx`
- Modified: `components/onboarding/ProductTour.test.ts`
- Modified: `components/onboarding/ProductTour.tsx`
- Modified: `components/theme/ThemeProvider.tsx`
- Untracked: `components/theme/ThemeProvider.test.ts`

These changes address Events light-default/no-flash behavior and a fail-closed SMB Product Tour gate. They are not committed evidence and must not be lost, silently staged, or described as deployed.

## Version and migration status

- Application package version is the non-release marker `0.1.0` (`package.json`).
- No release tags, production manifest, CI workflow, or deployment provider configuration establishes the currently deployed commit.
- There are 36 checked-in SQL migrations. The latest is `prisma/migrations/20260803193000_add_event_listening_window/migration.sql`.
- Applied/pending status in local, QA, staging, and production databases was not checked. Do not infer it from source.

## Current implementation baseline

On `main`, the shared kiosk, mixed answer types, account-scoped app, platform admin, SMB surveys/dashboard, Events workspace/lifecycle intelligence, actions, agenda/speakers, durable imports, flexible agenda/roster parsing, and listening windows have code and tests. The strongest recent source is the July 30–August 4 commit series rather than old root docs.

The active product has 64 API route handlers, 26 page surfaces, 155 Vitest test files, and two Playwright journey specs. This indicates breadth, not comprehensive coverage.

## Open bugs and QA obligations

### Uncommitted theme and Product Tour work

Required before integration:

1. Run the targeted theme, Settings menu, Product Tour, workspace shell, and app-home tests.
2. Run `npm run typecheck` and `git diff --check`.
3. Test an Events account with no saved theme on an OS set to dark: first paint and reload must remain light without hydration warnings.
4. Test explicit supported theme preferences according to the intended product rule.
5. Test an SMB account: system theme behavior and manual/automatic Product Tour must remain functional.
6. Test an Events account during slow/failed account-context loading: no tour entry, overlay, query-start, stored-state start, or stale previous-account exposure.

### Remaining Events loop browser checks

`docs/Loop/Remaining QA Fix Prompt Pack.md` records completed code/test work for prompts 1–3 but explicitly leaves live checks outstanding:

- survey creation returns 201 exactly once and retrying the same `creationRequestId` returns the same survey;
- cross-surface event response/answer/sentiment/coverage metrics agree with their API payloads and labels;
- cold Intelligence navigation shows loading without a false empty state;
- contrasting evidence is labeled without changing aggregate sentiment truth;
- COMPLETED surveys are never shown as draft/unpublished;
- future events show Upcoming, not Live;
- blocked/completed actions require inline context and send no invalid request;
- a survey row’s Open action navigates exactly once.

Prompt 4 is an explicit product-decision stop: decide event close/wrap semantics and kiosk branding/context before implementation.

### Import QA uncertainty

HEAD adds flexible agenda and speaker-roster support, but later user-reported failures included roster `SAVE_MAPPING`, sticky/incompatible drafts, discard/retry lifecycle, and copy mismatches. Current source has import jobs/statuses and tests, but no later committed fix is visible in `main` history. Reproduce against current code before assuming those issues are resolved. Required checks include no domain writes before confirmation, account/event scoping, valid first/last and full-name mappings, structured 4xx failures, discard/start-over/type switching, and idempotent confirmation.

### Other observable risks

- Legacy `/api/events/*` review/data routes remain.
- No general rate limiting or repository RLS is evident.
- Answer transcription/analysis remains synchronous.
- Error envelopes and validation patterns remain inconsistent.
- Root documentation and help content contain stale auth/model/tier statements.
- Theme and tour context is loaded separately in multiple client components, creating duplicated fetch/state logic.

## Incomplete or ambiguous features

- Hospitality is a placeholder, not a defined product.
- Export/share and sponsor value capabilities are not clearly complete across UI and persistence.
- Explicit event close/wrap behavior is awaiting a product decision.
- Kiosk event/survey context and branding depth is awaiting a product decision.
- Attendee identity/follow-up semantics are not established.
- Background job/queue, formal observability, rate limiting, retention policy, and external integration strategy are absent or unverified.
- Template registry event resolution remains a demo stub (`getTemplateForEvent` in `lib/templates/registry.ts`).

## Branch inventory

Many local and remote feature/fix branches remain. A branch name does not establish active work or safe mergeability. Locally, branches ahead of `main` at capture time were:

- `fix/speaker-stop-blinking` — 5 commits ahead;
- `feature/empty-state-onboarding-hero` — 4 commits ahead;
- `remove-password` — 1 commit ahead;
- `feature/thank-you-page-redesign` — 1 commit ahead;
- `feature/account-setup-redesign` — 1 commit ahead.

There are numerous merged/stale Voice Events branches. Before using one, inspect `git merge-base`, commits unique to the branch, and current main equivalents. Do not merge based on name alone.

## Prioritized next work

### P0 — Stabilize and integrate current dirty work

1. Review the uncommitted ThemeProvider/tour changes for hydration and stale-account races.
2. Run targeted tests/typecheck/diff check.
3. Perform live Events and SMB browser verification.
4. Commit only after verified; keep documentation separate if desired.

### P0 — Reproduce import blockers on current HEAD

Use realistic XLSX/CSV fixtures and route/service tests. Fix server mapping errors and draft lifecycle at the canonical job/service level, not by silently recreating drafts. Protect the no-write-before-confirmation rule.

### P1 — Complete outstanding Events browser QA

Execute the exact prompt-pack checks against one known QA dataset and record response payloads, UI labels, console errors, and request counts.

### P1 — Make the product decisions

Choose the smallest coherent event close/wrap contract and kiosk branding/context tier. Update product docs and tests before implementation.

### P1 — Security/reliability follow-up

Re-audit public legacy routes, upload/AI abuse controls, sensitive logging, error envelopes, and tenant checks. Design async answer processing before load requires it.

### P2 — Documentation reconciliation

Update or archive root README/quick-start, multi-tenancy, security audit status, sales matrix, and help claims using this package as an index—not as a replacement for executable tests.

## Blockers and dependencies

- Product approval is required for event close semantics and kiosk context/branding depth.
- Production deployment commit, environment topology, and migration state require infrastructure/database access.
- Pricing, customer proof, retention, privacy/legal, and public claim approval require business owners.
- Live UI verification requires authenticated Events and SMB accounts plus a controlled browser/server.

## Definition of a safe next handoff

A future agent should state the exact branch/dirty state, identify whether it is working on committed or uncommitted behavior, cite the canonical service and account-mode policy, preserve SMB/shared kiosk behavior, run targeted tests and typecheck, and list any browser/deployment checks it did not actually perform.
