# ENGINEERING STANDARDS

## Purpose
This document defines the engineering bar for the Lead Retrieval Admin and related shared systems.

The standard is not "it works." The standard is production-quality, scalable, performance-aware, low-breakage code that is tested before merge and does not create future mess.

This document exists to make implementation decisions consistent across:
- Admin web app
- shared backend and API routes
- Supabase data model and RLS-sensitive flows
- test strategy
- migration and rollout work

## Non-Negotiable Standards

### 1. Single source of truth
Business-critical rules must have one canonical enforcement point.

Rules must not be split across:
- UI checks
- duplicate service helpers
- stale cached fields
- ad hoc route logic
- implicit client assumptions

If a rule matters for permissions, billing, seat consumption, access, or data safety, the server must own it.

Examples:
- seat enforcement belongs in one canonical server-side function
- authorization belongs in server-side role and scope checks
- derived counters must never become the authority for write access

### 2. Server-side enforcement for business rules
The UI may guide, warn, or disable controls, but the server must always enforce the rule.

Never rely on:
- hidden buttons
- disabled UI state
- optimistic assumptions from previously loaded data
- client-side role checks as the final gate

The API or service layer must reject invalid writes even if the UI is stale or bypassed.

### 3. Correct architecture over convenient patches
Do not patch symptoms if the underlying control point is wrong.

Preferred order:
1. fix the canonical enforcement path
2. remove parallel logic
3. update the UI to reflect the canonical behavior
4. add regression coverage

Avoid:
- one-off conditionals to satisfy a single screen
- route-specific copies of the same business rule
- silent fallbacks that hide inconsistent state
- soft workarounds that preserve bad data models

### 4. Idempotent, deterministic mutations
Write paths must be safe, predictable, and repeatable.

Mutations should be:
- explicit
- scoped
- reversible where appropriate
- safe to retry when possible

Avoid mutations that:
- depend on hidden pre-existing state
- partially update related records without reconciliation
- rely on action ordering that is not enforced
- succeed without validating that the DB actually changed

Examples:
- delete endpoints should confirm the row was actually deleted before returning success
- reconciliation should derive from live authoritative records
- migrations should be safe against existing environments and partial history

### 5. Data integrity first
All write logic must preserve data integrity before convenience.

Prefer:
- database constraints for real invariants
- explicit uniqueness where the business model requires it
- foreign keys where ownership matters
- validation close to the write path

Do not tolerate:
- duplicate active records for a canonical business key
- event-agnostic lookups when the domain is event-scoped
- orphaned access rows after delete flows
- denormalized pointers being used as the authority when they can drift

### 6. Performance-aware by default
Performance is a requirement, not cleanup work for later.

Every implementation should consider:
- number of queries
- scope of queries
- row count sensitivity
- repeated work in loops
- unnecessary joins or broad selects
- whether derived values can be computed once per request instead of repeatedly

Prefer:
- narrow selects
- event/company-scoped queries
- service helpers that avoid query duplication
- live-count queries only where correctness matters
- derived caches only where they do not control authorization

Do not trade correctness for speed in authorization or billing logic.

### 7. Low-breakage change strategy
We optimize for safe evolution.

Every non-trivial change should aim to minimize blast radius by:
- editing the fewest files necessary
- preserving existing public contracts unless intentionally changing them
- removing dead logic instead of leaving parallel paths behind
- isolating UI work from backend enforcement work when possible
- using feature-specific tests instead of broad brittle coverage

When touching risky systems such as auth, seats, invites, licenses, RBAC, or routing:
- assume regressions are likely
- inspect adjacent flows before merging
- add targeted regression coverage in the same pass

### 8. Deterministic tests before merge
Tests must prove the critical path, not create false confidence.

Test standards:
- deterministic setup
- isolated state per test where feasible
- cleanup in `finally`
- no hidden reliance on prior test order
- stable selectors for UI tests
- API-level tests when UI is not the right validation layer
- no mocking of the core business rule being verified

Required principle:
If a bug was expensive, confusing, or customer-facing, add a regression test for it before merge.

### 9. No hidden state leakage
Flaky tests and flaky code often come from shared mutable state.

Avoid:
- shared beforeAll snapshots for mutable business data
- reusing mutable tenant/event/license fixtures across tests without restoration
- assuming pre-seeded rows exist unless the test owns them
- in-memory assumptions that are not revalidated from the DB

Prefer:
- per-test snapshots for mutable records
- per-test temp users/data where practical
- cleanup in the reverse order of mutation
- serial execution only when true isolation is not practical

### 10. Explicit invariants in docs and code
If a rule is important, it should exist in both:
- code as an enforceable invariant
- docs as a canonical explanation

Important rules should be documented with:
- the canonical source of truth
- what is derived only
- the business key or scope
- which routes or services enforce it
- what legacy fields still exist but are non-authoritative

## Preferred System Design Patterns

### Canonical service function pattern
For any high-risk rule, use one shared function or service as the authority.

The function should:
- take the minimum required inputs
- validate scope explicitly
- return structured results
- avoid side effects unless it is specifically a mutation function
- be reused by all grant or mutation paths

