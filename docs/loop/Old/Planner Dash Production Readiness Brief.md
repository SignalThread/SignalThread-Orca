# Planner Dash Remaining Production Readiness — One-Loop Brief

## Purpose

We are consolidating the remaining Planner Dash production-readiness work into **one controlled auto-approve loop** instead of running 9–11 separate prompts.

This is not feature work. It is a final hardening pass focused on production-risk reduction, workflow correctness, performance, and launch readiness.

The loop should move continuously, but it should still create **one focused commit per completed workstream** so the history stays clean and rollback remains easy.

---

## Current State

Branch:

```bash
chore/production-readiness-audit
```

Latest reported completed work:

```text
aaaec060 Add regression coverage for legacy Matrix row PATCH partial updates
```

Already completed in this production-readiness run:

1. Wave 2 route/auth hardening
2. Next 16 production build unblock
3. Budget approve/reject production 404 fix
4. Production-dead-path sweep
5. Platform Admin revoke UUID regex fix
6. Matrix staffing DB drift investigation
7. Copilot Matrix session edit clobber fix
8. Matrix session PATCH partial-merge hardening
9. Legacy Matrix Rows PATCH clobber audit/regression coverage

Matrix clobber work is now effectively done.

Matrix staffing rewrite/schema reconciliation is intentionally **parked** because staffing will be rewritten later. Do not include it in this loop.

---

## What This One Loop Covers

The loop has two phases.

## Phase A — Remaining P1 Product/Workflow Hardening

These are the remaining higher-risk production items.

### 1. Timeline Dependency Cycle Detection

Goal: prevent invalid timeline dependency cycles.

Focus areas:

- self-dependencies
- two-node cycles
- multi-node cycles
- cross-event dependency attempts
- dependency delete/update behavior
- root/dependency traversal drift

Expected outcome:

- Add cycle detection if missing.
- Add focused regression tests.
- Commit separately.

Hard stop if this requires schema/state-machine changes.

---

### 2. Budget Correctness Loop

Goal: fix narrow no-schema Budget correctness risks.

Focus areas:

- CSV formula injection
- GET routes creating or mutating Budget rows
- approval/rejection state consistency
- event scoping
- activity/audit behavior
- approved amount snapshot risk

Expected outcome:

- Fix no-schema bugs that are clearly safe.
- Add focused regression tests.
- Commit separately.

Hard stop if approved amount snapshotting requires schema changes. In that case, produce a schema proposal note instead of implementing that part.

---

### 3. Command Center Performance

Goal: address obvious no-schema performance hot spots.

Focus areas:

- serial awaits that can be parallelized
- repeated count queries
- repeated speaker/session/event fan-out
- broad selects
- dashboard/command-center load paths

Expected outcome:

- Make narrow performance improvements.
- Preserve response/UI shape.
- Add/update tests if behavior is covered.
- Commit separately.

No dashboard redesign in this loop.

---

### 4. Import Row Caps

Goal: prevent large imports from causing timeouts or runaway processing.

Focus areas:

- attendee imports
- directory imports
- marketing imports
- speaker imports
- F&B/source menu imports if applicable

Expected outcome:

- Add conservative caps or batching guards only where product behavior is obvious.
- Return stable, clear errors.
- Add focused tests.
- Commit separately.

Hard stop if cap values are ambiguous or product-sensitive.

---

## Phase B — Launch Readiness / Cleanup

These are not deep product feature fixes. They are cleanup and operational-readiness items that should happen before calling the branch launch-ready.

### 5. Dead-Code Confirmation / Removal

Goal: remove only confirmed-dead code.

Rules:

- Do not delete compatibility paths blindly.
- Confirm no UI/server/cron/external callers.
- Stop if a route/component might still be used.
- Commit only obvious safe removals.

Expected outcome:

- Confirmed-dead code removed, or a dead-code inventory if removal is ambiguous.

---

### 6. Upload / Public Token / Rate Limit / Security Headers Pass

Goal: tighten obvious security and abuse-prevention gaps.

Focus areas:

- upload size/type checks
- object key safety
- public token validation/expiry/revocation behavior
- obvious missing rate limits
- CSP/HSTS/frame/referrer/permissions headers if compatible

Rules:

- Do not break speaker portal/public token semantics.
- Do not wrap public routes in planner auth.
- Stop if token policy requires a product decision.

Expected outcome:

- Implement narrow safe hardening.
- Defer policy decisions clearly.

---

### 7. One-Command Test Runner / CI Checks

