# Planner Dash — Corrected Full Remaining Production-Readiness Prompt Pack

This file replaces the incomplete prompt document that only had three prompts.

Use this pack for the remaining Planner Dash production-readiness work on branch:

```bash
chore/production-readiness-audit
```

Current checkpoint from the chat:
- Route/auth hardening: done
- Next 16 build unblock: done
- Budget approve/reject production path: done
- Production-dead-path sweep: done
- Platform Admin revoke UUID regex: done
- Copilot Matrix session edit payload clobbering: done
- Matrix session PATCH partial-merge hardening: done
- Legacy Matrix Rows PATCH clobber audit: done, safe, regression committed
- Matrix staffing schema/function rewrite: intentionally parked

Remaining main work:
1. Timeline dependency cycle detection
2. Budget correctness loop
3. Command Center performance
4. Import row caps
5. Dead-code confirmation/removal
6. Upload/public-token/rate-limit/security headers
7. One-command test runner / CI readiness
8. Release checklist + smoke test checklist
9. Incident runbooks / rollback plan
10. Security/customer packet
11. Optional Docs Hub approval decision
12. Future Matrix staffing rewrite/schema reconciliation

---

## Claude Code Auto-Approve Launch Command

Use one of these from the repo root.

Preferred:

```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os"
claude --model opus --permission-mode bypassPermissions
```

Fallback if your Claude Code version does not support `--permission-mode`:

```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os"
claude --model opus --dangerously-skip-permissions
```

Inside an existing session, use:

```text
/permissions
```

Then choose bypass/auto-approve mode if available.

---

# Prompt 1 — P1 Production-Readiness Continuous Loop

Use this if you want Opus to work through the four remaining P1 workstreams in one continuous run with separate commits.

