# Planner Dash Testing Hardening Prompt Pack

## Purpose

This document collects the Planner Dash testing-hardening prompts in one place.

The goal of this workstream is to prevent the Lead Retrieval-style failure mode where isolated tests pass but real user workflows, access paths, persistence, or browser journeys are broken.

The prompt sequence is organized into:

1. Foundational audit and baseline stabilization
2. Deterministic fixture/test harness
3. Service/data/API-source journey coverage
4. Access and tenancy journey coverage
5. Lifecycle journey coverage
6. Regression policy, docs, and command hardening
7. Browser P0 journey coverage
8. Test output cleanup
9. Remaining browser prompt plan

Use these prompts with Codex/Cursor-style implementation agents. Keep them scoped. Do not combine too many product areas in a single pass unless the prompt explicitly says to.

---

# Global Rules For All Prompts

Use these constraints unless a prompt explicitly says otherwise.

```text
You are working in the Planner OS / Planner Dash repository.

General constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not change relational model semantics.
- Do not loosen, skip, or delete existing tests.
- Do not fake authorization.
- Do not fake browser coverage by mutating directly in the DB and calling it UI coverage.
- Use deterministic setup and cleanup.
- Every test must own its data.
- Use try/finally cleanup patterns.
- Prefer semantic selectors and accessible roles.
- Add data-testid only where it materially improves reliability for an important flow.
- Verify persisted state by rereading from DB, service, or route contract.
- Denied writes must verify persisted state did not change.
- Keep docs truthful.
- Do not overclaim browser coverage.
- If schema support is required, stop and write a schema-change proposal instead of implementing.
```

---

# Prompt 1 — Coverage Audit

```text
You are working in the Planner OS / Planner Dash repository.

Goal: audit the current test coverage and create a truthful coverage matrix. Do not add or fix tests yet.

This is an audit-only pass. The output should tell us exactly what coverage exists, what commands are available, what modules have real flow/journey coverage, and where the gaps are.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not modify application source code.
- Do not add new tests in this pass.
- Do not change package scripts.
- Only create or update documentation files under `docs/testing/`.
- If a test command fails or cannot run locally, document the command, failure, and likely reason instead of trying to fix it.

Start by inspecting the repo structure and test setup:
- `git status --short`
- identify whether you are at repo root or inside `web`
- inspect root `package.json` and `web/package.json` if both exist
- inspect test config files such as Playwright, Vitest, Jest, Cypress, Testing Library, or Node test configs
- find all test files under the repo
- identify existing CI workflows if present
- identify any existing docs related to testing

Create this file:

`docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`

The coverage matrix must include these sections:

1. Current test infrastructure
   - package manager
   - test frameworks found
   - available test commands
   - CI jobs/workflows that run tests
   - whether E2E/browser tests exist
   - whether API/route tests exist
   - whether service/unit tests exist
   - whether permission/tenancy tests exist

2. Test file inventory
   - table of every test file found
   - path
   - framework
   - module covered
   - type: unit, service, API/route, component, E2E, journey, smoke, regression, unknown
   - what behavior it appears to test
   - whether it uses deterministic setup/cleanup
   - whether it verifies persistence/reload
   - whether it verifies permissions/access
   - confidence level: high/medium/low

3. Module coverage matrix

Include these modules:
- Events
- Event workspace shell/navigation
- Run of Show / Matrix 2
- Matrix session quick drawer
- Session Basics
- Speakers
- Speaker assignment
- Speaker portal/token flows
- AV requirements
- F&B requirements
- F&B Catalog
- F&B Catalog session assignments
- Staffing/EventPerson assignments
- Room Set
- Seating
- Budget
- Budget approvals/activity
- Docs Hub
- Document upload/presign/finalize
- Document review/approval/activity
- Timeline
- Timeline dependencies
- Settings
- Platform Admin/account switching if present
- Authentication/session handling
- Event access/tenancy/RBAC

For each module, include:
- source areas/routes inspected
- existing tests
- coverage type
- whether there is a real user journey test
- whether there is API/service contract coverage
- whether OWNER/ADMIN/MEMBER/VIEWER/EVENT_VIEWER behavior is tested
- whether cross-event/cross-org access is tested
- key gaps
- recommended priority: P0/P1/P2

4. Journey coverage assessment

Explicitly answer whether these journeys currently exist as tests:

- Create event → enter event workspace → reload
- Create/edit Run of Show session → verify Board/List/full workspace consistency
- Session quick drawer full edit flow: Basics, Speakers, AV, F&B, Staffing
- Room Set → Seating mode → assign attendee to exact chair → reload
- F&B Catalog item → assign to session → budget sync/check
- Docs upload/presign/finalize → submit review → approve/reject/reopen → activity
- Budget line item → submit → approve/reject/revise → activity
- Speaker create → assign to session → portal/token-safe behavior
- Timeline item/dependency lifecycle
- Permission journey across OWNER/ADMIN/MEMBER/VIEWER/EVENT_VIEWER
- Cross-org/cross-event isolation journey

For each journey:
- Exists: yes/no/partial/unknown
- Evidence: exact test file paths
- Gaps
- Priority

5. Risk findings

Call out high-risk areas where:
- product flows exist but journey coverage does not
- route/service tests exist but no browser/user flow exists
- UI tests exist but no server-side enforcement test exists
- tests rely on shared mutable fixtures
- tests do not clean up
- tests do not verify persisted state after reload
- tests do not cover access/tenancy
- tests appear to be smoke tests only

6. Recommended implementation sequence

Provide the next testing work as concrete prompts/steps, but do not implement them yet.

Use this order:
1. deterministic test harness and fixtures
2. core Planner journey E2E pack
3. access/tenancy journey and API contract tests
4. module-level API/service regression tests
5. CI gates and regression policy

7. Commands run

List every command run, with pass/fail/skipped status.

8. Final summary

Include a blunt final answer:
- Do we currently have LR-style journey coverage?
- Which critical journeys are missing?
- What is the first P0 test pack to build next?

Acceptance criteria:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md` exists.
- The doc distinguishes real journey tests from isolated unit/API/component tests.
- The doc explicitly identifies whether Planner Dash has LR-style journey coverage.
- The doc includes exact file paths as evidence.
- No app source files are modified.
- No schema/migration files are modified.
- No new tests are added in this pass.
- `git status --short` shows only the new/updated testing documentation file unless existing unrelated local changes were already present.
```

---

# Baseline Stabilization Prompt

```text
You are working in the Planner OS / Planner Dash repository.

Goal: stabilize the existing test baseline before adding new journey tests.

Current known state:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md` was created by the coverage audit.
- `npm --prefix web run test:summary` currently runs 1500 tests, with 1486 passing and 14 failing.
- The failing tests are mainly around Matrix 2 / Run of Show and Room Set.
- There is an unrelated pre-existing deletion: `docs/loop/GENERIC_PROMPT_LOOP_CONTROLLER.md`. Do not touch, restore, stage, or commit that file unless explicitly asked.

This pass is for fixing the current failing baseline only.

Important constraints:
- Do not add the new Planner journey E2E pack yet.
- Do not add broad new test infrastructure yet.
- Do not change Prisma schema files.
- Do not add migrations.
- Do not change package scripts unless a script is objectively broken and required to run the existing suite.
- Keep changes focused on the failing tests and the smallest related product/test fixes required to make the existing suite green.
- Preserve current product behavior unless a failing test exposes a real regression.
- If a test is stale because the product intentionally changed, update the test to match the current documented product behavior.
- If the product is broken, fix the product code and keep or strengthen the regression test.
- Do not hide failures by skipping tests, loosening assertions, deleting assertions, or marking tests as flaky.

Use the current docs as the source of truth:
- Matrix 2 is the active Run of Show command center.
- Board/List views share MatrixRow-backed session state.
- Session quick drawer supports Basics, Speakers, AV, F&B, Staffing, Room Set, Seating, Conflicts, and full workspace.
- Room Set is the session-level layout workspace.
- Seating is embedded in Room Set and is session-scoped.
- Room Set and Seating actions should open the full session Room Set workspace modes, not inline quick editors.
- Schema is locked; do not change it.

Tasks:

1. Reproduce the failing baseline.
   - Run `npm --prefix web run test:summary`.
   - Capture the exact failing test names, files, and error messages.
   - Group failures by likely root cause.

2. Inspect only the affected source and test files.
   - Matrix 2 / Run of Show affected files.
   - Room Set affected files.
   - Any shared helper files directly involved in the failures.
   - Do not perform unrelated cleanup.

3. Fix the failures correctly.
   - For real product regressions, fix the application code.
   - For stale tests, update the tests to match current documented behavior.
   - For selector fragility, prefer semantic roles; use `data-testid` only where it materially improves reliability for an important flow.
   - For async/render issues, make the test wait for real user-visible state, not arbitrary timers.
   - For persistence expectations, verify the saved/reloaded state when the existing test already intends to prove persistence.

4. Protect the fixed behavior.
   - Keep existing assertions meaningful.
   - Add targeted assertions only when needed to prevent the same regression.
   - Do not convert product-flow failures into shallow smoke tests.

5. Re-run verification.
   - Run `npm --prefix web run test:summary`.
   - If focused tests are available, run the focused Matrix 2 / Room Set tests too.
   - Run typecheck if product source files changed.

6. Update the audit doc only if the fixes materially change the coverage assessment.
   - If no coverage assessment changed, leave `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md` as-is.

Deliverable:
- Existing test baseline is green.
- Matrix 2 / Room Set failures are fixed or explicitly explained if blocked.
- No schema or migration files changed.
- No new journey test pack added yet.
- No unrelated files changed.
- `docs/loop/GENERIC_PROMPT_LOOP_CONTROLLER.md` remains untouched.
- Final response includes:
  - failing tests found
  - root causes
  - files changed
  - commands run
  - final pass/fail status
  - any remaining blockers
```

---

# Prompt 2 — Deterministic Test Harness

```text
You are working in the Planner OS / Planner Dash repository.

Goal: build deterministic test harness and fixture utilities for Planner Dash journey/API testing.

Current state:
- Existing baseline is green: `npm --prefix web run test:summary` passes 1500/1500.
- Focused Matrix 2 / Room Set tests pass 117/117.
- Typecheck passes.
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md` exists from the audit.
- Do not touch the unrelated pre-existing deletion: `docs/loop/GENERIC_PROMPT_LOOP_CONTROLLER.md`.

This pass is for test infrastructure only. Do not add the full Planner journey E2E pack yet.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not change product behavior.
- Do not loosen or skip existing tests.
- Do not add broad journey tests yet.
- Keep test helpers deterministic and isolated.
- Prefer helpers that own their data and clean up after themselves.
- Avoid shared mutable global fixtures.
- If the current test framework already has fixture patterns, extend them instead of creating a competing system.

