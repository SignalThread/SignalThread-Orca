# Planner Dash Regression Policy

Last updated: 2026-06-30

Planner Dash regressions should become enforceable tests, not tribal memory. Expensive, confusing, or customer-facing bugs require regression coverage before merge unless the PR explicitly documents why coverage is impossible in the current layer and links the follow-up.

## Required Coverage By Bug Type

- Permission or tenant-isolation bugs require access tests. Denied writes must assert the final persisted DB or service state did not change.
- Workflow bugs require journey coverage across the affected steps, not only isolated unit tests.
- State machine bugs require service/API coverage plus persisted rereads after each important transition.
- Destructive actions must verify the final DB or service state, including absence of deleted records and absence of unintended related mutations.
- UI-hidden buttons are not enforcement. Server-side authorization is required for every protected read or write path.
- Tests must own setup and cleanup. Do not rely on shared mutable fixtures, seeded local state, or test ordering.
- Skipped tests may not be used to hide product bugs. A skipped test needs a real environment blocker or a tracked follow-up.
- Schema changes require a schema proposal and migration review before tests depend on them.
- Every PR touching a high-risk module must update `docs/testing/PLANNER_DASH_TEST_COVERAGE_MATRIX.md` or explicitly state that the matrix does not change.

## High-Risk Modules

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

## Minimum Local Verification

Use the focused command for the touched area plus the full local verification before merge:

```bash
npm --prefix web run typecheck
npm --prefix web run test:summary
```

For harness and journey changes, also run:

```bash
npm --prefix web run test:harness
npm --prefix web run test:journeys
```