```text
Opus Auto-Approve: Planner Dash P1 Production-Readiness Loop

We are continuing Planner Dash production-readiness work.

Execution mode:
- Auto-approve mode is on.
- Work through the P1 loop continuously.
- Do not ask for approval between workstreams.
- Make one focused commit per completed workstream.
- Do not push.
- Stop only if a hard stop is hit.

Current status:
- Branch: chore/production-readiness-audit
- Route/auth hardening is committed.
- Production build unblock is committed.
- Budget approval production path is fixed/handled.
- Production-dead-path sweep is complete.
- Platform Admin revoke UUID regex bug is fixed/handled.
- Copilot Matrix session edit payload clobbering is fixed.
- Matrix session PATCH partial-merge hardening is complete.
- Legacy Matrix Rows PATCH clobber audit is complete and regression coverage was added.
- Matrix staffing schema/function rewrite is deferred.
- Do not work on staffing schema reconciliation in this loop.

Before starting:
1. Run:
   git status --short
   git log --oneline -8

2. If unrelated dirty files exist, stop and report.

3. If the tree is clean, continue.

P1 loop order:
1. Timeline dependency cycle detection
2. Budget correctness loop
3. Command Center performance
4. Import row caps

Hard stops:
Stop and report if:
- a fix requires schema or migration changes
- generated Prisma would need to change
- packages need to be added
- product behavior is ambiguous
- auth/security semantics would change
- public/token route behavior would change
- staffing schema/function work is required
- unrelated files are dirty
- tests fail for reasons not clearly caused by the current workstream
- a workstream becomes broad enough that it should be split

Global hard rules:
- Do not run prisma migrate.
- Do not change schema.
- Do not change generated Prisma.
- Do not add packages.
- Do not push.
- Do not touch staffing schema reconciliation.
- Do not delete legacy Matrix routes.
- Preserve existing route/auth behavior.
- Preserve existing UI behavior unless fixing a confirmed bug.
- Keep changes narrow and production-risk focused.
- Each workstream must have focused tests where code changes are made.
- Run verification before each commit.

Workstream 1 — Timeline dependency cycle detection

Goal:
Prevent invalid dependency cycles in Timeline.

Inspect:
- Timeline dependency API routes under web/app/api/events/[eventId]/timeline*
- Timeline service code under web/lib/timeline* or related service files
- Timeline UI callers under web/app/(shell)/*
- Existing timeline tests/journeys

Questions:
- Can A→B→C→A cycles be created?
- Are self-dependencies blocked?
- Are two-node cycles blocked?
- Are multi-node cycles blocked?
- Are cross-event dependencies blocked?
- Are delete/update flows safe?
- Is root detection or dependency traversal drifting from the dependency model?

If safe:
- Add service-level cycle detection before dependency create/update.
- Preserve existing API response shapes where possible.
- Add tests for:
  - self-cycle
  - two-node cycle
  - multi-node cycle
  - cross-event dependency denial
  - valid dependency creation
  - deleting a dependency still works
- Verify.
- Commit:
  git commit -m "Prevent Timeline dependency cycles"

Workstream 2 — Budget correctness loop

Goal:
Fix narrow confirmed Budget correctness risks without schema changes.

Inspect:
- Budget services under web/src/server/services/budget.ts
- Budget routes under web/app/api/events/[eventId]/budget/**
- Budget UI callers under web/app/(shell)/**
- Budget import/export code
- Existing budget tests

Check specifically:
- approved amount snapshot risk
- CSV formula injection risk
- GET routes creating Budget rows or mutating state
- approval/rejection state consistency
- event scoping and audit activity behavior
- submission-based approval path still canonical
- legacy budget routes remain non-live unless confirmed otherwise

Hard stop:
If approved amount snapshot requires new columns/tables/schema, do not implement that part. Write a schema proposal note in the final report and continue only with no-schema safe fixes.

If safe:
- Fix CSV formula injection if present.
- Stop unsafe GET-side mutations if a no-schema safe path exists.
- Add focused regression tests.
- Verify.
- Commit:
  git commit -m "Harden Budget correctness safeguards"

Workstream 3 — Command Center performance

Goal:
Fix obvious no-schema performance hot spots.

Inspect:
- Dashboard / Command Center routes/components/services
- repeated serial awaits
- repeated speaker/session/count queries
- large broad selects
- command-center route/layout/widget code if present
- dashboard page APIs if relevant

Rules:
- No broad dashboard rewrite.
- No UI redesign.
- No schema/index changes.
- Prefer parallelizing independent reads and collapsing repeated queries.
- Preserve response shape and UI behavior.

If safe:
- Apply narrow performance improvements.
- Preserve response/UI shape.
- Add/update tests if behavior is covered.
- Verify.
- Commit:
  git commit -m "Improve Command Center loading performance"

Workstream 4 — Import row caps

Goal:
Prevent large imports from unbounded processing/timeouts.

Inspect import paths for:
- attendee imports
- directory imports
- marketing imports
- speaker imports
- F&B/source menu imports if applicable
- CSV/XLSX parsing code
- upload/finalize routes that trigger imports

Rules:
- Do not change file storage behavior.
- Do not change schema.
- Do not add workers/queues.
- Add clear caps and stable errors only where product behavior is obvious.
- If cap values are ambiguous, stop and report recommended limits instead of guessing.

If safe:
- Add conservative row caps or batching guards.
- Use named constants near the import code.
- Return stable 400/413 style errors where appropriate.
- Add focused tests.
- Verify.
- Commit:
  git commit -m "Add import row safety caps"

Verification required for each changed workstream:
- targeted tests for changed area
- changed-file ESLint
- npm run typecheck
- npx next build --webpack
- git diff --check
- git status --short before commit
- commit only if clean and scoped

Final output required:
1. Starting commit
2. Workstreams completed
3. Workstreams skipped/deferred and why
4. Files changed by workstream
5. Tests/verification run by workstream
6. Commit hash for each completed workstream
7. Any hard stops hit
8. Remaining production-readiness risks
9. Recommended next loop
```

---

# Prompt 2 — Timeline Dependency Cycle Detection

Use this standalone if the P1 loop stops or if you want Timeline isolated.