Tasks:

1. Inspect existing test setup and conventions.
   - Identify the active test frameworks.
   - Identify existing DB/test helpers.
   - Identify auth/session mocking helpers.
   - Identify existing event/org/user fixture patterns.
   - Identify cleanup patterns.
   - Identify where new shared test helpers should live.

2. Create or extend deterministic test fixtures for:
   - Organization
   - Client, if supported by existing models/helpers
   - Event
   - User
   - Membership
   - EventMember
   - Room
   - MatrixRow/session
   - Speaker
   - SessionSpeakerAssignment
   - EventPerson
   - SessionStaffAssignment
   - SessionRequirementTemplate/Section/Item/Selection where needed
   - EventFnbCatalogItem
   - SessionFnbCatalogAssignment
   - SeatingPlan
   - SeatingTable
   - SeatingAttendee
   - SeatingAssignment
   - Budget/BudgetVersion/BudgetLineItem where existing tests need them
   - Document/DocumentVersion where existing tests need them
   - TimelineItem/TimelineDependency where existing tests need them

3. Create role helpers for Planner access testing.
   - OWNER
   - ADMIN
   - MEMBER with EventMember access
   - VIEWER with EventMember access
   - EVENT_VIEWER read-only event member
   - unrelated MEMBER in same org without event access
   - unrelated user in another org
   - SUPER_ADMIN / platform admin only if the existing test environment supports it cleanly

4. Create cleanup helpers.
   - Cleanup should run in reverse dependency order.
   - Cleanup should be safe if a test partially fails.
   - Use `try/finally` patterns in example tests.
   - Avoid relying on pre-seeded state unless the existing suite already explicitly owns it.

5. Add a small harness validation test.
   - This should not be a product journey test.
   - It should prove the fixture helpers can create isolated org/event/user/session data and clean it up.
   - It should prove at least one role helper creates the expected access relationship.
   - Keep it narrow and fast.

6. Document the harness.
   - Create or update `docs/testing/PLANNER_DASH_TEST_HARNESS.md`.
   - Include helper locations, intended usage, cleanup expectations, role matrix helpers, and examples.
   - Explain that full journey tests come in the next pass.

7. Verification.
   - Run the narrow harness validation test.
   - Run `npm --prefix web run test:summary`.
   - Run typecheck if TypeScript files changed.

Acceptance criteria:
- Reusable deterministic fixture helpers exist.
- Role/access helpers exist or documented blockers explain why not.
- Cleanup is explicit and safe.
- A narrow harness validation test passes.
- Existing full test baseline remains green.
- No schema/migration files changed.
- No product behavior changed.
- No full journey E2E pack added yet.
- Final response includes:
  - helper files added/changed
  - validation test added
  - cleanup strategy
  - commands run
  - final pass/fail status
  - any blockers
```

---

# Prompt 3 — Core Planner Journey Tests

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add the first core Planner Dash journey test pack using the deterministic test harness.

Current state:
- Existing baseline is green: `npm --prefix web run test:summary` passes 1501/1501.
- Typecheck passes.
- Deterministic DB-backed fixture harness exists at `web/lib/test-harness/planner-fixtures.ts`.
- Harness validation exists at `web/lib/test-harness/planner-fixtures.test.ts`.
- Harness docs exist at `docs/testing/PLANNER_DASH_TEST_HARNESS.md`.
- Coverage audit exists at `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`.
- Do not touch the unrelated pre-existing deletion: `docs/loop/GENERIC_PROMPT_LOOP_CONTROLLER.md`.

This pass adds the first real core Planner journey coverage. Keep it focused and deterministic.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not change package scripts unless absolutely required and explain why.
- Do not skip, loosen, or delete existing tests.
- Do not create broad brittle browser tests if the current repo does not have stable browser infrastructure.
- Prefer API/service-level journey tests if that is the current reliable test layer.
- If browser E2E infrastructure already exists and is stable, use it only where it adds real user-flow value.
- Use the deterministic harness helpers.
- Every test must own its setup and cleanup.
- Use `try/finally` cleanup.
- Do not rely on pre-seeded mutable data.
- Verify persisted state by re-reading from the database or route/service layer after mutation.
- Do not turn these into shallow smoke tests.

Add a new test pack for core Planner journeys.

Preferred location:
- If the repo already has a journey/e2e convention, follow it.
- Otherwise create `web/lib/test-journeys/planner-core-journeys.test.ts` or the closest existing convention.

Implement these journeys:

1. Event creation → workspace-ready data

Prove:
- a planner org/user/event can be created through the harness or existing event creation service
- the creator/owner relationship exists
- the event can be re-read after creation
- event-scoped starter data expected by current services is present if the product creates it
- cleanup removes owned data

This does not need to test visual navigation yet if browser E2E is not already stable.

2. Run of Show session lifecycle

Prove:
- create event room
- create MatrixRow/session
- update core Basics fields: title, session type, room, start, end
- re-read the session through the canonical Matrix 2 service/snapshot or route-level test helper
- verify Board/List/full-workspace-compatible state comes from the same MatrixRow-backed source
- reload/re-read verifies persisted values

3. Session quick drawer data workflow

Prove the data path behind the quick drawer:
- assign speaker to session
- assign AV requirement/selection
- assign F&B requirement or catalog item, depending on current canonical implementation
- assign staff/EventPerson to session
- re-read the session/module state
- verify each assignment persists and is session-scoped
- remove at least one assignment and verify it is removed from persisted state

This should test the canonical data/service/API behavior behind the quick drawer, not brittle DOM details unless existing UI E2E is already stable.

4. Room Set → Seating session-scoped assignment

Prove:
- create session
- create/load session-scoped SeatingPlan
- create SeatingTable
- create SeatingAttendee
- assign attendee to exact chair using `seatIndex`
- re-read assignment
- verify assignment is scoped to the session/seating plan
- cleanup removes data

5. Timeline lifecycle

Prove:
- create TimelineItem for event
- update status through a valid lifecycle state
- create TimelineDependency
- re-read and verify dependency links correctly
- cleanup removes data

Rules for implementation:
- Use the existing current product architecture as source of truth.
- MatrixRow is canonical for Matrix 2 session state.
- Room is event-scoped and links to MatrixRow.
- SessionSpeakerAssignment links Speaker to MatrixRow.
- EventPerson and SessionStaffAssignment support staffing.
- SessionRequirementTemplate/Section/Item/Selection represent AV/F&B/Staffing/setup/status requirement selections.
- EventFnbCatalogItem and SessionFnbCatalogAssignment represent canonical F&B catalog assignment.
- SeatingPlan can be scoped by MatrixRow/session.
- SeatingAssignment supports `seatIndex`.
- TimelineItem and TimelineDependency are event-scoped.
- Keep the tests meaningful but not over-broad.

Update documentation:
- Update `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`.
- Mark the implemented journeys as covered or partially covered with exact test file paths.
- Leave missing journeys clearly marked missing.
- Do not overclaim browser-level coverage if these are API/service/data journey tests.

Verification:
- Run the new journey test file directly.
- Run `npm --prefix web run test:summary`.
- Run typecheck if TypeScript files changed.

Acceptance criteria:
- A core Planner journey test pack exists.
- The journeys test real multi-step flows, not isolated one-liners.
- Tests use deterministic setup and cleanup.
- Tests verify persisted state by re-reading.
- Existing full test baseline remains green.
- Coverage matrix is updated truthfully.
- No schema/migration changes.
- No unrelated deletion is touched.
- Final response includes:
  - journey test file path
  - journeys added
  - what layer they test: API/service/data/browser
  - files changed
  - commands run
  - final pass/fail status
  - remaining gaps for Prompt 4
```

---

# Prompt 4 — Access / Tenancy Journey Tests

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add access, tenancy, and role-based journey coverage for Planner Dash.

Current state:
- Existing baseline is green: `npm --prefix web run test:summary` passes 1506/1506.
- Typecheck passes.
- Deterministic fixture harness exists at `web/lib/test-harness/planner-fixtures.ts`.
- Core Planner service/data journeys exist at `web/lib/test-journeys/planner-core-journeys.test.ts`.
- Coverage matrix exists at `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`.
- Do not touch the unrelated pre-existing deletion: `docs/loop/GENERIC_PROMPT_LOOP_CONTROLLER.md`.

This pass adds the P0 access/tenancy journey pack.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not change package scripts unless absolutely required and explain why.
- Do not skip, loosen, or delete existing tests.
- Do not add broad browser E2E coverage in this pass.
- Prefer API/service/data-level access contract tests using the deterministic harness.
- Use existing auth/access helpers and route/service conventions.
- If a route is currently unguarded and the test exposes a real access bug, fix the product code at the canonical server-side guard point.
- Do not paper over access failures by changing test expectations.
- Do not rely on UI-hidden buttons as access enforcement.
- Every test must own setup and cleanup.
- Use `try/finally` cleanup.
- Verify persisted state and denied writes by re-reading from the database or service layer.

Context/source of truth:
- Planner Dash is multi-tenant: Organization → optional Client → Event.
- Event-scoped modules must not leak across orgs or unrelated events.
- OWNER and ADMIN can list/edit org events.
- MEMBER and VIEWER require EventMember rows to see events.
- EVENT_VIEWER is read-only when guarded routes/services call write access checks.
- SUPER_ADMIN/platform admin behavior should only be tested if the existing test environment supports it cleanly.
- Server-side access enforcement is the real protection. UI visibility is not enough.

Preferred new test file:
- `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`
- If the repo has a better existing convention, follow it.

Implement these access/tenancy journeys:

1. Role matrix setup validation

Use the deterministic harness role helper to create:
- owner
- admin
- member with EventMember access
- viewer with EventMember access
- event viewer with read-only EventMember access
- unrelated same-org member without EventMember access
- unrelated other-org member
- super admin only if already supported cleanly

Prove:
- each user has the intended Membership/EventMember shape
- roles are attached to the correct org/event
- unrelated users are not accidentally attached to the protected event

2. Event visibility/access journey

For one protected event, prove:
- OWNER can read event-scoped data
- ADMIN can read event-scoped data
- MEMBER with EventMember can read event-scoped data
- VIEWER with EventMember can read event-scoped data if current product allows it
- EVENT_VIEWER can read event-scoped data
- unrelated same-org MEMBER without EventMember cannot read protected event data if current access rules require EventMember
- unrelated other-org user cannot read protected event data
- cross-event reads do not leak protected event data

Use canonical services/helpers where possible.

3. Write access journey: Matrix 2 session basics

For a protected event/session, prove:
- OWNER can update MatrixRow/session basics
- ADMIN can update MatrixRow/session basics
- MEMBER with write access can update only if current documented product allows it
- VIEWER/EVENT_VIEWER cannot update if read-only
- unrelated same-org user cannot update
- unrelated other-org user cannot update
- denied writes do not change persisted state

