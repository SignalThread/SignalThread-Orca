# Planner Dash Test Hardening Summary

Last updated: 2026-07-01

## What Existed Before

Planner Dash already had a large Node/tsx regression suite covering unit logic, service behavior, source-contract assertions, import/parsing helpers, visual/source Room Set checks, and client upload helper sequencing. The suite was useful but hard to summarize, and it did not prove planner workflows in a browser.

## What Was Added

- Coverage matrix: `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- Harness documentation: `docs/testing/PLANNER_DASH_TEST_HARNESS.md`
- Deterministic DB-backed fixture harness: `web/lib/test-harness/planner-fixtures.ts`
- Harness validation test: `web/lib/test-harness/planner-fixtures.test.ts`
- Core journey pack: `web/lib/test-journeys/planner-core-journeys.test.ts`
- Access/tenancy journey pack: `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`
- Lifecycle journey pack: `web/lib/test-journeys/planner-lifecycle-journeys.test.ts`
- Playwright browser config: `web/playwright.config.ts`
- Playwright P0 browser fixture helpers: `web/e2e/helpers/planner-e2e.ts`
- First P0 browser journey: `web/e2e/planner-p0-browser-journey.spec.ts`
- P0 browser access journey: `web/e2e/planner-access-browser-journey.spec.ts`
- P0 quick drawer browser journey: `web/e2e/planner-quick-drawer-browser-journey.spec.ts`
- P0 quick drawer resource panels (F&B + Staffing) browser journey: `web/e2e/planner-quick-drawer-resources-browser-journey.spec.ts`
- P0 Room Set / Seating browser journey: `web/e2e/planner-room-set-seating-browser-journey.spec.ts`
- P0 Room Set / Seating advanced (unassign) browser journey: `web/e2e/planner-room-set-seating-advanced-browser-journey.spec.ts`
- P0 Docs Hub browser journey: `web/e2e/planner-docs-browser-journey.spec.ts`
- P0 Docs Hub review-decision browser journey: `web/e2e/planner-docs-review-browser-journey.spec.ts`
- P0 Budget browser journey: `web/e2e/planner-budget-browser-journey.spec.ts`
- P0 Speakers browser journey: `web/e2e/planner-speakers-browser-journey.spec.ts`
- P0 speaker portal (token) browser journey: `web/e2e/speaker-portal-browser-journey.spec.ts`
- P0 Timeline browser journey: `web/e2e/planner-timeline-browser-journey.spec.ts`
- Regression policy: `docs/testing/REGRESSION_POLICY.md`
- Canonical focused scripts in `web/package.json`

The journey packs found and locked regression coverage around server-side access boundaries, including Matrix 2 F&B catalog assignment routes and selected Docs Hub routes. They also added denied-write persistence assertions for permission-sensitive paths.

The first browser journey covers a seeded Events -> event workspace -> Run of Show -> List view path. It edits a seeded session title, saves, reloads, verifies the updated row and speaker assignment remain visible, and rereads Prisma for persisted state.

The browser access journey covers `EVENT_VIEWER` read-only access for the same Run of Show List surface. It opens a protected event/session, attempts a Matrix session title edit, receives the real 403 `EVENT_EDITOR_ROLE_REQUIRED` response, and rereads Prisma plus reloads the UI to verify the MatrixRow title did not mutate.

The quick drawer browser journey covers the Matrix board quick action launcher into the Speakers quick panel. It adds an existing event speaker through the drawer UI, saves, closes/reopens the drawer, reloads, verifies the speaker remains visible, and rereads Prisma for the `SessionSpeakerAssignment`.

The Room Set / Seating advanced browser journey extends the exact-chair assignment coverage to unassign. It pre-seats an attendee at Chair 1, opens the Tables inspector, removes the attendee via the chair "Remove" control, and verifies the chair is empty in the UI plus a SeatingAssignment count of 0 after reload. Multi-table and auto-assign are not browser-covered: auto-assign is explicitly deferred in the embedded seating V1, and multi-table moves depend on canvas drag/drop that would be brittle; both remain documented gaps.

The speaker portal browser journey covers the public token-scoped portal route with no planner session auth. A valid token, minted through the canonical generateSpeakerPortalToken service, loads the intended speaker's portal (speaker name + readiness content) and survives reload; an invalid token and a revoked token both render the "Link unavailable" rejection and do not expose the speaker's data. Portal profile submission is not browser-covered (multi-tab portal form flow) and remains covered at the service/lifecycle-journey layer as a documented gap.

The Docs Hub review-decision browser journey extends the Docs Hub submit-for-review coverage to a review decision. It opens a seeded IN_REVIEW document and approves it through the real Docs Hub drawer action (the canonical approve route, whose control renders in non-production/e2e mode), reloads, confirms the list card shows Approved, and rereads Prisma plus `getDocumentDetails` for APPROVED status and a REVIEW_APPROVED activity entry. Reject, Reopen, and Pull back are not browser-covered: the reject control opens a native window.prompt and chaining multiple review decisions across documents in one drawer session was unstable, so those transitions stay covered at the service/lifecycle-journey layer. The Budget review decision (approve/reject/revise) is also deferred: the approval action is behind a "View approvals" review surface with submission selection plus a native window.confirm; it remains covered at the service/lifecycle-journey layer. Both are documented remaining browser gaps.

The quick drawer resource panels browser journey extends that coverage to the F&B and Staffing quick panels. It assigns a seeded F&B catalog item (persisted immediately through the canonical F&B catalog assignment route) and a seeded EventPerson to Staffing (persisted through the session Save), reloads, reopens both panels to confirm the assignments remain visible, and rereads the DB for `SessionFnbCatalogAssignment` and the canonical Matrix staff assignment record. The AV requirement panel is intentionally deferred: saving an AV requirement selection budget-links the requirement and the event resolves a broader default requirement template, so the reloaded AV panel does not re-render a stable, matchable selected row; that assertion would be brittle. AV requirement data stays covered at the service/journey layer. To support this journey (any saved session carrying budget-categorized F&B/AV data auto-creates an event Budget graph), the deterministic fixture cleanup now also removes budgets scoped to harness-owned events so no rows leak into the shared database.

The Room Set / Seating browser journey covers the Matrix board Seating quick action into the session-scoped seating workspace. It selects a seeded attendee, switches to the table inspector, assigns the attendee to Chair 1 through the browser UI, reloads, verifies the assignment remains visible, and rereads Prisma for event, seating plan, table, attendee, and `seatIndex` persistence.

The Docs Hub browser journey covers Events -> event workspace -> Docs Hub for a seeded event-scoped document and version. It submits the document for review through the drawer UI, reloads, verifies the In Review state and review activity remain visible, and rereads Prisma plus the canonical document service for document/version/approval/activity persistence. It does not cover browser upload/presign/finalize or external R2.

The Budget browser journey covers Events -> event workspace -> Budget -> Full Budget Grid for a seeded event-scoped budget, version, and line item. It submits the line item for approval through the grid/modal UI, reloads, verifies the Submitted state remains visible, and rereads Prisma plus the canonical budget snapshot service for budget/submission/recipient/activity persistence. It does not cover browser approve/reject/revise or Budget denied-write flows.

The Speakers browser journey covers Events -> event workspace -> Event Directory -> Speakers for a seeded event-scoped speaker. It opens the speaker detail page, uses Edit Profile to change status, title, and company through the browser UI, reloads, verifies the updated profile state remains visible, and rereads Prisma plus the canonical speaker service for event scope and profile persistence. It does not cover browser speaker creation/deletion, communications, onsite/readiness edits, portal/token workflows, or speaker-specific denied-write flows.

The Timeline browser journey covers Events -> event workspace -> Roadmap -> List for a seeded event-scoped timeline item. It changes the item status from Backlog to In Progress through the inline status control, reloads, verifies the updated state remains visible, and rereads Prisma plus the canonical timeline service for event scope and status persistence. It does not cover Timeline dependency browser workflows because the inspected Roadmap UI does not expose a reliable dependency edit control.

The browser journeys use the existing development auth fallback in `web/lib/request-user.ts` with real Prisma users selected through `DEV_USER_EMAIL`, plus an `activeOrgId` cookie for org context; they do not add fake auth and do not prove the Supabase/OTP login flow.

## Product Route Files Hardened

These route files are covered by source-contract authorization assertions in the hardening tests:

- `web/app/api/events/[eventId]/matrix-2/sessions/[sessionId]/fnb-catalog-assignments/route.ts`
- `web/app/api/events/[eventId]/matrix-2/sessions/[sessionId]/fnb-catalog-assignments/[assignmentId]/route.ts`
- `web/app/api/events/[eventId]/documents/route.ts`
- `web/app/api/events/[eventId]/documents/presign/route.ts`
- `web/app/api/events/[eventId]/documents/[documentId]/finalize-upload/route.ts`
- `web/app/api/events/[eventId]/documents/[documentId]/route.ts`
- `web/app/api/events/[eventId]/documents/[documentId]/download/route.ts`
- `web/app/api/events/[eventId]/documents/[documentId]/review/submit/route.ts`
- `web/app/api/events/[eventId]/documents/[documentId]/approve/route.ts`
- `web/app/api/events/[eventId]/documents/[documentId]/reject/route.ts`
- `web/app/api/events/[eventId]/documents/[documentId]/reopen/route.ts`
- `web/app/api/events/[eventId]/documents/[documentId]/review/pull-back/route.ts`
- `web/app/api/events/[eventId]/documents/link-options/route.ts`
- `web/app/api/events/[eventId]/budget/submissions/[submissionId]/approve/route.ts`
- `web/app/api/events/[eventId]/budget/submissions/[submissionId]/reject/route.ts`
- `web/app/api/events/[eventId]/speakers/route.ts`
- `web/app/api/events/[eventId]/speakers/[speakerId]/route.ts`
- `web/app/api/events/[eventId]/matrix-2/sessions/[sessionId]/speakers/[speakerId]/route.ts`
- `web/app/api/events/[eventId]/speakers/[speakerId]/portal-link/route.ts`

## Canonical Commands

Full local verification:

```bash
npm --prefix web run typecheck
npm --prefix web run test:summary
```

Focused harness and journey validation:

```bash
npm --prefix web run test:harness
npm --prefix web run test:journeys
npm --prefix web run test:journeys:core
npm --prefix web run test:journeys:access
npm --prefix web run test:journeys:lifecycle
```

Existing focused commands:

```bash
npm --prefix web run test:room-set
npm --prefix web run test:marketing-email-smoke
```

Browser/E2E commands:

```bash
npm --prefix web run test:e2e:p0
npm --prefix web run test:e2e:access
npm --prefix web run test:e2e:quick-drawer
npm --prefix web run test:e2e:quick-drawer-resources
npm --prefix web run test:e2e:room-set
npm --prefix web run test:e2e:room-set-advanced
npm --prefix web run test:e2e:docs
npm --prefix web run test:e2e:docs-review
npm --prefix web run test:e2e:budget
npm --prefix web run test:e2e:speakers
npm --prefix web run test:e2e:speaker-portal
npm --prefix web run test:e2e:timeline
npm --prefix web run test:e2e
```

`test:e2e:p0` runs the current deterministic P0 Playwright journeys. `test:e2e:access` runs the focused EVENT_VIEWER Matrix denied-write browser journey. `test:e2e:quick-drawer` runs the focused Matrix quick drawer speaker assignment browser journey. `test:e2e:quick-drawer-resources` runs the focused Matrix quick drawer F&B + Staffing assignment browser journey. `test:e2e:room-set` runs the focused Room Set / Seating exact-chair browser journey. `test:e2e:room-set-advanced` runs the focused Room Set / Seating unassign browser journey. `test:e2e:docs` runs the focused Docs Hub submit-for-review browser journey. `test:e2e:docs-review` runs the focused Docs Hub approve-decision browser journey. `test:e2e:budget` runs the focused Budget submit-for-approval browser journey. `test:e2e:speakers` runs the focused Speakers profile edit browser journey. `test:e2e:speaker-portal` runs the focused public speaker portal token browser journey. `test:e2e:timeline` runs the focused Timeline Roadmap List status-edit browser journey. `test:e2e` runs the full Playwright suite as additional browser specs are added.

## Clean E2E Logging

Normal Playwright commands set `PW_E2E=1` and default `PW_E2E_VERBOSE_LOGS=0`. In that mode, the app keeps Playwright pass/fail output readable by suppressing routine server diagnostics: expected development-auth missing-session warnings when the dev fallback resolves, successful `api.request.started` / `api.request.completed` logs, slow/high-query request warnings, route-local successful Events/Docs/Matrix snapshot logs, Prisma one-time initialization info, Budget debug traces, and notification unread-count debug traces.

Errors remain visible. Failed API responses, recorded route exceptions, DB error classifications, browser console errors from actual client failures, and unexpected Supabase auth failures still log. Budget diagnostics can be enabled explicitly with either `PW_E2E_VERBOSE_LOGS=1` for browser runs or `BUDGET_DEBUG_LOGS=1` for server-side debugging. Notification unread-count debug traces can be enabled with `NOTIFICATION_DEBUG_LOGS=1`. Browser Budget debug traces use `NEXT_PUBLIC_BUDGET_DEBUG_LOGS=1`, which the Playwright web server sets automatically when `PW_E2E_VERBOSE_LOGS=1`.

Verbose browser debugging:

```bash
PW_E2E_VERBOSE_LOGS=1 npm --prefix web run test:e2e:p0
PW_E2E_VERBOSE_LOGS=1 npm --prefix web run test:e2e:budget
```

## Current Green Baseline

Current expected full-suite result:

- `npm --prefix web run typecheck`: pass
- `npm --prefix web run test:journeys`: pass, 18/18 journey tests
- `npm --prefix web run test:e2e:p0`: pass, 12/12 Playwright browser tests
- `npm --prefix web run test:summary`: pass, 1519/1519 tests

`test:summary` discovers every `*.test.ts` file outside `node_modules` and `.next`, so it includes the harness validation and all three service/data journey packs. Playwright specs use `.spec.ts` and are run separately through `test:e2e:p0` or `test:e2e`.

## Covered Layer

The new hardening covers service/data/API-source behavior:

- deterministic fixture setup and cleanup
- DB-backed event/session/seating/timeline/docs/budget/speaker lifecycle reads and writes
- role and tenant boundaries at service/data layer
- source-contract assertions for selected route authorization boundaries
- one real browser P0 path through Events, event workspace, Run of Show List editing, reload, and DB persistence verification
- one real browser access P0 path proving EVENT_VIEWER can read a protected Matrix session but cannot persist a Matrix List edit
- one real browser quick drawer P0 path proving Speakers panel assignment persists through close/reopen, reload, and DB reread
- one real browser Room Set / Seating P0 path proving attendee -> table inspector -> Chair 1 assignment persists through reload and DB reread with exact `seatIndex`
- one real browser Docs Hub P0 path proving a seeded document/version can be submitted for review through the UI and persists through reload plus DB/service activity reread
- one real browser Budget P0 path proving a seeded line item can be submitted for approval through the Full Budget Grid UI and persists through reload plus DB/service submission/activity reread
- one real browser Speakers P0 path proving a seeded event-scoped speaker can be opened from the Speakers directory, edited through the profile UI, and persist through reload plus DB/service reread
- one real browser Timeline P0 path proving a seeded event-scoped Roadmap item status can be edited through List view and persist through reload plus DB/service reread
- one real browser quick drawer resources P0 path proving F&B catalog and Staffing panel assignments persist through reload plus DB reread
- one real browser Docs Hub review-decision P0 path proving an IN_REVIEW document can be approved through the drawer and persist through reload plus DB/service reread
- one real browser speaker portal P0 path proving a valid token loads the intended speaker with no planner auth while invalid and revoked tokens are rejected
- one real browser Room Set / Seating advanced P0 path proving a pre-seated attendee can be unassigned through the Tables inspector and stays removed through reload plus DB reread

## Remaining Gaps

- `pg` still emits `Calling client.query() when the client is already executing a query is deprecated` during DB-backed test runs. Repo search found no local `pg.Client` / `Pool.query` usage outside Prisma's `@prisma/adapter-pg` wiring, so this pass leaves the warning visible instead of suppressing Node warnings globally.
- Real Supabase/OTP browser login or saved auth state (browser specs use the development auth fallback with real Prisma users + activeOrgId cookie)
- Browser denied-write/access role coverage beyond the EVENT_VIEWER Matrix List edit denial (broader OWNER/ADMIN/MEMBER/VIEWER/EVENT_VIEWER matrix is covered at the service/access-tenancy journey layer)
- Browser quick drawer Basics and AV requirement assignments (Speakers, F&B, and Staffing panels are now browser-covered; the AV requirement panel's reloaded selected row is not stable — documented in the quick-drawer-resources spec)
- Docs Hub reject/reopen/pull-back browser paths (approve is covered; reject uses a native window.prompt and multi-decision drawer chaining was unstable) — covered at the service/lifecycle-journey layer
- Budget approve/reject/revise browser paths (submit-for-approval is covered; the decision lives behind a "View approvals" surface + native window.confirm) — covered at the service/lifecycle-journey layer
- Room Set / Seating multi-table moves (canvas drag/drop) and auto-assign (explicitly deferred in embedded seating V1)
- Speaker portal profile submission through the multi-tab portal form (token read + invalid/revoked rejection are covered)
- Docs upload/presign/finalize with mocked R2 (upload path still uses seeded document versions; no external R2)
- Universal route guard execution across every protected route

## Final Browser / Access Hardening Assessment (2026-07-01)

This assessment closes the browser/testing loop. Current browser P0 suite: 12/12 (`test:e2e:p0`).

1. Broader role-matrix browser coverage. The browser layer proves read-only denial for `EVENT_VIEWER` on Matrix session edits (real 403 `EVENT_EDITOR_ROLE_REQUIRED` + DB non-mutation). The full OWNER/ADMIN/MEMBER/VIEWER/EVENT_VIEWER/unrelated-org matrix — including denied writes with persisted-state rereads — is exhaustively covered at the service/access-tenancy journey layer (`planner-access-tenancy-journeys.test.ts`). Additional per-module denied-write browser tests were not added in this pass: they would each need a second seeded role and add drawer-timing brittleness for marginal gain over the existing service-layer matrix. This is an explicit, low-risk deferral, not a coverage hole in enforcement (enforcement is server-side and journey-tested).

2. Live HTTP route execution. The Playwright specs already exercise live HTTP route execution: each spec boots the real Next.js dev server (Playwright `webServer`) and drives the real UI, which calls the real API routes (create/presign/finalize, matrix writes, fnb-catalog assignment, document approve/pull-back, budget submit, seating assign/unassign, timeline status, speaker portal). Persistence is verified by DB and canonical-service rereads. What is not exercised is real Supabase/OTP cookie auth (see 4); routes authorize through the development auth fallback with real Prisma users.

3. Mocked R2 upload feasibility. Docs Hub upload (draft -> presign -> PUT -> finalize) targets Cloudflare R2. The browser and journey coverage seeds `DocumentVersion` rows directly and never touches external R2, so the real upload/presign/finalize path is not browser- or route-executed. A faithful mock needs an injectable storage boundary (stub `createPresignedUpload`/`getDownloadUrl` and intercept the PUT) that does not exist yet; adding it is a self-contained future task. Deferred to avoid a storage-abstraction change under a testing pass. Documented as a remaining gap.

4. Real Supabase/OTP auth. Real auth requires Supabase project secrets and an OTP/email step that cannot run deterministically in local/CI without credentials and manual interaction. The specs deliberately use the existing development auth fallback (real Prisma user + `activeOrgId` cookie), which exercises the real server authorization path without faking authorization. Real-auth browser login is deferred to a dedicated auth-focused pass with secret-backed CI, documented here and in the roadmap.

Net: the browser P0 layer now spans Run of Show edit, EVENT_VIEWER denied-write, quick drawer Speakers + F&B + Staffing, Room Set / Seating assign + unassign, Docs Hub submit + approve, Budget submit, Speakers profile edit, speaker portal token, and Timeline status. Remaining browser gaps are enumerated above and are covered at the service/data/API-source layer where applicable; none represent an unguarded production path.

## CI Status

No repo CI workflow was found under `.github/workflows` or equivalent pruned repo search. This pass did not add fake CI.

To enforce the suite in CI, the workflow needs a Node install, web dependency install, generated Prisma client, and a test database available through `DATABASE_URL`. Local env files used by the harness are `repo/.env.local` and `web/.env.local`; CI should provide equivalent secret-backed environment variables instead of depending on local files.

## Roadmap

P0:

- Expand the Playwright E2E harness with deterministic browser contexts for OWNER, ADMIN, MEMBER, VIEWER, and EVENT_VIEWER.
- Add authenticated browser state fixtures or real-auth setup beyond the current development fallback.
- Add live route/API tests for Matrix writes, Docs upload/review beyond the current submit-for-review browser path, Budget approval decisions beyond the current browser submit-for-approval path, Speakers workflows beyond profile edit, Timeline dependencies, Seating, and F&B assignments.

P1:

- Add browser journeys for event creation, Matrix Board/workspace consistency, quick drawer Basics/AV/F&B/staffing edits, F&B catalog UI assignment, broader Room Set/Seating paths, Docs upload/presign/finalize with mocked R2, Docs approve/reject/reopen, Budget approve/reject/revise and access-denial activity, broader speaker workflows, and Timeline dependency lifecycle.
- Add mocked or local R2-compatible storage for upload/presign/finalize tests.

P2:

- Add nightly/full-browser coverage for planner UI and speaker portal UI workflows.
- Add coverage reporting and CI artifacts for TAP logs, screenshots, traces, and route failures.

## Recommended Next Prompt

Expand the deterministic Playwright E2E harness for Planner Dash. Add role-specific authenticated contexts for OWNER, ADMIN, MEMBER, VIEWER, and EVENT_VIEWER; keep isolated event data and cleanup; use real auth cookies or saved auth state where possible; mock or localize R2 storage for Docs Hub upload routes; and add the next P0 browser journeys for event creation, quick drawer F&B/staffing assignments, F&B catalog UI assignment, and broader role/module denied-write checks. Do not change product behavior, Prisma schema, or migrations.