```text
Opus Auto-Approve: Timeline Dependency Cycle Detection

We are continuing Planner Dash production-readiness work.

Current status:
- Route/auth hardening is committed.
- Production build unblock is committed.
- Budget approval production path is fixed/handled.
- Matrix clobber work is complete.
- Matrix staffing rewrite is deferred.
- Do not touch staffing in this pass.

Task:
Audit and harden Timeline dependency creation/update so dependency cycles cannot be created.

Goal:
Timeline dependency graph must reject invalid cycles while allowing valid dependency chains.

Scope:
Inspect:
- web/app/api/events/[eventId]/timeline*/** routes
- web/lib/timeline/**
- timeline service/helper files
- timeline UI callers
- existing timeline tests/journeys

Hard rules:
- Do not change schema.
- Do not create migrations.
- Do not run prisma migrate.
- Do not change generated Prisma.
- Do not add packages.
- Do not touch Matrix, Budget, Docs, Platform Admin, or public/token routes unless directly required for timeline tests.
- Preserve existing API response shapes where possible.
- Preserve existing valid dependency behavior.
- Stop if the fix requires schema changes or a state-machine redesign.

Investigation questions:
1. Where are Timeline dependencies created?
2. Where are Timeline dependencies updated or deleted?
3. Are self-dependencies blocked?
4. Are two-node cycles blocked?
5. Are multi-node cycles blocked?
6. Are cross-event dependencies blocked?
7. Is dependency traversal event-scoped?
8. Are root/dependent calculations consistent after create/delete?
9. What tests currently cover dependency integrity?

Implementation requirements:
- Add canonical service-level validation before dependency creation/update.
- Reject:
  - self-dependency
  - dependency where predecessor/successor are from a different event
  - A→B where B already depends on A through any path
- Use efficient enough traversal for current app scale.
- Keep queries event-scoped.
- Return stable business errors.
- Do not rely on UI-only checks.

Tests required:
- valid dependency creation succeeds
- self-dependency rejected
- two-node cycle rejected
- multi-node cycle rejected
- cross-event dependency rejected
- delete dependency still works
- unrelated valid dependencies still work

Verification:
- targeted timeline tests
- changed-file ESLint
- npm run typecheck
- npx next build --webpack
- git diff --check

Commit:
If all verification passes, commit:
git commit -m "Prevent Timeline dependency cycles"

Final output:
1. Findings summary
2. Files inspected
3. Files changed
4. Cycle detection semantics
5. Error behavior
6. Tests added/updated
7. Verification commands/results
8. Commit hash
9. Remaining Timeline risks
10. Recommended next workstream
```

---

# Prompt 3 — Budget Correctness Loop

```text
Opus Auto-Approve: Budget Correctness Safeguards

We are continuing Planner Dash production-readiness work.

Current status:
- Budget submission approve/reject production path is fixed.
- Submission-based Budget approval path is canonical.
- Legacy budget-level submit/approve/reject/revise routes have no live callers unless newly discovered.
- Do not redo the budget production 404 fix.
- Do not touch Matrix staffing.

Task:
Audit and fix narrow no-schema Budget correctness risks.

Primary concerns:
1. approved amount snapshot risk
2. CSV formula injection risk
3. GET routes creating Budget rows or mutating state
4. approval/rejection state consistency
5. event scoping and audit activity behavior

Scope:
Inspect:
- web/src/server/services/budget.ts
- web/app/api/events/[eventId]/budget/**
- web/app/(shell)/budgets/**
- web/app/(shell)/events/[eventId]/budget/**
- Budget import/export helpers
- Budget tests and journey tests

Hard rules:
- Do not change schema.
- Do not create migrations.
- Do not run prisma migrate.
- Do not change generated Prisma.
- Do not add packages.
- Do not rework accounting behavior broadly.
- Do not revive legacy budget routes.
- Do not change approval semantics without clear source-backed behavior.
- Stop and report if approved amount snapshot requires schema.

Investigation questions:
1. Does approval store a stable approved amount or does it read live mutable line items?
2. Does any Budget CSV export allow formula injection values beginning with =, +, -, @, tab, or CR?
3. Do any GET routes call ensure/create helpers that mutate DB state?
4. Do approval/rejection/pullback/submit actions all create BudgetActivity rows?
5. Are all budget operations event-scoped?
6. Are legacy budget-level routes still unreachable from UI?
7. Is reject reason behavior consistent between canonical and legacy paths?

Implementation requirements:
- Fix CSV formula injection if present.
- Fix GET-side mutation only if a no-schema safe path exists.
- Preserve submission-based approval path.
- Preserve response shapes where possible.
- If approved amount snapshot needs schema, do not implement; write proposal note.

Tests required:
- CSV export escapes formula-like values
- GET route does not create/mutate budget where safe to assert
- approval activity still recorded
- wrong-event submission cannot be decided
- canonical submission route still works

Verification:
- targeted budget tests
- changed-file ESLint
- npm run typecheck
- npx next build --webpack
- git diff --check

Commit:
If all verification passes:
git commit -m "Harden Budget correctness safeguards"

Final output:
1. Findings summary
2. Files inspected
3. Files changed
4. Which risks were fixed
5. Which risks were deferred and why
6. Schema proposal needed, if any
7. Tests added/updated
8. Verification commands/results
9. Commit hash
10. Remaining Budget risks
11. Recommended next workstream
```