Re-read persisted state after every denied write attempt.

4. Write access journey: quick drawer assignment data path

For the same protected event/session, test at least:
- speaker assignment add/remove
- F&B catalog assignment add/remove or AV requirement selection, depending on which path has existing guarded service/route coverage

Prove:
- allowed write role can mutate
- read-only/unrelated roles cannot mutate
- denied mutations do not create assignments
- cross-event assignment IDs cannot be used to mutate protected event data

5. Seating access journey

For a protected event/session/seating plan, prove:
- allowed write role can assign attendee to exact seatIndex
- read-only role cannot assign/unassign
- unrelated same-org user cannot assign/unassign
- unrelated other-org user cannot assign/unassign
- denied assignment does not persist
- seating plan/session scope is enforced

6. Timeline access journey

For protected event timeline data, prove:
- allowed write role can create/update timeline item/dependency
- read-only/unrelated roles cannot create/update/delete
- denied writes do not persist
- cross-event dependency references are rejected or safely ignored according to current service behavior

7. API/route contract coverage where practical

If existing route handlers can be tested cleanly without browser E2E, add narrow route-level tests for the highest-risk access paths:
- Matrix 2 session update
- session assignment add/remove
- seating assign/unassign
- timeline item/dependency mutation

Only add route-level tests where they can use existing auth/session helpers cleanly. Do not invent a fake auth layer that gives false confidence.

8. Fix real access gaps if exposed

If the test reveals a route/service allows an unauthorized write:
- fix the canonical server-side access check
- keep the regression test
- do not rely on UI hiding
- keep route handlers thin: authenticate, authorize, validate, call service, return structured response
- document the fixed gap in the final response

9. Update docs

Update `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`:
- mark access/tenancy journey coverage as covered or partially covered with exact test file paths
- identify any remaining access gaps honestly
- do not overclaim browser-level coverage
- do not claim universal route guard coverage unless proven

Verification:
- Run the new access/tenancy journey test file directly.
- Run any focused route/access tests added.
- Run `npm --prefix web run test:summary`.
- Run typecheck if TypeScript files changed.

Acceptance criteria:
- Access/tenancy journey test pack exists.
- OWNER/ADMIN/MEMBER/VIEWER/EVENT_VIEWER/unrelated same-org/unrelated other-org paths are covered or documented with blockers.
- Denied writes verify persisted state did not change.
- At least Matrix 2/session basics, one quick drawer assignment path, seating, and timeline are covered.
- Real server-side access bugs found during the pass are fixed with regression coverage.
- Existing full test baseline remains green.
- Coverage matrix is updated truthfully.
- No schema/migration changes.
- No unrelated deletion is touched.
- Final response includes:
  - test file path
  - roles covered
  - journeys added
  - access bugs fixed, if any
  - files changed
  - commands run
  - final pass/fail status
  - remaining gaps for Prompt 5
```

---

# Prompt 5 — Lifecycle Journey Tests

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add deeper lifecycle journey coverage for Docs Hub, Budget approvals, Speaker assignment/portal-token behavior, and remaining high-risk module service/API regressions.

Current state:
- Baseline is green: `npm --prefix web run test:summary` passes 1513/1513.
- Typecheck passes.
- Core Planner service/data journeys exist.
- Access/tenancy journey pack exists.
- Matrix 2 F&B catalog assignment route guards were hardened in the prior pass.
- Deterministic fixture harness exists at `web/lib/test-harness/planner-fixtures.ts`.
- Coverage matrix exists at `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`.
- Do not touch the unrelated pre-existing deletion: `docs/loop/GENERIC_PROMPT_LOOP_CONTROLLER.md`.

This pass adds lifecycle journey coverage for the remaining high-risk modules.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not change package scripts unless absolutely required and explain why.
- Do not skip, loosen, or delete existing tests.
- Do not add broad browser E2E tests in this pass.
- Prefer service/API/data journey tests using the deterministic harness.
- Use existing services/routes/auth helpers where available.
- Every test must own setup and cleanup.
- Use `try/finally` cleanup.
- Verify persisted state by re-reading from DB, service, or route-level contract.
- Denied writes must verify persisted state did not change.
- If a real server-side access bug is exposed, fix the canonical server-side access path and keep the regression test.
- Do not paper over access bugs by changing expectations.
- Do not overclaim browser coverage in docs.

Add a new test file unless an existing convention is better:

`web/lib/test-journeys/planner-lifecycle-journeys.test.ts`

Implement these journeys:

1. Docs Hub lifecycle journey

Prove the current document lifecycle at service/API/data level:
- create event-scoped document data using existing service/route patterns or harness data
- create document version or finalize-upload equivalent if the existing test layer supports it cleanly
- submit document/version for review
- approve or reject
- reopen or pull back if supported by current service behavior
- verify approval/review state by re-reading persisted records
- verify activity/audit entries are created where the domain supports them
- verify unrelated event/org users cannot read or mutate protected document records where access helpers exist

Do not perform real external R2 upload. If upload routes are tested, use existing mocks/stubs already present in the repo. Do not invent fake storage behavior that gives false confidence.

2. Budget approval lifecycle journey

Prove:
- create Budget/BudgetVersion/BudgetLineItem or use existing budget service creation path
- submit for review or create current supported submission state
- approve
- reject/revise path if supported by current service behavior
- verify BudgetActivity or approval activity records are created where expected
- verify persisted state after each transition
- verify read-only/unrelated users cannot approve/reject/mutate protected budget state
- verify denied writes do not change persisted state

3. Speaker lifecycle and assignment journey

Prove:
- create event-scoped Speaker
- assign Speaker to MatrixRow/session
- re-read Matrix 2/session state and verify assignment
- remove assignment and verify persisted removal
- verify speaker readiness/onsite/document/message/note data can be scoped to the event if existing services support it cleanly
- verify unrelated event/org users cannot mutate protected speaker records
- verify denied writes do not change persisted state

4. Speaker portal/token-safe journey

Prove:
- speaker portal/intake token access is token-scoped
- portal/token route or service can read only the intended speaker/event data
- planner session auth is not required for the token-scoped path if that is current product behavior
- invalid/expired/wrong token is rejected if current service supports that state
- token path does not expose unrelated event/org speaker data

Use existing token models/services/routes. Do not redesign portal auth.

5. Cross-module tenant isolation sweep

Using one protected event and one unrelated event/org:
- verify document records do not leak across event/org
- verify budget records do not leak across event/org
- verify speaker records do not leak across event/org
- verify Matrix session assignment IDs from another event cannot be used to mutate protected event data
- verify denied cross-event mutations leave DB unchanged

6. Route/source contract hardening where practical

Add narrow route/source contract tests only where existing test patterns make them reliable:
- Docs review/approval routes
- Budget approval/review routes
- Speaker create/update/delete/assignment routes
- Speaker portal token route

Do not build fake auth that bypasses the real authorization layer. If a route cannot be tested honestly yet, document the blocker in the coverage matrix.

7. Update docs

Update `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`:
- mark Docs, Budget, Speaker, and Speaker portal lifecycle coverage as covered/partial/missing with exact test paths
- identify whether each is service/data/API/browser coverage
- identify remaining gaps honestly
- do not claim browser E2E coverage unless browser tests were actually added
- do not claim universal route guard coverage unless proven

Verification:
- Run the new lifecycle journey test file directly.
- Run any focused route/source-contract tests added.
- Run `npm --prefix web run test:summary`.
- Run `npm --prefix web run typecheck` if TypeScript files changed.

Acceptance criteria:
- Lifecycle journey test pack exists.
- Docs lifecycle has meaningful coverage or documented blockers.
- Budget approval lifecycle has meaningful coverage or documented blockers.
- Speaker assignment lifecycle has meaningful coverage.
- Speaker portal/token behavior has meaningful coverage or documented blockers.
- Cross-module tenant isolation is covered for Docs/Budget/Speakers where practical.
- Any real server-side access bugs found are fixed with regression coverage.
- Existing full test baseline remains green.
- Coverage matrix is updated truthfully.
- No schema/migration changes.
- No unrelated deletion is touched.
- Final response includes:
  - test file path
  - journeys added
  - what layer they test: service/data/API/browser
  - access bugs fixed, if any
  - files changed
  - commands run
  - final pass/fail status
  - remaining gaps for Prompt 6
```

---

# Prompt 6 — Regression Policy, Scripts, Hardening Summary

```text
You are working in the Planner OS / Planner Dash repository.

Goal: make the new testing strategy enforceable and documented: CI/test command wiring, regression policy, final coverage gap report, and a safe next-step plan for browser E2E.

Current state:
- Baseline is green: `npm --prefix web run test:summary` passes 1519/1519.
- Typecheck passes.
- Deterministic test harness exists.
- Core Planner journey tests exist.
- Access/tenancy journey tests exist.
- Lifecycle journey tests exist.
- Recent passes fixed real server-side access gaps in Matrix 2 F&B catalog assignment routes and Docs Hub routes.
- Coverage matrix exists at `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`.
- Harness docs exist at `docs/testing/PLANNER_DASH_TEST_HARNESS.md`.
- Do not touch the unrelated pre-existing deletion: `docs/loop/GENERIC_PROMPT_LOOP_CONTROLLER.md`.

This pass should not add more product features. It should make the test system understandable, repeatable, and harder to bypass.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not change product behavior.
- Do not skip, loosen, or delete existing tests.
- Do not add broad browser E2E tests in this pass.
- Do not add fake auth or fake browser coverage.
- Do not overclaim coverage.
- Only change package scripts or CI workflows if the repo already has conventions that make this safe.
- If CI cannot run a command due to environment/secrets/local DB requirements, document the blocker clearly instead of pretending it is enforced.
- Preserve the unrelated `docs/loop/GENERIC_PROMPT_LOOP_CONTROLLER.md` deletion as untouched.

Tasks:

1. Inspect current test commands and CI

Inspect:
- root `package.json`
- `web/package.json`
- existing CI workflows under `.github/workflows` or equivalent
- current test docs
- the new test coverage matrix and harness docs

Identify:
- which commands run typecheck
- which commands run unit/service/API tests
- which commands run the new harness/journey tests
- whether `test:summary` includes the new journey packs
- whether CI currently runs any of these
- whether browser E2E infrastructure exists but is unused, absent, or not stable

2. Add or document canonical test commands

Create or update documentation so engineers know the exact commands:

- full local verification
- focused harness validation
- focused core journey tests
- focused access/tenancy journey tests
- focused lifecycle journey tests
- typecheck
- any existing browser/E2E command, if present

If package scripts already have a safe pattern, add scripts only if useful and low-risk, such as:
- `test:harness`
- `test:journeys`
- `test:journeys:core`
- `test:journeys:access`
- `test:journeys:lifecycle`

Do not change scripts if that would disrupt existing workflows. If you do add scripts, run them.

3. Create regression policy

Create:

`docs/testing/REGRESSION_POLICY.md`

It must state:

- expensive/confusing/customer-facing bugs require regression coverage before merge
- permission/tenant bugs require access tests and denied-write persistence assertions
- workflow bugs require journey coverage, not just isolated unit tests
- state machine bugs require service/API coverage and persisted rereads
- destructive actions must verify final DB/service state
- UI-hidden buttons are not enforcement
- server-side authorization is required
- tests must own setup/cleanup
- no shared mutable fixtures
- no skipped tests to hide product bugs
- no schema changes without schema proposal/migration review
- every PR touching high-risk modules must update or explicitly notate the coverage matrix

High-risk modules:
- Events
- Matrix 2 / Run of Show
- Session quick drawer assignments
- Room Set
- Seating
- Docs Hub
- Budget approvals
- Speakers
- Speaker portal/token flows
- F&B Catalog
- Timeline
- Platform Admin/account switching
- Authentication/session/access helpers

4. Create final test hardening summary

Create:

`docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Include:

