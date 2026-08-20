# Planner Dash Testing Hardening Brief

## Objective

We are hardening Planner Dash so we do not repeat the Lead Retrieval failure pattern where isolated tests pass, but real workflows, browser journeys, or access paths break.

The objective is not just “more tests.” The objective is to build layered confidence across:

- Real planner workflows
- Multi-step user journeys
- Event-scoped persistence
- Cross-org and cross-event isolation
- Role-based access and denied-write behavior
- Lifecycle state machines
- Browser UI flows
- Regression policy and test commands that engineers can actually run

Planner Dash is a multi-tenant, event-scoped product. Core workflows span Events, Matrix 2 / Run of Show, the session quick drawer, Room Set, Seating, Docs Hub, Budget, Speakers, Speaker Portal, F&B Catalog, and Timeline. The test plan needs to prove those workflows end-to-end enough that a passing suite means something.

The current strategy is layered:

1. Stabilize the existing baseline.
2. Add deterministic fixture and role helpers.
3. Add service/data/API-source journeys.
4. Add access and tenancy journeys.
5. Add lifecycle journeys.
6. Add browser P0 journeys.
7. Clean test output so results are readable.
8. Continue with the remaining browser gaps using focused prompts.

## Current Status

We are no longer at the “do we have journeys?” stage.

We now have:

- A deterministic test harness.
- Non-browser service/data/API-source journeys.
- Access and tenancy regression coverage.
- Lifecycle coverage for Docs, Budget, Speakers, and Speaker Portal token behavior.
- A real Playwright browser E2E layer.
- Cleaned E2E output.
- Updated testing docs and regression policy.

Current verified state:

```text
Non-browser journeys: 18/18 passing
Browser P0 journeys: 7/7 passing
Full test summary: 1519/1519 passing
Typecheck: passing
```

Browser P0 currently covers:

1. Matrix session edit and reload persistence.
2. EVENT_VIEWER denied write with real 403 and DB non-mutation verification.
3. Matrix quick drawer speaker assignment through the real UI.
4. Room Set / Seating exact-chair assignment with `seatIndex: 0` DB verification.
5. Docs Hub submit-for-review through the real UI.
6. Budget line item submit-for-approval through the real UI.
7. Speakers edit profile/status/title/company through the real UI.

The test output is now much cleaner. Normal Playwright runs show readable pass/fail output. The remaining expected noise is:

- The intentional 403 log from the access-denied browser test.
- A Prisma / pg adapter deprecation warning that was intentionally not globally suppressed.

## What Has Been Done

### 1. Coverage Audit

Created:

- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`

The audit mapped current tests by module, coverage type, and journey coverage. It confirmed that Planner Dash did not previously have LR-style journey coverage.

It also found the baseline was not green:

```text
1500 tests
1486 passing
14 failing
```

The failures were mainly Matrix 2 / Room Set regressions.

### 2. Baseline Stabilization

Fixed the existing failing Matrix 2 / Room Set tests before adding new journey coverage.

Changed areas included:

- Matrix 2 status card regression tests
- Room Set graceful fallback logic
- Room Set visual audit helpers
- Room Set workspace drawer regression tests

Result:

```text
Existing baseline: green
Focused Matrix 2 / Room Set tests: green
Typecheck: passing
```

This was important because adding new journeys on top of a red baseline would have created false confidence.

### 3. Deterministic Test Harness

Added deterministic DB-backed fixture and role helpers.

Key files:

- `web/lib/test-harness/planner-fixtures.ts`
- `web/lib/test-harness/planner-fixtures.test.ts`
- `docs/testing/PLANNER_DASH_TEST_HARNESS.md`

The harness supports deterministic creation and cleanup for:

- Organization
- Client
- User
- Membership
- Event
- EventMember
- Room
- MatrixRow / session
- Speaker
- SessionSpeakerAssignment
- EventPerson
- SessionStaffAssignment
- Session requirement data
- F&B catalog items
- F&B session assignments
- Seating plan/table/attendee/assignment
- Budget data
- Document/version data
- Timeline item/dependency

Role helpers cover:

- OWNER
- ADMIN
- MEMBER with event access
- VIEWER with event access
- EVENT_VIEWER read-only
- unrelated same-org member
- unrelated other-org member
- SUPER_ADMIN where supported

Cleanup runs in reverse dependency order and is intended to be used inside `try/finally`.

### 4. Core Planner Service/Data Journeys

Added:

- `web/lib/test-journeys/planner-core-journeys.test.ts`

Covered:

- Event creation → workspace-ready Matrix 2 snapshot reread
- Run of Show MatrixRow/session basics update → persisted reread
- Quick drawer data path:
  - speaker assignment
  - AV requirement
  - F&B catalog assignment
  - staff assignment
  - speaker removal
- Room Set → Seating:
  - session-scoped seating plan
  - table
  - attendee
  - exact `seatIndex` assignment
- Timeline:
  - item create/update
  - dependency create/reread

Result:

```text
Core journeys: 5/5 passing
```

### 5. Access and Tenancy Journeys

Added:

- `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`

Covered roles:

- OWNER
- ADMIN
- MEMBER with EVENT_EDITOR
- VIEWER with EVENT_EDITOR
- EVENT_VIEWER read-only
- unrelated same-org MEMBER
- unrelated other-org MEMBER
- SUPER_ADMIN

Covered:

- Role matrix setup validation
- Event read visibility
- Cross-event and cross-org isolation
- Matrix 2 session basics write access
- Denied-write persistence checks
- Quick drawer speaker add/remove access
- F&B catalog assignment add/remove access
- Seating exact-chair assign/unassign access
- Seating session-scope enforcement
- Timeline mutation denial and cross-event dependency rejection
- Source-contract coverage for guarded Matrix 2 F&B assignment routes

Real access bug found and fixed:

Matrix 2 F&B catalog assignment routes were missing canonical route-level access checks.

Hardened:

- `web/app/api/events/[eventId]/matrix-2/sessions/[sessionId]/fnb-catalog-assignments/route.ts`
- `web/app/api/events/[eventId]/matrix-2/sessions/[sessionId]/fnb-catalog-assignments/[assignmentId]/route.ts`

Result:

```text
Access journeys: 7/7 passing
```

### 6. Lifecycle Journeys

Added:

- `web/lib/test-journeys/planner-lifecycle-journeys.test.ts`

Covered Docs Hub:

- draft → finalize version → submit → pull back → resubmit → approve → reopen
- persisted document/version/approval rereads

Covered Budget:

- line item → submit → denied approval non-mutation → reject → revise → resubmit → approve
- BudgetActivity and BudgetApproval rereads

Covered Speakers:

- create speaker
- assign speaker to Matrix session
- reread Matrix 2
- comms/internal note/onsite data
- denied update non-mutation
- remove assignment

Covered Speaker Portal token behavior:

- token scoping
- hash persistence
- portal view
- pending submission
- invalid token rejection
- revoked token rejection
- expired token rejection

Covered cross-module tenant isolation for:

- Docs
- Budget
- Speakers
- cross-event Matrix speaker assignment IDs

Real access bug found and fixed:

Docs Hub routes were missing route-level authentication/event access checks.

Hardened Docs Hub route areas under:

- `web/app/api/events/[eventId]/documents`

Areas included:

- document detail/update
- document download
- document link-options
- document review submit/pull-back
- document approve/reject/reopen

Result:

```text
Lifecycle journeys: 6/6 passing
```

### 7. Test Hardening Docs and Scripts

Added:

- `docs/testing/REGRESSION_POLICY.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Updated:

- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARNESS.md`
- `web/package.json`

Added focused scripts:

```text
test:harness
test:journeys
test:journeys:core
test:journeys:access
test:journeys:lifecycle
```

CI was not changed because no CI workflow was found under `.github/workflows` or equivalent search. The hardening summary documents the blocker and required environment, especially `DATABASE_URL`.

### 8. First Browser E2E Layer

Added Playwright browser E2E coverage.

Key files:

- `web/playwright.config.ts`
- `web/e2e/helpers/planner-e2e.ts`
- `web/e2e/planner-p0-browser-journey.spec.ts`

Added scripts:

```text
test:e2e
test:e2e:p0
```

The first browser journey covered:

- create isolated fixture data
- authenticate through existing dev-auth fallback
- open Events
- enter event workspace
- open Run of Show
- edit a seeded Matrix session title in List view
- save
- reload
- verify UI persisted
- reread DB

### 9. Browser Access P0

Added:

- `web/e2e/planner-access-browser-journey.spec.ts`

Covered:

- EVENT_VIEWER opens protected event
- EVENT_VIEWER can read Run of Show
- EVENT_VIEWER attempts Matrix session edit
- real `403 EVENT_EDITOR_ROLE_REQUIRED` is returned
- DB reread proves the denied title did not persist

Added script:

```text
test:e2e:access
```

### 10. Quick Drawer Browser P0

Added:

- `web/e2e/planner-quick-drawer-browser-journey.spec.ts`

Covered:

- Events → event workspace → Run of Show
- Matrix board quick actions
- Speakers quick panel
- assign existing speaker through the actual drawer UI
- save
- close/reopen
- reload
- Prisma reread of `SessionSpeakerAssignment`

Added script:

```text
test:e2e:quick-drawer
```

### 11. Room Set / Seating Browser P0

Added:

- `web/e2e/planner-room-set-seating-browser-journey.spec.ts`

Covered:

- Events → event workspace → Run of Show / Matrix 2
- session Seating quick action
- Room Set seating workspace
- select attendee
- Tables panel
- assign attendee to Chair 1
- reload
- DB reread

Exact seat coverage landed:

```text
seatIndex: 0
```

DB assertions verify:

- eventId
- seatingPlanId
- tableId
- attendeeId
- seatIndex

Added script:

```text
test:e2e:room-set
```

### 12. Docs Hub Browser P0

Added:

- `web/e2e/planner-docs-browser-journey.spec.ts`

Covered:

- Events → event workspace → Documents / Docs Hub
- open seeded document drawer
- submit seeded draft document/version for review through real UI
- reload
- DB/service reread

Upload status:

- browser upload/presign/finalize was intentionally not added
- fixture data is seeded
- no external R2 touched

Added script:

```text
test:e2e:docs
```

### 13. Budget Browser P0

Added:

- `web/e2e/planner-budget-browser-journey.spec.ts`

Covered:

- Events → event workspace → Budget
- Full Budget Grid
- seeded line item
- submit for approval through UI
- reload
- DB/service reread

Remaining Budget gap:

- browser approve/reject/revise did not land yet

Added script:

```text
test:e2e:budget
```

### 14. E2E Output Cleanup

Added:

- `web/lib/logging/log-policy.ts`

Updated logging gates across request auth, API observability, Prisma init, Budget service/routes, Events/Documents/Matrix routes, and notifications.

Clean E2E mode:

```text
PW_E2E=1
PW_E2E_VERBOSE_LOGS=0
```

Verbose mode:

```bash
PW_E2E_VERBOSE_LOGS=1 npm --prefix web run test:e2e:p0
```

Normal E2E output is now readable. It no longer floods with:

- successful API request logs
- expected dev-auth fallback warnings
- Budget debug dumps
- notification debug traces
- Prisma init noise

Remaining visible warning:

- Prisma / pg adapter deprecation warning
- intentionally not globally suppressed

### 15. Speakers Browser P0

Added:

- `web/e2e/planner-speakers-browser-journey.spec.ts`

Covered:

- Events → event workspace → Event Directory → Speakers
- seeded speaker detail
- Edit Profile
- update speaker status, title, and company through real UI
- reload
- Prisma and `getSpeaker()` service reread

Added script:

```text
test:e2e:speakers
```

Current browser P0 now includes the Speakers spec.

## Current Test Commands

Core verification:

```bash
npm --prefix web run test:journeys
npm --prefix web run test:e2e:p0
npm --prefix web run typecheck
npm --prefix web run test:summary
```

Focused browser commands:

```bash
npm --prefix web run test:e2e:access
npm --prefix web run test:e2e:quick-drawer
npm --prefix web run test:e2e:room-set
npm --prefix web run test:e2e:docs
npm --prefix web run test:e2e:budget
npm --prefix web run test:e2e:speakers
```

Verbose E2E debugging:

```bash
PW_E2E_VERBOSE_LOGS=1 npm --prefix web run test:e2e:p0
```

## What Is Still Left

We estimated six remaining focused prompts after the first browser wave. One of those is now next.

### Prompt 1 — Timeline Browser Journey

Status: next.

Goal:

- Events → event workspace → Timeline
- seeded TimelineItem
- meaningful UI action, preferably status update
- reload
- DB/service reread
- dependency UI if stable

### Prompt 2 — Quick Drawer Remaining Panels

Goal:

- AV browser path
- F&B browser path
- Staffing browser path

These should be grouped because they share the same Matrix quick drawer pattern.

### Prompt 3 — Docs + Budget Review Expansion

Goal:

Docs:

- approve
- reject
- reopen
- pull back

Budget:

- approve
- reject
- revise

This should expand beyond the current submit-for-review / submit-for-approval browser paths.

### Prompt 4 — Speaker Portal Browser Journey

Goal:

- token-scoped portal route
- valid token loads only intended speaker/event data
- invalid/revoked/expired token rejected if stable
- no planner session auth requirement
- portal submission if stable

### Prompt 5 — Room Set / Seating Advanced

Goal:

- unassign
- multi-table
- auto-assign
- drag/drop only if stable and not brittle

### Prompt 6 — Final Browser / Access Hardening Pass

Goal:

- broader role matrix browser checks
- live HTTP route execution assessment
- mocked R2 feasibility
- final docs/gap report

## Guidance For The Next Chat

Do not restart from the beginning. We are already past the foundational test-hardening work.

The next chat should continue with:

```text
Prompt 1: Timeline browser journey
```

The prompt should follow the same pattern as the other browser P0 prompts:

- use existing deterministic fixture harness
- use existing Playwright helpers
- own setup and cleanup
- real UI navigation
- one meaningful UI action
- reload verification
- DB/service reread
- update coverage matrix and hardening summary
- add focused script
- add to `test:e2e:p0` only if stable
- run:
  - focused E2E script
  - `test:e2e:p0`
  - `test:journeys`
  - `typecheck`
  - `test:summary`
  - `git diff --check`

Keep schema locked. Do not add Prisma migrations. Do not fake browser coverage by mutating directly in DB and calling it UI coverage.