---

# Prompt 4 — Command Center Performance

```text
Opus Auto-Approve: Command Center Performance Pass

We are continuing Planner Dash production-readiness work.

Task:
Fix obvious no-schema Command Center / dashboard performance hot spots.

Goal:
Reduce avoidable latency and query fan-out without changing UI behavior or schema.

Scope:
Inspect:
- web/app/(shell)/dashboard/**
- web/app/(shell)/command-center/** if present
- web/app/api/** command-center/dashboard routes
- dashboard service/helper code
- repeated queries/counts for speakers, sessions, documents, budget, timeline, imports, or events

Hard rules:
- Do not change schema.
- Do not add indexes.
- Do not add packages.
- Do not redesign UI.
- Do not change response shape unless tests and callers are updated.
- Do not touch unrelated modules except where dashboard data loaders live.
- Stop if performance requires schema/index/queue/cache infrastructure.

Investigation questions:
1. Are independent awaits serialized unnecessarily?
2. Are counts fetched repeatedly in loops?
3. Are broad selects fetching full records when only counts/ids are needed?
4. Are per-event/per-speaker queries causing N+1 behavior?
5. Are there duplicate helper calls for the same data in one request?
6. Are errors still handled correctly if loading is parallelized?

Implementation requirements:
- Parallelize independent reads with Promise.all where safe.
- Collapse duplicate queries.
- Use narrow selects/counts where safe.
- Preserve UI and API output shape.
- Preserve auth/access checks.
- Avoid caching unless there is an existing safe pattern.

Tests:
- Add/update focused tests if route/service behavior is covered.
- If no direct tests exist, at minimum preserve existing tests and add source-level regression only if consistent with repo patterns.

Verification:
- targeted tests if available
- changed-file ESLint
- npm run typecheck
- npx next build --webpack
- git diff --check

Commit:
git commit -m "Improve Command Center loading performance"

Final output:
1. Findings summary
2. Files inspected
3. Files changed
4. Performance issues fixed
5. Query/await behavior before vs after
6. Tests added/updated
7. Verification commands/results
8. Commit hash
9. Remaining performance risks
10. Recommended next workstream
```

---

# Prompt 5 — Import Row Safety Caps

```text
Opus Auto-Approve: Import Row Safety Caps

We are continuing Planner Dash production-readiness work.

Task:
Audit import paths and add safe row caps/batching guards where product behavior is obvious.

Goal:
Prevent unbounded imports from causing timeouts, memory pressure, or partial unpredictable processing.

Scope:
Inspect import paths for:
- attendee imports
- event directory/person imports
- marketing imports
- speaker imports
- matrix imports
- budget imports
- F&B/source menu imports if applicable
- CSV/XLSX parsers
- upload finalize routes that trigger parsing/import

Hard rules:
- Do not change schema.
- Do not add packages.
- Do not add workers/queues.
- Do not change storage behavior.
- Do not redesign import UX.
- Do not invent arbitrary product limits if there is no clear existing pattern.
- Stop and report if cap values are product decisions.

Investigation questions:
1. Which import paths exist?
2. Which imports process rows without a cap?
3. Which imports already cap rows?
4. Which imports batch writes safely?
5. Which imports can timeout or allocate too much memory?
6. Which imports are public/token exposed?
7. What error shape should oversized imports return?

Implementation requirements:
- Add named constants for caps near the relevant import code.
- Prefer conservative limits based on existing app patterns.
- Return stable 400/413 errors for too many rows.
- Avoid partial writes when rejecting oversized input.
- Preserve current successful import behavior under the cap.
- Add focused tests.

Verification:
- targeted import tests
- changed-file ESLint
- npm run typecheck
- npx next build --webpack
- git diff --check

Commit:
git commit -m "Add import row safety caps"

Final output:
1. Findings summary
2. Import paths inspected
3. Files changed
4. Caps added and rationale
5. Oversized import behavior
6. Tests added/updated
7. Verification commands/results
8. Commit hash
9. Remaining import risks
10. Recommended next workstream
```

---

# Prompt 6 — Dead-Code Confirmation and Removal