### Derived state pattern
Derived fields may exist for performance or UI display, but they must be clearly marked as non-authoritative unless they are guaranteed transactionally correct and intentionally authoritative.

Examples of derived-only fields:
- cached counters
- mirrored display totals
- denormalized pointer fields used for convenience lookup

Derived state must never silently replace live enforcement in access control.

### Reconciliation pattern
If derived state exists, there must be a safe reconciliation path that recalculates from the authoritative records.

Reconciliation must:
- read from the true source of truth
- be idempotent
- handle historical bad data as safely as possible
- never invent missing relationships

### Delete pattern
Delete behavior must be explicit.

A delete path must clearly be one of:
- hard delete
- soft delete
- guarded delete
- revoke-and-delete

It must never pretend to delete while leaving authoritative access intact.

Before returning success, the write path must verify the expected end state.

## Migration Standards

### Production-safe migrations only
Schema changes must be safe for real environments, not only fresh local databases.

Migration expectations:
- explicit handling for existing data
- idempotent where practical
- safe ordering of constraints and data cleanup
- no destructive assumptions without validation
- rollback or remediation thought through before apply

For risky data changes:
- detect duplicates first
- clean up bad rows intentionally
- then add the protecting constraint

### Never hide data cleanup inside vague migrations
If a migration fixes business data, the cleanup logic should be understandable and reviewable.

## API and Route Standards

### Route handlers should stay thin
Route handlers should:
- authenticate
- authorize
- validate input
- call the canonical service or mutation path
- return explicit structured responses

They should not become the place where business logic forks by route.

### Consistent error semantics
Errors for business rule violations should be:
- explicit
- stable enough for UI handling
- differentiated from auth failures and server failures

Examples:
- no active license
- no available seats
- dependent active app users prevent delete
- invalid event scope

## UI Standards

### UI reflects truth, does not create truth
The UI should help users understand the rule, but it should not be the only place the rule exists.

UI standards:
- no fake success states before server confirmation on sensitive flows
- no destructive actions without clear confirmation
- no stale capacity assumptions without refresh after mutation
- action visibility and copy should reflect server-backed reality

### Stable test hooks where needed
Use semantic roles first. Add `data-testid` only where it materially improves test reliability for important flows.

## Responsive UI Standards

Responsive behavior is a product requirement. Customer-facing layouts must preserve their intended composition for as long as the available content width can reasonably support it.

### 1. Fluid-first responsive design

Do not use framework breakpoints alone as the reason to reflow a layout. Before changing column count or stacking major regions, progressively adapt:

- horizontal and vertical gaps
- card and component padding
- typography within reasonable approved limits
- icon sizing where appropriate
- non-essential whitespace

A layout may recompose only when its contents can no longer remain usable at their minimum practical dimensions.

### 2. Prefer container width over viewport assumptions

Dashboard pages live inside application shells with sidebars, navigation, and other persistent UI. Responsive decisions should therefore be based on the width actually available to the component whenever practical, rather than blindly using generic viewport labels such as `sm`, `md`, `lg`, or `xl`.

Prefer container queries or equivalent component-scoped responsiveness for major dashboard modules when supported by the current stack. Viewport breakpoints may still be used where appropriate, but they are not the architecture by themselves.

### 3. Preserve desktop density

Desktop layouts must not prematurely become tablet layouts. If a design specifies four cards across and those cards remain readable and usable, preserve four cards across.

The preferred transition is:

`4 columns → tighter 4 columns → 2 columns at the minimum usable card width → 1 column where appropriate`

Do not transition directly from four columns to two oversized columns merely because a framework breakpoint was crossed. Layout transitions must follow actual usability constraints.

### 4. Define responsive behavior from component constraints

For repeatable cards, panels, toolbars, navigation groups, and similar components:

- define the practical minimum usable width
- allow components to shrink fluidly above that threshold
- use flexible grid sizing such as `minmax(0, 1fr)` where appropriate
- avoid unnecessary fixed widths
- avoid rules that create premature wrapping or excessive whitespace

Responsive architecture must be driven by content and component constraints.

### 5. Maintain visual hierarchy while compressing

Compressed desktop layouts must still feel like the desktop design. When space decreases:

- reduce whitespace before removing structure
- reduce padding before stacking
- maintain alignment
- preserve information hierarchy
- keep controls appropriately sized
- do not create giant cards simply because the column count changed

Responsive does not mean every element should become larger or taller.

### 6. Shared components must share responsive behavior

When multiple views use the same conceptual component or toolbar, reuse the same shared implementation where practical. This includes search/filter toolbars, entity list headers, card grids, action rows, and bulk-selection controls.

Do not independently style equivalent responsive layouts across multiple pages when doing so can create drift.

### 7. Responsive QA is required

Every materially changed customer-facing surface must be checked at:

- wide desktop
- standard desktop
- compressed desktop
- tablet
- mobile

Also check common browser zoom levels where practical: 100%, 110%, and 125%.

Responsive acceptance is visual, not merely “nothing overflows.” Verify that:

- the intended desktop composition is preserved as long as practical
- text does not clip
- buttons do not collide or wrap unnecessarily
- cards do not become unnecessarily large
- whitespace remains proportionate
- layouts do not reflow prematurely
- sidebar and navigation width is accounted for
- search/action toolbars remain aligned
- there is no unexpected horizontal scrolling
- tablet and mobile recomposition remains intentional and usable

### 8. Breakpoints are implementation tools, not design decisions

Framework breakpoints such as Tailwind `md`, `lg`, and `xl` must not independently determine the product layout.

First decide: “What is the minimum width at which this composition remains usable?” Then implement the CSS, container, or breakpoint behavior that enforces that decision.

Do not start with: “What does Tailwind do at `lg`?”

### 9. Responsive regressions are product regressions

If a page looks correct at one desktop width but unnecessarily changes composition at another common desktop width, treat that as a responsive defect.

Premature wrapping, arbitrary column changes, oversized cards, misaligned toolbars, and inconsistent responsive behavior must be treated with the same seriousness as other customer-facing UI regressions.

## Review Checklist
Before merging, ask:

1. Is there one canonical source of truth for the business rule?
2. Is the rule enforced server-side?
3. Did we remove parallel or stale logic?
4. Are derived fields clearly non-authoritative?
5. Are queries scoped and performance-aware?
6. Are writes idempotent or at least safe and validated?
7. Did we add regression coverage for the failure we fixed?
8. Are tests deterministic and isolated?
9. Did we avoid broad refactor blast radius?
10. Would a future engineer know where the real rule lives?
11. Does the UI preserve the intended composition across wide, standard, and compressed desktop widths before intentionally recomposing for tablet/mobile?

If the answer to any of these is no, the change is not finished.

## Current Project Standard
This is the bar for the project:
- production-quality
- scalable
- performance-aware
- low-breakage
- tested before merge
- no shortcut fixes that create future mess

In practical terms, the standard is:
- correct architecture
- single source of truth
- minimal duplicated logic
- safe data handling
- deterministic tests
- no hidden state leaks
- no brittle patches

## Audit and security notes (historical)

- Point-in-time security audits (e.g. tenant isolation, campaign GET scope, invite activation) are **archived** under [`docs/old/SECURITY_AUDIT.md`](./old/SECURITY_AUDIT.md). **Treat findings as unverified until confirmed in current code** — many items may already be fixed.
- Load-test-only hooks (e.g. dev bypass headers, extra query logging) are tracked in [`docs/old/load-testing-cleanup.md`](./old/load-testing-cleanup.md) and [`docs/old/LOAD_TEST_CLEANUP.md`](./old/LOAD_TEST_CLEANUP.md). Do not ship test bypasses to production.

## Prompt Model Selection

This section is durable policy. It does not name specific models, because model
availability changes. For the current model and Strength guidance, see
[`MODEL_SELECTION.md`](./MODEL_SELECTION.md).

### Core rule

Select the best currently available model for the specific task.

Use the lowest Strength that is still fully capable of completing the work
correctly and safely.

Optimize for BOTH:

- capability
- token / usage efficiency

Do not automatically choose the strongest model.

Do not deliberately underpower difficult work to save tokens.

Choose based on:

- task complexity
- architectural risk
- ambiguity
- number of interacting components
- regression risk
- scope of files/systems involved
- amount of autonomous reasoning required
- debugging difficulty
- migration/data risk
- product/UX reasoning required
- expected iteration length

### Recommendation challenge rule

When the user questions a model or Strength recommendation, treat that as a
request to VERIFY the recommendation.

It is NOT a request to automatically downgrade it.

For example:

- "Why Sol High?"
- "Do we really need High?"
- "Are you sure?"
- "Is that overkill?"

should trigger a fresh evaluation of:

- complexity
- risk
- scope
- autonomy required
- likely token cost
- whether a cheaper option is fully sufficient

If the original recommendation is still the best fit, KEEP IT and explain why.

Only change the recommendation when re-evaluation genuinely supports a different
choice.

Do not become more conservative merely because the recommendation was
challenged.

The objective is:

**BEST MODEL FOR THE JOB + LOWEST SUFFICIENT STRENGTH**

Not `CHEAPEST POSSIBLE`, and not `STRONGEST POSSIBLE`.

### Prompt header format

Active prompt-writing guides and prompt packs in this repository use exactly:

```txt
Model: [model]
Strength: [strength]
```

Example:

```txt
Model: Sol
Strength: High
```

Do not use `Recommended model:`, `Reasoning:`, or `Thinking:` in active prompts.

Every concrete example should carry the appropriate model and the lowest
sufficient Strength for THAT example. Do not normalize every prompt to one
model/Strength pair.

Historical records, archived prompt packs, and completed ledgers are evidence of
what was actually run. Leave their original headers intact.

## How to Use This Document
Use this doc when:
- writing implementation prompts
- reviewing Cursor output
- deciding whether a fix is architectural or patchwork
- evaluating migrations and data cleanup plans
- deciding what tests are required before merge

If a proposed change violates this document, the change should be revised before merge.