- what existed before this hardening effort
- what was added:
  - coverage matrix
  - deterministic harness
  - core journey pack
  - access/tenancy journey pack
  - lifecycle journey pack
  - route/access fixes found by tests
- exact test files added
- exact product route files hardened
- commands that now prove the suite is green
- current test count
- what layer is covered: service/data/API-source
- what is still not covered: browser UI E2E, live HTTP route execution with real auth cookies, mocked R2 upload route execution, universal route guard execution, planner UI/portal UI workflows
- recommended next P0/P1/P2 testing roadmap

5. Update coverage matrix

Update `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md` only as needed so it reflects the final state.

It must clearly say:
- Planner Dash now has service/data/API-source journey coverage.
- Planner Dash still does not have full browser-level LR-style UI journey coverage unless actual browser tests exist.
- Core journeys covered by exact file path.
- Access/tenancy journeys covered by exact file path.
- Lifecycle journeys covered by exact file path.
- Remaining gaps are explicit and not hidden.

6. CI/workflow update if safe

If the repo already has CI and the test environment supports the commands without local-only secrets:
- add the canonical typecheck/test command to CI
- include journey tests if they are part of `test:summary` or safe to run directly
- keep CI changes minimal

If CI cannot honestly run these because it needs local DB/secrets:
- do not add fake CI
- document the blocker and exact env requirements in the hardening summary

7. Verification

Run:
- focused harness validation
- focused core journey test
- focused access/tenancy journey test
- focused lifecycle journey test
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`

If new package scripts were added, run those scripts too.

Acceptance criteria:
- Regression policy doc exists.
- Final hardening summary doc exists.
- Coverage matrix is truthful and updated.
- Canonical test commands are documented.
- Package scripts or CI are updated only if safe.
- Existing baseline remains green.
- No schema/migration changes.
- No product behavior changes.
- No unrelated deletion is touched.
- Final response includes:
  - docs added/changed
  - scripts/CI changed or why not
  - commands run
  - final pass/fail status
  - remaining testing gaps
  - recommended next testing prompt for browser E2E, if appropriate
```

---

# Browser Prompt 1 — First P0 Browser Journey

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add the first deterministic browser E2E layer for Planner Dash using Playwright or the repo’s existing browser test framework.

Current state:
- Non-browser hardening is complete and green.
- `npm --prefix web run test:summary` passes 1519/1519.
- `npm --prefix web run test:journeys` passes 18/18.
- Deterministic fixture harness exists at `web/lib/test-harness/planner-fixtures.ts`.
- Core, access/tenancy, and lifecycle service/data/API-source journey tests exist.
- Test docs exist under `docs/testing/`.
- Remaining major gap: browser UI E2E journeys.
- Do not touch the unrelated pre-existing deletion: `docs/loop/GENERIC_PROMPT_LOOP_CONTROLLER.md`.

This pass should add a small, reliable browser E2E foundation and one P0 browser journey. Do not try to cover the whole product yet.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not change product behavior unless the browser test exposes a real product bug.
- Do not skip, loosen, or delete existing tests.
- Do not add fake browser coverage.
- Do not fake authorization in a way that bypasses the real app behavior.
- Do not rely on shared mutable seed data.
- Every browser test must own its data and clean up after itself.
- Prefer semantic selectors and accessible roles.
- Add `data-testid` only where it materially improves reliability for an important workflow.
- Avoid brittle pixel/layout assertions in this pass.
- Do not test external R2 upload in this pass.
- Keep this to one focused P0 browser journey.

Tasks:

1. Inspect existing browser/E2E setup

Inspect:
- `web/package.json`
- root `package.json`
- Playwright/Cypress config files if present
- existing browser/E2E test directories
- existing auth/session helpers
- existing dev login/test login support
- app route structure for Events and Matrix 2

Determine:
- whether Playwright already exists
- how the app is started for browser tests
- how test users can authenticate honestly
- where browser tests should live
- what command should run the new browser smoke journey

2. Add browser E2E harness utilities

Create or extend browser test helpers for:
- isolated test data creation using the existing deterministic fixture harness
- cleanup in `afterEach`/`finally`
- authenticated browser state for a real planner user
- app navigation helpers for:
  - Events list
  - Event workspace
  - Run of Show / Matrix 2
  - Session quick drawer
- stable waiting helpers that wait for user-visible state, not arbitrary timers

Authentication requirement:
- Use existing login/session behavior if available.
- If a test-only auth helper already exists, use it.
- If no honest browser auth path exists, document the blocker and add only the non-browser harness/docs needed for future browser auth.
- Do not invent a fake auth path that gives false confidence.

3. Add first P0 browser journey

Preferred file:
- `web/e2e/planner-p0-browser-journey.spec.ts`
- If the repo already has a different browser convention, follow it.

Implement this journey:

Planner creates/opens event → edits Run of Show session → uses quick drawer assignment → reload verifies UI state.

The test should:
- create isolated org/user/event/session/room/speaker/F&B/staff data through the fixture harness or a safe setup helper
- authenticate as an allowed planner user
- open the app in the browser
- navigate to Events
- open the test event workspace
- open Run of Show / Matrix 2
- find the seeded session
- open the session quick drawer or equivalent session edit surface
- update at least one Basics field, preferably title or room/time if stable
- assign or verify one Speaker through the UI if the UI path is stable
- assign or verify one F&B/catalog item or requirement through the UI if stable
- save/close as current UI requires
- reload the page
- verify the updated Basics field and at least one assignment are still visible
- cleanup all owned data

Keep the test focused. If one assignment UI is too unstable, cover the most stable assignment path and document the skipped path as a remaining browser gap.

4. Add denied-write browser smoke if stable

If the existing auth/session setup makes it reliable, add a second tiny browser test:

Read-only EVENT_VIEWER can open the event but cannot perform a write from the same UI surface.

It should:
- authenticate as EVENT_VIEWER
- open the protected event
- verify read access
- verify edit/save action is unavailable or blocked
- attempt no destructive workaround
- confirm persisted data did not change by DB/service reread

If this is not stable in browser yet, do not force it. Document it as the next P0 browser access test.

5. Add focused scripts if safe

If Playwright exists or is added safely, add focused scripts in `web/package.json`, such as:
- `test:e2e`
- `test:e2e:p0`

Only add scripts that work locally.

Do not wire CI unless the browser test environment can honestly run in CI with documented env requirements.

6. Update docs

Update:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Document:
- browser E2E harness location
- browser test command
- exact P0 browser journey covered
- whether access browser journey is covered or still missing
- remaining browser gaps
- any auth/session limitations

Do not overclaim. Clearly distinguish:
- service/data journeys
- API/source-contract tests
- browser UI E2E journeys

7. Verification

Run:
- new browser E2E test command
- focused journey command if added
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`

Acceptance criteria:
- Browser E2E harness exists or a blocker is documented with exact missing auth/startup requirement.
- At least one real P0 browser journey exists if auth/startup is available.
- Browser journey owns setup and cleanup.
- Browser journey verifies persisted UI state after reload.
- Existing non-browser suite remains green.
- No schema/migration changes.
- No unrelated deletion is touched.
- Coverage docs are updated truthfully.
- Final response includes:
  - browser test file path
  - browser helpers added/changed
  - journey covered
  - auth approach used
  - scripts added/changed
  - commands run
  - final pass/fail status
  - remaining browser E2E gaps
```

---

# Browser Prompt 2 — Browser Access P0

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add the next P0 browser E2E access test.

Current state:
- First deterministic Playwright browser E2E layer exists.
- `npm --prefix web run test:e2e:p0` passes 1/1.
- `npm --prefix web run test:journeys` passes 18/18.
- `npm --prefix web run test:summary` passes 1519/1519.
- Deterministic fixture harness exists.
- Browser helper exists at `web/e2e/helpers/planner-e2e.ts`.
- Existing browser journey exists at `web/e2e/planner-p0-browser-journey.spec.ts`.

Goal of this pass:
Add a browser E2E test proving read-only event access cannot mutate Matrix session data.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not loosen or skip tests.
- Do not fake authorization.
- Use the existing deterministic fixture harness.
- Use existing browser E2E helpers.
- Use real app navigation and the existing dev/test auth approach already used by the first browser test.
- Every test must own setup and cleanup.
- Verify denied write by rereading persisted DB/service state after the UI attempt.
- Keep this focused. Do not expand into all modules yet.

Add or update:

`web/e2e/planner-p0-browser-journey.spec.ts`

or create:

`web/e2e/planner-access-browser-journey.spec.ts`

Implement:

1. Create isolated fixture data:
   - org
   - event
   - session / MatrixRow
   - room
   - owner/admin user
   - EVENT_VIEWER user for the same event

2. Authenticate in browser as EVENT_VIEWER.

3. Navigate through the real UI:
   - Events
   - open protected event
   - Run of Show / Matrix 2
   - locate seeded session

4. Prove read access:
   - session is visible
   - current title/room/time or stable session field is visible

5. Attempt write path safely:
   - open the stable edit surface used by the first browser test
   - verify edit/save controls are unavailable, disabled, blocked, or server-rejected
   - do not force destructive behavior
   - capture the actual current product behavior in assertions

6. Verify denied write did not mutate:
   - reread MatrixRow/session from DB or canonical service
   - assert original title/session data is unchanged

7. Cleanup all owned data.

Update docs:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Document:
- browser access journey added
- role tested: EVENT_VIEWER
- layer: browser UI + DB reread
- remaining browser gaps