```text
Opus Auto-Approve: Dead-Code Confirmation and Safe Removal

We are continuing Planner Dash production-readiness work.

Task:
Confirm and remove safe dead code only.

Goal:
Reduce legacy clutter without deleting compatibility paths or external entrypoints.

Known candidates from earlier audit:
- src/hooks/use-autosave.ts
- documents/upload-local/route.ts returning 410
- app/api/room-set/interpret-intent/route.ts
- matrix-rows/[rowId]/duplicate
- legacy budget-level routes submit/approve/reject/revise
- timeline-dependencies/route.ts
- fnb-catalog/parser-feedback
- directory/people/[personId]/merge
- tasks/[taskId]/links
- speaker-submissions base GET
- legacy app/(shell)/matrix/page.tsx standalone board

Hard rules:
- Do not delete anything unless no UI/server/test/cron/external caller exists.
- Do not delete public/token routes without explicit confirmation.
- Do not delete legacy Matrix compatibility routes unless clearly unreachable and not externally documented.
- Do not change schema.
- Do not add packages.
- Stop on ambiguity.
- Prefer reporting uncertain candidates over deleting them.

Investigation requirements:
For each candidate:
1. grep for imports/callers
2. check route links/navigation
3. check tests
4. check API surface docs if present
5. check whether it could be called externally
6. classify:
   - remove now
   - keep compatibility
   - needs product decision
   - needs later cleanup

Implementation:
- Remove only high-confidence dead code.
- Update tests/imports if needed.
- Do not remove routes that might be externally called unless they intentionally return 410 and are documented as disabled.

Verification:
- targeted tests if changed
- changed-file ESLint
- npm run typecheck
- npx next build --webpack
- git diff --check

Commit:
git commit -m "Remove confirmed dead production code"

Final output:
1. Candidates reviewed
2. Removed files
3. Kept files and why
4. Product decisions needed
5. Tests/verification
6. Commit hash
7. Remaining cleanup backlog
```

---

# Prompt 7 — Upload, Public Token, Rate Limit, and Security Headers Pass

```text
Opus Auto-Approve: Upload Public Token Rate Limit Security Pass

We are continuing Planner Dash production-readiness work.

Task:
Audit upload/download, public-token, rate-limit, and security-header readiness.

Goal:
Identify and implement narrow no-schema security hardening where safe.

Scope:
Inspect:
- R2 presign/finalize/download routes
- speaker portal/intake token routes
- document public/token routes
- upload size/type/object-key validation
- login/invite/platform routes for rate-limit needs
- Next config / middleware / headers config if present
- existing security helper patterns

Hard rules:
- Do not wrap public/token routes in planner auth.
- Do not change public token semantics unless clearly a bug.
- Do not change schema.
- Do not add packages.
- Do not add external infra.
- Do not break uploads/downloads.
- Stop if rate limiting requires provider/infra/product decisions.

Investigation questions:
1. Are upload file types and sizes validated server-side?
2. Are object keys scoped and non-user-controllable?
3. Are finalize routes checking ownership/scope?
4. Are public token routes scoped to token resources only?
5. Are token expiry/revocation semantics clear?
6. Are login/invite/upload endpoints rate-limited or at least documented as needing provider limits?
7. Are security headers/CSP/HSTS/frame/referrer/permissions policies configured?
8. What can be safely implemented without infra?

Implementation if safe:
- Add narrow validation for file size/type/object key if missing and product rules are clear.
- Add static security headers if compatible.
- Add documentation/TODO report for rate limits if infra is required.
- Add focused tests.

Verification:
- targeted tests
- changed-file ESLint
- npm run typecheck
- npx next build --webpack
- git diff --check

Commit:
git commit -m "Harden upload and security defaults"

Final output:
1. Findings summary
2. Files inspected
3. Files changed
4. Security fixes applied
5. Deferred infra/product decisions
6. Tests/verification
7. Commit hash
8. Remaining security risks
```

---

# Prompt 8 — One-Command Test Runner and CI Readiness