Goal: make verification repeatable.

Focus areas:

- one command that runs the project’s realistic test stack
- typecheck/build/test/lint grouping
- CI check documentation or scripts
- avoiding commands that require missing local services unless clearly labeled

Expected outcome:

- One clear local verification command or script.
- CI readiness notes.

---

### 8. Release Checklist + Smoke Test Checklist

Goal: document the launch process.

Include:

- pre-deploy checks
- deploy steps
- post-deploy smoke tests
- rollback process
- critical module smoke tests for Events, Matrix, Budget, Timeline, Docs, Speakers, F&B, Seating

Expected outcome:

- Markdown checklist committed under docs.

---

### 9. Incident Runbooks / Rollback Plan

Goal: define what to do when production breaks.

Include runbooks for:

- bad deploy
- failed build
- database/migration issue
- auth/access issue
- upload/storage issue
- data incident
- leaked secret

Expected outcome:

- Markdown runbook committed under docs.

---

### 10. Security / Customer Packet

Goal: prepare basic customer/security review material.

Include:

- architecture summary
- tenancy/access summary
- data handling summary
- storage summary
- known exclusions / still-open hardening items
- route/auth hardening summary
- testing summary

Expected outcome:

- Markdown security/customer packet committed under docs.

---

### 11. Optional Docs Hub Approval Decision

This is optional and should not block the loop unless the agent finds it actively impacts production readiness.

Known issue:

- Docs approval backend works.
- Production UI hides “Simulate Approve/Reject.”
- This needs a product decision: planner-driven approve/reject vs reviewer-facing approval surface.

Expected outcome:

- Do not implement unless behavior is already decided.
- Leave as a clearly documented product decision if still ambiguous.

---

## Execution Strategy

Run this as one auto-approve loop, but not as one giant commit.

Required commit model:

```text
One workstream = one commit
```

Expected commit sequence:

1. `Prevent Timeline dependency cycles`
2. `Harden Budget correctness safeguards`
3. `Improve Command Center loading performance`
4. `Add import row safety caps`
5. `Remove confirmed dead production code` or `Document dead code cleanup findings`
6. `Harden upload and public surface safeguards`
7. `Add production verification runner`
8. `Add production release checklist`
9. `Add incident runbooks`
10. `Add customer security packet`

The exact commit list may shrink if some items are audit-only or hit hard stops.

---

## Hard Stops

The loop must stop and report if any of these happen:

- schema or migration changes are required
- generated Prisma would need to change
- packages need to be added
- auth/security semantics would change in a non-obvious way
- public/token route behavior is ambiguous
- product behavior is ambiguous
- unrelated modules need to be touched
- staffing schema/function rewrite becomes necessary
- tests fail for reasons not clearly caused by the current workstream
- dirty unrelated files exist
- a workstream becomes too broad for a safe focused change

---

## Global Rules

- Do not run `prisma migrate`.
- Do not change schema.
- Do not change generated Prisma.
- Do not add packages.
- Do not push.
- Do not work on Matrix staffing rewrite/schema reconciliation.
- Do not delete legacy Matrix routes unless confirmed safe.
- Preserve existing route/auth behavior.
- Preserve existing UI behavior unless fixing a confirmed bug.
- Keep changes narrow and production-risk focused.
- Add focused regression coverage for every code fix.
- Run verification before every commit.

---

## Required Verification Per Changed Workstream

For each workstream that changes code:

```bash
targeted tests for changed area
changed-file ESLint
npm run typecheck
npx next build --webpack
git diff --check
git status --short
```

Commit only after verification passes and the diff is scoped to the current workstream.

---

## Expected Output From The Loop

Final report should include:

1. Starting commit
2. Workstreams completed
3. Workstreams skipped/deferred and why
4. Files changed by workstream
5. Tests/verification run by workstream
6. Commit hash for each completed workstream
7. Any hard stops hit
8. Remaining production-readiness risks
9. Recommended next loop, if any

---

## What Success Looks Like

At the end of this loop, Planner Dash should have:

- Big 3 core production hardening substantially complete
- no known Matrix save clobber bug
- no known Timeline dependency-cycle hole
- Budget correctness safeguards addressed where possible without schema changes
- obvious Command Center performance wins applied
- import caps or documented product-limit decisions
- obvious dead code removed or documented
- basic upload/public/security hardening improved or clearly deferred
- repeatable verification commands
- release checklist
- incident runbooks
- customer/security packet

Staffing rewrite remains a separate future initiative.