Verification:
- run the new/focused browser test
- run `npm --prefix web run test:e2e:p0`
- run `npm --prefix web run test:journeys`
- run `npm --prefix web run typecheck`
- run `npm --prefix web run test:summary`

Acceptance criteria:
- Browser access P0 test exists.
- EVENT_VIEWER can read protected event/session UI.
- EVENT_VIEWER cannot mutate Matrix session data.
- DB/service reread proves denied write did not persist.
- Existing suites remain green.
- Docs updated truthfully.
- No schema/migration changes.
```

---

# Browser Prompt 3 — Matrix Quick Drawer Speaker Assignment

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add the next P0 browser E2E journey for the actual Matrix session quick drawer assignment workflow.

Current state:
- Non-browser journeys pass: `npm --prefix web run test:journeys` → 18/18.
- Browser P0 tests pass: `npm --prefix web run test:e2e:p0` → 2/2.
- Full suite passes: `npm --prefix web run test:summary` → 1519/1519.
- Existing browser helper exists at `web/e2e/helpers/planner-e2e.ts`.
- Existing browser specs:
  - `web/e2e/planner-p0-browser-journey.spec.ts`
  - `web/e2e/planner-access-browser-journey.spec.ts`
- The remaining gap is that the browser layer has not yet proven the actual Matrix quick drawer assignment UI path.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not loosen, skip, or delete existing tests.
- Do not fake authorization.
- Use the existing deterministic fixture harness.
- Use the existing Playwright/browser helper patterns.
- Every test must own setup and cleanup.
- Prefer semantic selectors and accessible roles.
- Add `data-testid` only where it materially improves reliability for this important workflow.
- Do not add broad browser coverage across every module yet.
- Keep this focused on the Matrix quick drawer assignment workflow.
- Do not overclaim browser coverage in docs.

Preferred file:
- Add `web/e2e/planner-quick-drawer-browser-journey.spec.ts`
- Or extend the existing P0 browser spec only if that is the cleaner local convention.

Implement this browser journey:

Planner opens Matrix session quick drawer → assigns session resources → reload verifies persisted UI state.

Test setup:
- Create isolated org/user/event data.
- Create an editor-capable planner user.
- Create event.
- Create room.
- Create MatrixRow/session.
- Create at least one Speaker.
- Create at least one F&B catalog item or F&B requirement item, depending on the most stable current UI path.
- Create at least one EventPerson/staffing record if the current quick drawer staffing UI is stable.
- Cleanup all owned data after test.

Browser flow:
1. Authenticate as the editor-capable planner user using the existing dev/test auth approach.
2. Navigate through the real UI:
   - Events
   - open the test event workspace
   - Run of Show / Matrix 2
3. Locate the seeded session.
4. Open the session quick drawer or current session quick-edit surface.
5. Use the actual quick drawer UI to assign at least one resource:
   - Speaker assignment is required if the UI path is stable.
   - Add F&B catalog/requirement assignment if stable.
   - Add Staffing/EventPerson assignment if stable.
6. Close and reopen the drawer.
7. Verify the assigned resource is visible in the drawer or session card/status UI.
8. Reload the page.
9. Verify the assigned resource still appears in the UI after reload.
10. Reread the DB or canonical service after the browser flow and verify the assignment persisted.
11. Cleanup all owned fixture data.

If one assignment panel is not stable:
- Do not force brittle coverage.
- Cover the most stable real quick drawer assignment path.
- Document the skipped assignment path as a remaining browser gap.
- Do not replace a real UI assignment flow with a direct DB mutation and call it browser coverage.

Add access sanity only if cheap and stable:
- Confirm the editor user can perform the assignment.
- Do not add EVENT_VIEWER denied-write here unless it is very low-risk; that is already covered by the browser access P0 test.

Scripts:
- Add a focused script only if useful:
  - `test:e2e:quick-drawer`
- Update `test:e2e:p0` to include this new P0 browser spec if it remains reliable and focused.

Docs:
Update:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Document:
- quick drawer browser journey added
- exact file path
- assignment path covered
- layer: browser UI + DB/service reread
- remaining quick drawer browser gaps
- remaining broader browser gaps

Verification:
Run:
- focused new quick drawer browser test
- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:
- Quick drawer browser journey test exists.
- It uses real UI navigation and the actual quick drawer/edit surface.
- It assigns at least one resource through the UI.
- It verifies the assignment in UI after close/reopen or reload.
- It verifies persisted assignment through DB/service reread.
- Existing browser P0 tests remain green.
- Existing non-browser journeys remain green.
- Full suite remains green.
- No schema/migration changes.
- Docs updated truthfully.
- Final response includes:
  - test file path
  - resource assignment path covered
  - helper changes
  - scripts changed
  - docs changed
  - commands run
  - final pass/fail status
  - remaining browser gaps
```

---

# Browser Prompt 4 — Room Set / Seating Browser P0

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add the next P0 browser E2E journey for the Room Set / Seating UI workflow.

Current state:
- Non-browser journeys pass: `npm --prefix web run test:journeys` → 18/18.
- Browser P0 tests pass: `npm --prefix web run test:e2e:p0` → 3/3.
- Full suite passes: `npm --prefix web run test:summary` → 1519/1519.
- Existing browser helpers live at `web/e2e/helpers/planner-e2e.ts`.
- Existing browser specs include:
  - `web/e2e/planner-p0-browser-journey.spec.ts`
  - `web/e2e/planner-access-browser-journey.spec.ts`
  - `web/e2e/planner-quick-drawer-browser-journey.spec.ts`
- Existing deterministic fixture harness exists at `web/lib/test-harness/planner-fixtures.ts`.
- Do not touch unrelated files.

Goal of this pass:
Add a focused browser journey proving the actual Room Set / Seating UI path can open from a Matrix session, perform a meaningful seating workflow if stable, reload, and verify persisted state.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not loosen, skip, or delete existing tests.
- Do not fake authorization.
- Use existing deterministic fixture helpers.
- Use existing Playwright/helper patterns.
- Every test must own setup and cleanup.
- Prefer semantic selectors and accessible roles.
- Add `data-testid` only where it materially improves reliability for this important workflow.
- Do not add broad browser coverage across every Room Set feature yet.
- Avoid brittle canvas/pixel/layout assertions.
- Test the stable workflow path, not visual perfection.
- Do not overclaim coverage in docs.

Preferred new file:
`web/e2e/planner-room-set-seating-browser-journey.spec.ts`

Implement this browser journey:

Planner opens Matrix session → enters Room Set / Seating mode → creates or verifies seating plan/table/attendee assignment → reload verifies persisted UI/DB state.

Test setup:
- Create isolated org/user/event data.
- Create editor-capable planner user.
- Create event.
- Create room.
- Create MatrixRow/session linked to the room.
- Create seating plan/table/attendee fixture data if the UI currently expects pre-existing seating data.
- If the UI supports creating table/attendee through the browser path reliably, prefer testing that actual UI path.
- Cleanup all owned data after the test.

Browser flow:
1. Authenticate as the editor-capable planner user using the existing dev/test auth approach.
2. Navigate through the real UI:
   - Events
   - open the test event workspace
   - Run of Show / Matrix 2
3. Locate the seeded session.
4. Open the Room Set or Seating action from the session card/quick launcher/full workspace path, using the current real UI.
5. Enter Seating mode if the route/workspace does not open directly into seating.
6. Verify the session-scoped seating workspace loads for the correct MatrixRow/session.
7. Perform the most stable meaningful seating action:
   - assign attendee to a table/chair/seat if the UI supports it reliably
   - or create/load a seating plan/table and assign an attendee if that is the current stable path
8. Verify the assignment appears in the UI.
9. Reload the page.
10. Verify the seating assignment still appears in the UI after reload.
11. Reread Prisma/canonical service data and verify:
   - assignment exists
   - assignment is scoped to the correct event
   - assignment is scoped to the correct MatrixRow/seatingPlan when applicable
   - `seatIndex` is persisted if the UI path assigns an exact chair
12. Cleanup all owned fixture data.

If exact chair assignment is not stable in the current browser UI:
- Do not force brittle drag/drop/canvas testing.
- Cover the strongest stable browser path available.
- Keep DB/service reread assertions.
- Document the exact remaining gap: “browser exact-chair assignment still missing.”
- Do not replace the browser action with a direct DB mutation and call it browser coverage.

Access sanity:
- Keep this pass editor-only unless adding read-only access is trivial and stable.
- EVENT_VIEWER denied-write browser coverage already exists; do not duplicate it here unless the Room Set UI exposes a unique access gap.

Scripts:
- Add a focused script if useful:
  - `test:e2e:room-set`
- Update `test:e2e:p0` to include this spec only if it is reliable and focused.

Docs:
Update:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Document:
- Room Set / Seating browser journey added
- exact test file path
- whether exact-chair `seatIndex` is covered in browser
- whether the layer is browser UI + DB/service reread
- remaining Room Set / Seating browser gaps
- remaining broader browser gaps

Verification:
Run:
- `npm --prefix web run test:e2e:room-set` if added
- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:
- Room Set / Seating browser journey test exists.
- It uses real UI navigation from Events/Event workspace/Run of Show.
- It opens the real Room Set / Seating workflow.
- It performs at least one meaningful seating UI action if stable.
- It verifies persisted state after reload.
- It verifies persisted state through DB/service reread.
- Existing browser P0 tests remain green.
- Existing non-browser journeys remain green.
- Full suite remains green.
- No schema/migration changes.
- Docs updated truthfully.
- Final response includes:
  - test file path
  - Room Set / Seating browser path covered
  - whether exact `seatIndex` browser coverage landed
  - helper changes
  - scripts changed
  - docs changed
  - commands run
  - final pass/fail status
  - remaining browser gaps