```text
Opus Auto-Approve: Test Runner and CI Readiness

We are continuing Planner Dash production-readiness work.

Task:
Create or improve one-command local verification and document CI required checks.

Goal:
Make production-readiness verification repeatable.

Scope:
Inspect:
- package.json scripts at repo root and web/package.json
- existing test scripts
- Playwright/e2e scripts
- lint/typecheck/build scripts
- CI config if present
- docs or README test instructions

Hard rules:
- Do not add packages.
- Do not break existing scripts.
- Do not require unavailable secrets for default local verification.
- Do not make one command run destructive DB actions.
- If E2E requires env not always available, include it as an optional separate command or clearly document it.

Implementation:
- Add a clear script such as:
  - test:prod-readiness
  - verify:prod
  - test:all
  using existing commands only.
- Include lint/typecheck/unit/build.
- Include E2E only if existing env supports it reliably; otherwise add a documented e2e command separately.
- Add docs explaining:
  - what the command runs
  - what requires DB/env
  - what CI should require before merge

Verification:
- run the new command or each sub-command if full command is too slow
- npm run typecheck
- npx next build --webpack
- git diff --check

Commit:
git commit -m "Add production-readiness verification command"

Final output:
1. Existing scripts found
2. Files changed
3. New command(s)
4. What is included/excluded and why
5. Verification results
6. Commit hash
7. Recommended CI required checks
```

---

# Prompt 9 — Release Checklist and Smoke Test Checklist

```text
Opus Auto-Approve: Release and Smoke Test Checklist

We are continuing Planner Dash production-readiness work.

Task:
Create production release checklist and smoke test checklist.

Goal:
Make deploy/rollback/smoke validation explicit.

Scope:
Create docs only unless a tiny script is already clearly appropriate.

Include:
1. Pre-deploy checks
   - clean branch
   - env validated
   - migrations reviewed
   - typecheck/build/tests
   - no dirty generated files
2. Deploy steps
   - branch/tag
   - migration order if any
   - environment variables
   - post-deploy health check
3. Smoke tests
   - login
   - event list
   - event open
   - Run of Show read/edit
   - Timeline read/edit
   - Budget submit/approve/reject
   - Docs upload/review
   - Speaker portal/token preview
   - F&B catalog route
   - seating/room set route
   - Platform Admin if applicable
4. Rollback checklist
5. Who owns go/no-go
6. Known deferred risks

Hard rules:
- Do not change app code.
- Do not change schema.
- Do not invent completed guarantees not proven by source.
- Separate current implementation from future work.

Verification:
- markdown lint if available
- git diff --check

Commit:
git commit -m "Add production release and smoke checklist"

Final output:
1. Docs created
2. Checklist coverage
3. Deferred risks documented
4. Verification
5. Commit hash
```

---

# Prompt 10 — Incident Runbooks and Rollback Plan

```text
Opus Auto-Approve: Incident Runbooks and Rollback Plan

We are continuing Planner Dash production-readiness work.

Task:
Create incident runbooks and rollback plan docs.

Goal:
Make production incidents supportable.

Scope:
Docs only unless existing scripts are obvious and safe.

Runbooks needed:
1. Bad deploy rollback
2. Failed migration
3. App outage
4. Database connectivity outage
5. R2/upload failure
6. Auth/session failure
7. Data incident or suspected cross-tenant exposure
8. Leaked secret
9. Broken public token/speaker portal
10. Budget/Run of Show/Timeline critical workflow failure

Each runbook should include:
- symptoms
- severity
- immediate containment
- diagnostic commands/logs
- rollback/remediation steps
- customer communication notes
- owner/escalation placeholders
- post-incident follow-up

Hard rules:
- Do not claim external monitoring exists unless source confirms it.
- Do not include secrets.
- Do not change app code.
- Do not change schema.

Verification:
- git diff --check

Commit:
git commit -m "Add production incident runbooks"

Final output:
1. Docs created
2. Incidents covered
3. Assumptions/placeholders
4. Verification
5. Commit hash
```

---

# Prompt 11 — Security and Customer Packet

```text
Opus Auto-Approve: Security and Customer Packet

We are continuing Planner Dash production-readiness work.

Task:
Create a customer/security packet draft for Planner Dash.

Goal:
Prepare source-backed security and architecture answers for customer/procurement conversations.

Scope:
Docs only.

Include:
1. Product architecture summary
2. Tenancy model
3. Auth/access model
4. Event access and Platform Admin behavior
5. Data storage overview
6. Document/file storage overview
7. Public token/speaker portal boundaries
8. Audit/activity behavior
9. Backup/restore assumptions and open questions
10. Security controls implemented
11. Security controls pending
12. Known exclusions/deferred risks
13. Pen-test packet notes:
    - route map
    - test account needs
    - modules in scope
    - public/token flows in scope
    - known deferred staffing schema issue if still open

Hard rules:
- Do not overstate guarantees.
- Do not claim RLS/hosted policies were verified unless source proves it.
- Do not claim universal event-access coverage if not true.
- Do not include secrets.
- Do not change app code.
- Do not change schema.

Verification:
- git diff --check

Commit:
git commit -m "Add customer security packet draft"

Final output:
1. Docs created
2. Coverage summary
3. Known open questions
4. Verification
5. Commit hash
```

---

# Prompt 12 — Optional Docs Hub Approval Decision

Use only when you want to revisit the Docs approval production UX.

```text
Opus: Docs Hub Approval Production UX Decision

We are continuing Planner Dash production-readiness work.

Task:
Resolve the Docs Hub approval production UI decision.

Current finding:
The backend document approve/reject/reopen routes work in production and are auth-guarded.
The only planner UI buttons are labeled “Simulate Approve/Reject” and are hidden in production.
Submit-for-review and pull-back are available.
This is not a route-level production 404 bug; it is a product decision.

Goal:
Decide whether production should:
A. promote the existing planner approve/reject controls into real production UI, or
B. keep them hidden and build/track a reviewer-facing approval surface.

Hard rules:
- Do not implement until the decision is clear.
- Do not ship buttons labeled “Simulate” in production.
- Do not weaken auth.
- Do not change schema.
- Do not touch Budget/Matrix/Timeline.

Investigation:
- Inspect event docs UI
- Inspect document approval/reject/reopen routes
- Inspect notification/reviewer recipient behavior
- Inspect tests
- Determine whether current workflow is planner-driven approval or reviewer-driven approval

Final output:
1. Current workflow summary
2. Production gap
3. Recommendation: A or B
4. If A, implementation prompt
5. If B, feature-gap prompt
6. Tests required
7. Product decision needed
```

---

# Prompt 13 — Future Matrix Staffing Rewrite / Schema Reconciliation

Use only when you are ready to handle staffing. It is intentionally not part of the current P1 loop.

```text
Opus: Matrix Staffing Rewrite and Schema Reconciliation Plan

We are continuing Planner Dash production-readiness work.

Current status:
- Matrix staffing DB ground-truth showed Scenario B:
  - MatrixRowStaffAssignment exists
  - SessionStaffAssignment does not exist
  - MatrixRowStaffAssignment holds live staffing data
  - app raw SQL uses MatrixRowStaffAssignment
- Staffing function/schema rewrite was intentionally deferred.

Task:
Produce a staffing rewrite + schema reconciliation plan.

Hard rules:
- Proposal first.
- Do not change schema without approved proposal.
- Do not run migrations.
- Do not move data without backfill plan.
- Do not rewrite app code until canonical model is approved.

Proposal must include:
1. Canonical staffing model/table
2. Migration strategy
3. Backfill/data preservation plan
4. Rollback/remediation notes
5. App-code rewrite plan
6. Test plan
7. Rollout plan
8. Exact files likely changed
9. Hard stops

Final output:
1. Recommended canonical path
2. Schema/migration proposal
3. App rewrite plan
4. Data/backfill plan
5. Tests
6. Risks
7. Next implementation prompt
```

---

# Prompt 14 — Final Production-Readiness Closure Audit

Use this after the P1 and launch-readiness loops are complete.

```text
Opus: Final Planner Dash Production-Readiness Closure Audit

We are closing the Planner Dash production-readiness pass.

Task:
Run a final source-level audit to confirm what is done, what is deferred, and whether any P0/P1 blocker remains.

Scope:
- route/auth critical paths
- Big 3: Run of Show, Budget, Timeline
- uploads/public tokens
- imports
- performance
- test/build readiness
- release/runbook docs
- security/customer packet
- deferred staffing rewrite
- Docs Hub approval decision if still deferred

Hard rules:
- Audit first.
- Do not implement unless the fix is tiny, no-schema, and clearly safe.
- Stop on schema/product ambiguity.

Final output:
1. Current branch/commit
2. Completed production-readiness items
3. Remaining P0 blockers
4. Remaining P1 blockers
5. Deferred product/schema decisions
6. Tests/build status
7. Launch recommendation:
   - green
   - green with known risks
   - not green
8. Exact next action list
```