```

---

# Browser Prompt 5 — Docs Hub Browser P0

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add the next P0 browser E2E journey for Docs Hub review lifecycle UI.

Current state:
- Non-browser journeys pass: `npm --prefix web run test:journeys` → 18/18.
- Browser P0 tests pass: `npm --prefix web run test:e2e:p0` → 4/4.
- Full suite passes: `npm --prefix web run test:summary` → 1519/1519.
- Existing browser helpers live at `web/e2e/helpers/planner-e2e.ts`.
- Existing browser specs include Matrix edit, access denied-write, quick drawer speaker assignment, and Room Set / Seating exact-chair assignment.
- Deterministic fixture harness exists at `web/lib/test-harness/planner-fixtures.ts`.
- Docs lifecycle service/data coverage already exists.
- Docs Hub route access gaps were previously fixed.
- Do not touch unrelated files.

Goal of this pass:
Add a focused browser journey proving the actual Docs Hub UI can load an event-scoped document/version and perform the most stable meaningful review lifecycle action, with reload and DB/service reread.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not loosen, skip, or delete existing tests.
- Do not fake authorization.
- Use existing deterministic fixture helpers.
- Use existing Playwright/helper patterns.
- Every test must own setup and cleanup.
- Prefer semantic selectors and accessible roles.
- Add `data-testid` only where it materially improves reliability for this important workflow.
- Do not perform real external R2 upload in this pass.
- Do not fake browser coverage by doing all mutations directly in the DB.
- Avoid broad Docs Hub coverage; keep this to one stable P0 lifecycle journey.
- Do not overclaim coverage in docs.

Preferred new file:
`web/e2e/planner-docs-browser-journey.spec.ts`

Implement this browser journey:

Planner opens event Docs Hub → sees seeded document/version → performs review lifecycle action through UI → reload verifies UI state → DB reread verifies persisted state/activity.

Test setup:
- Create isolated org/user/event data.
- Create editor-capable planner user.
- Create event.
- Create event-scoped document data through the fixture harness or existing service path.
- Create a document version or finalized-version equivalent through the safest existing helper/service path.
- If the UI requires a review-ready document state, seed the minimum valid state through service/data setup.
- Cleanup all owned data after the test.

Browser flow:
1. Authenticate as the editor-capable planner user using the existing dev/test auth approach.
2. Navigate through the real UI:
   - Events
   - open the test event workspace
   - Docs
3. Verify the seeded document appears in Docs Hub.
4. Open the document detail/review UI if applicable.
5. Perform the most stable meaningful lifecycle action through the UI:
   - submit for review if the UI supports it reliably
   - or approve/reject/reopen if the seeded state makes that the stable path
   - choose the path that best matches current product behavior and stable selectors
6. Verify the updated document/review state appears in the UI.
7. Reload the page.
8. Verify the updated state still appears in the UI after reload.
9. Reread Prisma/canonical document service data and verify:
   - document/version belongs to the correct event
   - review/lifecycle state persisted
   - activity/audit row exists where the domain supports it
10. Cleanup all owned fixture data.

If upload UI is not stable or requires external R2:
- Do not test real upload in this pass.
- Seed the document/version through fixture/service setup.
- Document the remaining gap: “browser upload/presign/finalize with mocked R2 still missing.”
- Do not pretend seeded document review is upload coverage.

Access sanity:
- Keep this pass editor-only unless adding read-only Docs denied-write is trivial and stable.
- EVENT_VIEWER denied-write browser coverage exists for Matrix; Docs-specific access browser coverage can be a later P0/P1 test.

Scripts:
- Add a focused script if useful:
  - `test:e2e:docs`
- Update `test:e2e:p0` to include this spec only if it is reliable and focused.

Docs:
Update:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Document:
- Docs Hub browser journey added
- exact test file path
- lifecycle action covered
- whether upload is covered or still missing
- layer: browser UI + DB/service reread
- remaining Docs browser gaps
- remaining broader browser gaps

Verification:
Run:
- `npm --prefix web run test:e2e:docs` if added
- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:
- Docs Hub browser journey test exists.
- It uses real UI navigation from Events/Event workspace/Docs.
- It verifies an event-scoped document appears in the UI.
- It performs at least one meaningful document lifecycle action through the UI if stable.
- It verifies persisted state after reload.
- It verifies persisted state through DB/service reread.
- It does not perform real external R2 upload.
- Existing browser P0 tests remain green.
- Existing non-browser journeys remain green.
- Full suite remains green.
- No schema/migration changes.
- Docs updated truthfully.
- Final response includes:
  - test file path
  - Docs browser path covered
  - lifecycle action covered
  - whether upload coverage landed or remains missing
  - helper changes
  - scripts changed
  - docs changed
  - commands run
  - final pass/fail status
  - remaining browser gaps
```

---

# Browser Prompt 6 — Budget Browser P0

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add the next P0 browser E2E journey for the Budget UI lifecycle.

Current state:
- Non-browser journeys pass: `npm --prefix web run test:journeys` → 18/18.
- Browser P0 tests pass: `npm --prefix web run test:e2e:p0` → 5/5.
- Full suite passes: `npm --prefix web run test:summary` → 1519/1519.
- Existing browser helpers live at `web/e2e/helpers/planner-e2e.ts`.
- Existing browser specs include Matrix edit, access denied-write, quick drawer speaker assignment, Room Set / Seating exact-chair assignment, and Docs Hub submit-for-review.
- Deterministic fixture harness exists at `web/lib/test-harness/planner-fixtures.ts`.
- Budget lifecycle service/data coverage already exists.
- Do not touch unrelated files.

Goal of this pass:
Add a focused browser journey proving the actual Budget UI can load event-scoped budget data, perform one meaningful lifecycle/action path if stable, reload, and verify persisted state/activity.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not loosen, skip, or delete existing tests.
- Do not fake authorization.
- Use existing deterministic fixture helpers.
- Use existing Playwright/helper patterns.
- Every test must own setup and cleanup.
- Prefer semantic selectors and accessible roles.
- Add `data-testid` only where it materially improves reliability for this important workflow.
- Do not fake browser coverage by doing all mutations directly in the DB.
- Avoid broad Budget coverage; keep this to one stable P0 lifecycle journey.
- Do not overclaim coverage in docs.

Preferred new file:
`web/e2e/planner-budget-browser-journey.spec.ts`

Implement this browser journey:

Planner opens event Budget → sees seeded budget/line item → performs one stable budget action through UI → reload verifies UI state → DB/service reread verifies persisted state/activity.

Test setup:
- Create isolated org/user/event data.
- Create editor-capable planner user.
- Create event.
- Create Budget/BudgetVersion/BudgetLineItem fixture data through the deterministic harness or existing service path.
- If the UI requires a specific budget state for review/submission, seed the minimum valid state through service/data setup.
- Cleanup all owned data after the test.

Browser flow:
1. Authenticate as the editor-capable planner user using the existing dev/test auth approach.
2. Navigate through the real UI:
   - Events
   - open the test event workspace
   - Budget
3. Verify the seeded budget or budget line item appears in the Budget UI.
4. Perform the most stable meaningful Budget action through the UI:
   - edit a line item amount/name/category if that is the stable path
   - or submit for review if the UI supports it reliably
   - or approve/reject/revise if the seeded state makes that the stable path
   - choose the strongest stable path that reflects current product behavior
5. Verify the updated budget state or line item state appears in the UI.
6. Reload the page.
7. Verify the updated state still appears in the UI after reload.
8. Reread Prisma/canonical budget service data and verify:
   - budget/version/line item belongs to the correct event
   - the UI action persisted
   - BudgetActivity/BudgetApproval exists where the domain supports it
9. Cleanup all owned fixture data.

If approval/review UI is not stable:
- Do not force brittle coverage.
- Cover the strongest stable browser path available, preferably line item edit + persisted reread.
- Document the exact remaining gap: “Budget browser approval/rejection lifecycle still missing.”
- Do not replace the browser action with a direct DB mutation and call it browser coverage.

Access sanity:
- Keep this pass editor-only unless read-only Budget denied-write is trivial and stable.
- Matrix EVENT_VIEWER denied-write browser coverage already exists; Budget-specific denied-write can be a later test.

Scripts:
- Add a focused script if useful:
  - `test:e2e:budget`
- Update `test:e2e:p0` to include this spec only if it is reliable and focused.

Docs:
Update:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Document:
- Budget browser journey added
- exact test file path
- lifecycle/action path covered
- whether approval/rejection/revision is covered or still missing
- layer: browser UI + DB/service reread
- remaining Budget browser gaps
- remaining broader browser gaps

Verification:
Run:
- `npm --prefix web run test:e2e:budget` if added
- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:
- Budget browser journey test exists.
- It uses real UI navigation from Events/Event workspace/Budget.
- It verifies event-scoped budget data appears in the UI.
- It performs at least one meaningful budget action through the UI if stable.
- It verifies persisted state after reload.
- It verifies persisted state through DB/service reread.
- Existing browser P0 tests remain green.
- Existing non-browser journeys remain green.
- Full suite remains green.
- No schema/migration changes.
- Docs updated truthfully.
- Final response includes:
  - test file path
  - Budget browser path covered
  - lifecycle/action covered
  - whether approval/rejection/revision browser coverage landed or remains missing
  - helper changes
  - scripts changed
  - docs changed
  - commands run
  - final pass/fail status
  - remaining browser gaps
```

---

# Test Output Cleanup Prompt

```text
You are working in the Planner OS / Planner Dash repository.

Goal: clean up test output so the test package produces readable pass/fail results without hiding real failures.  

Current state:

- Browser P0 tests are passing.
- Non-browser journeys are passing.
- Full test summary is passing.
- But terminal output is extremely noisy during Playwright/browser runs.
- The noise includes repeated Supabase auth fallback warnings, API request logs, Budget debug logs, slow request blocks, and pg deprecation warnings.
- Do not touch Prisma schema or migrations.

Important constraints:

- Do not hide real test failures.
- Do not suppress Playwright assertion failures, browser console errors, thrown exceptions, or failed network requests that tests explicitly care about.
- Do not remove production logging entirely.
- Logging should remain available when explicitly enabled.
- Keep normal local test output clean and readable.
- Prefer environment-gated logging over deleting useful diagnostics.
- Do not change product behavior.
- Do not loosen, skip, or delete tests.
- No schema or migration changes.

Tasks:

1. Inspect current logging sources

Find where these logs come from:

- `ensureProvisionedUserAndContext: supabase.auth.getUser failed`
- `api.request.completed`
- `DEBUG BUDGET LOAD`
- `DEBUG RECIPIENTS`
- pg deprecation warning related to `client.query() when the client is already executing a query`

Inspect:

- auth/session helpers
- API request logger/middleware
- budget service debug logging
- Playwright config/webServer settings
- package scripts for e2e tests

2. Add a clean test logging mode

Implement a clear test logging policy:

- normal Playwright runs should show concise pass/fail output
- app/server diagnostic logs should be quiet by default under e2e tests
- logs can be re-enabled with an explicit env var, for example:
  - `PW_E2E_VERBOSE_LOGS=1`
  - or existing project logging env if one exists

Acceptable behavior:

- suppress expected dev-auth fallback warnings during e2e when the dev/test auth path is active
- suppress successful API request completion logs during e2e by default
- suppress Budget debug logs unless debug env is enabled
- keep errors/warnings visible if they indicate real failed auth, failed API requests, unhandled exceptions, or non-2xx responses not expected by a test

3. Clean Budget debug logs

Remove or gate raw logs:

- `DEBUG BUDGET LOAD`
- `DEBUG RECIPIENTS`

They should not print in normal test runs or normal app usage unless an explicit debug env is enabled.

4. Clean auth fallback warnings

For e2e/dev-auth mode:

- avoid repeatedly logging expected Supabase `Auth session missing` warnings when the app intentionally falls back to a dev/test user.
- Keep logging for unexpected auth failures where no fallback user resolves.
- Do not weaken auth.
- Do not change authorization semantics.

5. Clean API request logging during e2e

If the request logger has an env or config, set e2e scripts/webServer env to quiet successful request logs.
If not, add a minimal env gate:

- successful 2xx/3xx requests quiet under e2e by default
- failed requests still log
- slow request logging can be disabled under e2e unless verbose logs are enabled

6. Address pg deprecation warning if safely localizable

Investigate the `client.query()` deprecation warning.
If there is an obvious local misuse that can be fixed safely, fix it.
If not safe in this pass:

- document it in the final response and hardening summary as a remaining warning cleanup item.
- Do not suppress all Node warnings globally unless clearly scoped to e2e and justified.

7. Update Playwright/package scripts

Update e2e scripts or Playwright webServer env so normal runs are clean:

- `npm --prefix web run test:e2e:p0`
- focused e2e scripts
- keep an escape hatch for verbose logs

Possible approach:

- set `PW_E2E=1`
- set `PW_E2E_VERBOSE_LOGS=0`
- set any app logger quiet env used by the project

8. Update docs

Update:

- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`
- optionally `docs/testing/PLANNER_DASH_TEST_HARNESS.md`

Document:

- normal clean test commands
- how to enable verbose logs when debugging
- what logs are intentionally suppressed
- what logs remain visible

9. Verify output cleanliness

Run:

- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:e2e:budget`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:

- e2e pass/fail output is readable.
- Successful app/API logs no longer flood normal e2e output.
- Expected dev-auth fallback warnings no longer flood normal e2e output.
- Budget debug logs no longer print in normal runs.
- Failures/errors are not hidden.
- Verbose diagnostics can still be enabled intentionally.
- Existing e2e/browser tests remain green.
- Existing journeys remain green.
- Full suite remains green.
- No schema/migration changes.
- Final response includes:
  - logging sources found
  - files changed
  - env flags/scripts changed
  - how to run clean tests
  - how to run verbose tests
  - commands run
  - final pass/fail status
  - remaining warning/log cleanup items, if any
```

---

# Browser Prompt 7 — Speakers Browser P0

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add the next P0 browser E2E journey for the Speakers UI workflow.

Current state:
- Non-browser journeys pass: `npm --prefix web run test:journeys` → 18/18.
- Browser P0 tests pass: `npm --prefix web run test:e2e:p0` → 6/6.
- Full suite passes: `npm --prefix web run test:summary` → 1519/1519.
- E2E output has been cleaned and should now be readable.
- Existing browser helpers live at `web/e2e/helpers/planner-e2e.ts`.
- Existing deterministic fixture harness exists at `web/lib/test-harness/planner-fixtures.ts`.
- Existing browser specs cover Matrix edit, access denied-write, quick drawer speaker assignment, Room Set / Seating, Docs Hub, and Budget.
- Do not touch unrelated files.

Goal of this pass:
Add a focused browser journey proving the actual Speakers UI can load event-scoped speaker data, perform one meaningful speaker action through the UI if stable, reload, and verify persisted state through DB/service reread.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not loosen, skip, or delete existing tests.
- Do not fake authorization.
- Use existing deterministic fixture helpers.
- Use existing Playwright/helper patterns.
- Every test must own setup and cleanup.
- Prefer semantic selectors and accessible roles.
- Add `data-testid` only where it materially improves reliability for this important workflow.
- Do not fake browser coverage by doing all mutations directly in the DB.
- Avoid broad speaker portal coverage in this pass.
- Do not overclaim coverage in docs.

Preferred new file:
`web/e2e/planner-speakers-browser-journey.spec.ts`

Implement this browser journey:

Planner opens event Speakers → sees seeded speaker → performs one stable speaker UI action → reload verifies UI state → DB/service reread verifies persisted state.

Test setup:
- Create isolated org/user/event data.
- Create editor-capable planner user.
- Create event.
- Create event-scoped Speaker fixture data.
- Create MatrixRow/session if the most stable speaker UI path involves session assignment visibility.
- Seed any readiness/onsite/message/note data only if the UI needs it.
- Cleanup all owned data after the test.

Browser flow:
1. Authenticate as the editor-capable planner user using the existing dev/test auth approach.
2. Navigate through the real UI:
   - Events
   - open the test event workspace
   - Speakers
3. Verify the seeded speaker appears in the Speakers UI.
4. Open the speaker detail/edit surface if applicable.
5. Perform the most stable meaningful Speaker action through the UI:
   - update speaker name/title/company/status if stable
   - or update readiness/onsite data if that is the stable path
   - or create an internal note/message if that is the stable path
   - choose the strongest stable path that reflects current product behavior
6. Verify the updated speaker state appears in the UI.
7. Reload the page.
8. Verify the updated state still appears in the UI after reload.
9. Reread Prisma/canonical speaker service data and verify:
   - speaker belongs to the correct event
   - the UI action persisted
   - any related note/message/readiness/onsite row exists where applicable
10. Cleanup all owned fixture data.

If speaker edit UI is not stable:
- Do not force brittle coverage.
- Cover the strongest stable browser path available, at minimum speaker list/detail visibility plus persisted DB reread.
- Document the exact remaining gap.
- Do not replace the browser action with a direct DB mutation and call it browser coverage.

Access sanity:
- Keep this pass editor-only unless read-only speaker denied-write is trivial and stable.
- Matrix EVENT_VIEWER denied-write browser coverage already exists; speaker-specific denied-write can be a later test.

Scripts:
- Add a focused script if useful:
  - `test:e2e:speakers`
- Update `test:e2e:p0` to include this spec only if it is reliable and focused.

Docs:
Update:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Document:
- Speakers browser journey added
- exact test file path
- speaker action path covered
- whether broader speaker portal/browser workflows remain missing
- layer: browser UI + DB/service reread
- remaining Speaker browser gaps
- remaining broader browser gaps

Verification:
Run:
- `npm --prefix web run test:e2e:speakers` if added
- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:
- Speakers browser journey test exists.
- It uses real UI navigation from Events/Event workspace/Speakers.
- It verifies event-scoped speaker data appears in the UI.
- It performs at least one meaningful speaker action through the UI if stable.
- It verifies persisted state after reload.
- It verifies persisted state through DB/service reread.
- Existing browser P0 tests remain green.
- Existing non-browser journeys remain green.
- Full suite remains green.
- E2E output stays readable.
- No schema/migration changes.
- Docs updated truthfully.
- Final response includes:
  - test file path
  - Speakers browser path covered
  - speaker action covered
  - helper changes
  - scripts changed
  - docs changed
  - commands run
  - final pass/fail status
  - remaining browser gaps
```

---

# Remaining Prompt 1 — Timeline Browser Journey

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add the next P0 browser E2E journey for the Timeline UI workflow.

Current state:
- Non-browser journeys pass: `npm --prefix web run test:journeys` → 18/18.
- Browser P0 tests pass: `npm --prefix web run test:e2e:p0` → 7/7.
- Full suite passes: `npm --prefix web run test:summary` → 1519/1519.
- E2E output has been cleaned and should remain readable.
- Existing browser helpers live at `web/e2e/helpers/planner-e2e.ts`.
- Existing deterministic fixture harness exists at `web/lib/test-harness/planner-fixtures.ts`.
- Existing browser specs cover Matrix edit, access denied-write, quick drawer speaker assignment, Room Set / Seating, Docs Hub, Budget, and Speakers.
- Do not touch unrelated files.

Goal of this pass:
Add a focused browser journey proving the actual Timeline UI can load event-scoped timeline data, perform one meaningful timeline action through the UI if stable, reload, and verify persisted state through DB/service reread.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not loosen, skip, or delete existing tests.
- Do not fake authorization.
- Use existing deterministic fixture helpers.
- Use existing Playwright/helper patterns.
- Every test must own setup and cleanup.
- Prefer semantic selectors and accessible roles.
- Add `data-testid` only where it materially improves reliability for this important workflow.
- Do not fake browser coverage by doing all mutations directly in the DB.
- Avoid broad Timeline coverage in this pass.
- Do not overclaim coverage in docs.
- Keep E2E output clean.

Preferred new file:
`web/e2e/planner-timeline-browser-journey.spec.ts`

Implement this browser journey:

Planner opens event Timeline → sees seeded timeline item → performs one stable timeline UI action → reload verifies UI state → DB/service reread verifies persisted state.

Test setup:
- Create isolated org/user/event data.
- Create editor-capable planner user.
- Create event.
- Create one or more event-scoped TimelineItem fixture records.
- Create one TimelineDependency fixture only if the UI reliably displays or edits dependencies.
- Cleanup all owned data after the test.

Browser flow:
1. Authenticate as the editor-capable planner user using the existing dev/test auth approach.
2. Navigate through the real UI:
   - Events
   - open the test event workspace
   - Timeline
3. Verify the seeded timeline item appears in the Timeline UI.
4. Perform the most stable meaningful Timeline action through the UI:
   - update timeline item status, preferably from `NOT_STARTED` to `IN_PROGRESS`, `AT_RISK`, or `COMPLETE`, if stable
   - or edit the title/date/owner if status controls are not stable
   - or create a dependency if dependency UI is stable
   - choose the strongest stable path that reflects current product behavior
5. Verify the updated timeline state appears in the UI.
6. Reload the page.
7. Verify the updated state still appears in the UI after reload.
8. Reread Prisma/canonical timeline service data and verify:
   - TimelineItem belongs to the correct event
   - the UI action persisted
   - TimelineDependency belongs to the correct event/items if dependency UI was covered
9. Cleanup all owned fixture data.

If status/dependency UI is not stable:
- Do not force brittle coverage.
- Cover the strongest stable browser path available, at minimum timeline list/detail visibility plus one persisted edit if possible.
- Document the exact remaining gap.
- Do not replace the browser action with a direct DB mutation and call it browser coverage.

Access sanity:
- Keep this pass editor-only unless read-only Timeline denied-write is trivial and stable.
- Matrix EVENT_VIEWER denied-write browser coverage already exists; Timeline-specific denied-write can be a later test.

Scripts:
- Add a focused script if useful:
  - `test:e2e:timeline`
- Update `test:e2e:p0` to include this spec only if it is reliable and focused.

Docs:
Update:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Document:
- Timeline browser journey added
- exact test file path
- timeline action path covered
- whether dependency browser coverage landed or remains missing
- layer: browser UI + DB/service reread
- remaining Timeline browser gaps
- remaining broader browser gaps

Verification:
Run:
- `npm --prefix web run test:e2e:timeline` if added
- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:
- Timeline browser journey test exists.
- It uses real UI navigation from Events/Event workspace/Timeline.
- It verifies event-scoped timeline data appears in the UI.
- It performs at least one meaningful timeline action through the UI if stable.
- It verifies persisted state after reload.
- It verifies persisted state through DB/service reread.
- Existing browser P0 tests remain green.
- Existing non-browser journeys remain green.
- Full suite remains green.
- E2E output stays readable.
- No schema/migration changes.
- Docs updated truthfully.
- Final response includes:
  - test file path
  - Timeline browser path covered
  - timeline action covered
  - whether dependency browser coverage landed or remains missing
  - helper changes
  - scripts changed
  - docs changed
  - commands run
  - final pass/fail status
  - remaining browser gaps
```

---

# Remaining Prompt 2 — Quick Drawer Remaining Panels

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add browser E2E coverage for the remaining Matrix quick drawer assignment panels: AV, F&B, and Staffing.

Current state:
- Non-browser journeys pass.
- Browser P0 tests pass.
- Quick drawer Speaker browser assignment already exists.
- This pass should extend the same quick drawer pattern to AV, F&B, and Staffing where stable.
- Do not touch unrelated files.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not loosen, skip, or delete existing tests.
- Do not fake authorization.
- Use existing deterministic fixture helpers.
- Use existing Playwright/helper patterns.
- Every test must own setup and cleanup.
- Prefer semantic selectors and accessible roles.
- Add data-testid only where it materially improves reliability.
- Do not fake browser coverage by mutating DB directly and calling it UI coverage.
- Keep each path focused.
- Keep E2E output readable.

Preferred file:
`web/e2e/planner-quick-drawer-resources-browser-journey.spec.ts`

Implement browser journeys for:

1. AV assignment path
   - Events → event workspace → Run of Show
   - open seeded session quick drawer
   - open AV panel
   - assign/remove AV requirement or selection through UI if stable
   - reload
   - DB/service reread

2. F&B assignment path
   - Events → event workspace → Run of Show
   - open seeded session quick drawer
   - open F&B panel
   - assign/remove F&B requirement or catalog item through UI if stable
   - reload
   - DB/service reread

3. Staffing assignment path
   - Events → event workspace → Run of Show
   - open seeded session quick drawer
   - open Staffing panel
   - assign/remove EventPerson/staff through UI if stable
   - reload
   - DB/service reread

If one panel is unstable:
- Do not force brittle coverage.
- Implement stable panels.
- Document exact skipped panel and blocker.
- Do not overclaim.

Scripts:
- Add `test:e2e:quick-drawer-resources` if useful.
- Add to `test:e2e:p0` only if reliable and focused.

Docs:
Update:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Verification:
Run:
- focused quick drawer resource script
- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:
- AV/F&B/Staffing browser paths are covered where stable.
- Tests use real UI navigation and drawer panels.
- Tests verify reload persistence.
- Tests verify DB/service state.
- Existing suites remain green.
- Docs updated truthfully.
- No schema/migration changes.
```

---

# Remaining Prompt 3 — Docs + Budget Review Expansion

```text
You are working in the Planner OS / Planner Dash repository.

Goal: expand browser coverage for Docs and Budget review lifecycle actions.

Current state:
- Docs browser submit-for-review exists.
- Budget browser submit-for-approval exists.
- Service/data lifecycle coverage already covers deeper review actions.
- This pass should add stable browser coverage for approve/reject/reopen/pull-back/revise paths where possible.
- Do not touch unrelated files.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not loosen, skip, or delete existing tests.
- Do not fake authorization.
- Use existing deterministic fixtures and Playwright helpers.
- Every test must own setup and cleanup.
- Do not perform real external R2 upload.
- Do not fake browser coverage with DB-only mutations.
- Keep E2E output readable.

Preferred files:
- `web/e2e/planner-docs-review-browser-journey.spec.ts`
- `web/e2e/planner-budget-review-browser-journey.spec.ts`

Docs browser expansion:
- open event Docs Hub
- seeded document/version in review-ready state
- approve/reject/reopen/pull-back through UI where stable
- reload
- DB/service reread for state/activity

Budget browser expansion:
- open event Budget
- seeded budget/submission in review-ready state
- approve/reject/revise through UI where stable
- reload
- DB/service reread for BudgetActivity/BudgetApproval

If an action is unstable:
- skip that specific browser action
- document the blocker
- do not overclaim

Scripts:
- Add focused scripts if useful:
  - `test:e2e:docs-review`
  - `test:e2e:budget-review`
- Add to `test:e2e:p0` only if reliable and P0-worthy.

Docs:
Update:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Verification:
Run:
- focused new scripts
- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:
- At least one meaningful Docs review expansion path lands if stable.
- At least one meaningful Budget review expansion path lands if stable.
- Tests verify reload persistence and DB/service state.
- Existing suites remain green.
- Docs updated truthfully.
- No schema/migration changes.
```

---

# Remaining Prompt 4 — Speaker Portal Browser Journey

```text
You are working in the Planner OS / Planner Dash repository.

Goal: add browser E2E coverage for the speaker portal/token workflow.

Current state:
- Speaker portal/token behavior is covered at service/data level.
- Speakers planner UI browser journey exists.
- Actual portal browser workflow remains missing.
- Do not touch unrelated files.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not loosen, skip, or delete existing tests.
- Do not fake token auth.
- Do not require planner session auth for the token-scoped portal path unless current product behavior requires it.
- Use existing deterministic fixture helpers.
- Every test must own setup and cleanup.
- Keep E2E output readable.

Preferred file:
`web/e2e/speaker-portal-browser-journey.spec.ts`

Implement:

1. Valid token path
   - create isolated event/speaker/token fixture data
   - open speaker portal route directly using token
   - verify intended speaker/event data appears
   - verify no unrelated event/speaker data appears

2. Portal action if stable
   - update profile/intake/submission field if current portal UI supports it
   - submit if stable
   - reload
   - DB/service reread

3. Invalid/revoked/expired token behavior
   - test invalid token rejection if stable
   - test revoked token rejection if fixture/service supports it
   - test expired token rejection if fixture/service supports it

If one token state is not supported cleanly:
- document blocker
- do not fake behavior

Scripts:
- Add `test:e2e:speaker-portal` if useful.
- Add to `test:e2e:p0` only if reliable and P0-worthy.

Docs:
Update:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Verification:
Run:
- focused speaker portal script
- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:
- Speaker portal browser journey exists if route/UI is stable.
- Valid token loads intended data.
- Invalid/revoked/expired token rejection covered where stable.
- Portal action persists if action is covered.
- Existing suites remain green.
- Docs updated truthfully.
- No schema/migration changes.
```

---

# Remaining Prompt 5 — Room Set / Seating Advanced Browser Paths

```text
You are working in the Planner OS / Planner Dash repository.

Goal: expand Room Set / Seating browser coverage beyond exact-chair assignment.

Current state:
- Room Set / Seating browser P0 exact-chair assignment exists.
- It verifies Chair 1 / `seatIndex: 0`.
- Advanced seating browser paths remain missing.
- Do not touch unrelated files.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not loosen, skip, or delete existing tests.
- Avoid brittle canvas/pixel assertions.
- Do not force drag/drop unless stable.
- Use deterministic fixtures and existing Playwright helpers.
- Every test must own setup and cleanup.
- Keep E2E output readable.

Preferred file:
`web/e2e/planner-room-set-seating-advanced-browser-journey.spec.ts`

Implement stable advanced paths:

1. Unassign
   - start with an assigned attendee
   - unassign through UI
   - reload
   - DB/service reread confirms removed

2. Multi-table
   - create two tables
   - assign attendee to Table A
   - move or assign another attendee to Table B if stable
   - reload
   - DB/service reread confirms table scope

3. Auto-assign
   - use auto-assign only if UI is stable and deterministic
   - reload
   - DB/service reread confirms assignments

4. Drag/drop
   - only if stable and not brittle
   - otherwise document as remaining gap

Scripts:
- Add `test:e2e:room-set-advanced` if useful.
- Add to `test:e2e:p0` only if reliable and P0-worthy.

Docs:
Update:
- `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
- `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`

Verification:
Run:
- focused room-set advanced script
- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:
- At least one advanced seating path lands if stable.
- Tests verify reload persistence and DB/service state.
- Existing suites remain green.
- Docs updated truthfully.
- No schema/migration changes.
```

---

# Remaining Prompt 6 — Final Browser / Access Hardening Pass

```text
You are working in the Planner OS / Planner Dash repository.

Goal: perform the final browser/access hardening assessment and update the test coverage docs.

Current state:
- Non-browser journey coverage exists.
- Browser P0 coverage exists across the primary modules implemented so far.
- Remaining gaps include broader role matrix browser checks, live HTTP route execution, mocked R2 upload feasibility, and real-auth coverage.
- Do not touch unrelated files.

Important constraints:
- Do not change Prisma schema files.
- Do not add migrations.
- Do not fake authorization.
- Do not fake browser or HTTP coverage.
- Do not overclaim coverage.
- Keep E2E output readable.

Tasks:

1. Broader role matrix browser assessment
   - inspect whether OWNER / ADMIN / MEMBER / VIEWER / EVENT_VIEWER can be tested reliably in browser across key modules
   - add one or more focused denied-write browser tests only where stable
   - DB/service reread must prove denied writes do not persist

2. Live HTTP route execution assessment
   - identify which guarded routes can be tested honestly with real auth/session cookies or existing dev-auth patterns
   - add route execution tests only where reliable
   - document blockers where fake auth would be required

3. Mocked R2 upload feasibility
   - inspect current Docs upload/presign/finalize test patterns
   - determine whether mocked/local R2 browser or route coverage can be added honestly
   - add focused coverage only if safe
   - otherwise document blocker

4. Real Supabase/OTP auth assessment
   - inspect whether real Supabase/OTP auth can be tested locally/CI without secrets or manual steps
   - do not implement unless reliable and low-risk
   - document if this needs a separate auth-specific pass

5. Final docs update
   - update `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md`
   - update `docs/testing/PLANNER_DASH_TEST_HARDENING_SUMMARY.md`
   - clearly distinguish:
     - service/data journeys
     - API/source-contract tests
     - browser UI E2E
     - remaining blockers

Verification:
Run:
- all focused tests added
- `npm --prefix web run test:e2e:p0`
- `npm --prefix web run test:journeys`
- `npm --prefix web run typecheck`
- `npm --prefix web run test:summary`
- `git diff --check`

Acceptance criteria:
- Final browser/access coverage state is documented truthfully.
- Any stable final hardening tests are added.
- Blockers are explicit.
- Existing suites remain green.
- No schema/migration changes.
- Final response includes:
  - tests added
  - coverage now complete
  - remaining blockers
  - commands run
  - final pass/fail status
  - recommended next future testing work, if any
```
