# OrcaOS Remaining Immediate Work — Autonomous Prompt Pack

Use with the generic loop controller and `ORCA_IMPLEMENTATION_BRIEF.md`. Execute in order. Only Prompt 0 is ready initially; unlock the next prompt only after its stop gate passes. Do not merge or push.

## Status board

| Prompt | Slice | Status |
|---|---|---|
| 0 | Close confirmed release blockers | Ready |
| 1 | Live release gate and completed-slice regression | Locked |
| 2 | Trust and data integrity | Locked |
| 3 | Event setup and import | Locked |
| 4 | Roadmap and task foundation | Locked |
| 5 | Budget and session-linked costs | Locked |
| 6 | Session operations and outputs | Locked |
| 7 | F&B, dietary, accessibility | Locked |
| 8 | Directory and platform consistency | Locked |
| 9 | Command center, beta hardening, API foundation | Locked |
| 10 | Final immediate-roadmap audit and release recommendation | Locked |

## Universal instructions

Read the brief, plan, progress log, database review, current branch/status/history, and active files. Use subagents only on disjoint read/test/analysis tracks; reconcile before editing. Preserve unrelated work. Keep all changes organization/event authorized. Do not implement Future items or attendance/check-in/no-show functionality. Run focused tests, typecheck, targeted lint, build where practical, `git diff --check`, and document exact PASS/FAIL/BLOCKED evidence. Create one focused commit per prompt when implementation occurred.

## PROMPT 0 — READY

```text
Implement only the two confirmed OrcaOS release blockers in the brief.

1. Fix cross-event session-detail infinite loading. A valid Event A session requested under Event B must reach a visible terminal not-found/authorization/error state with retry where meaningful. Ensure 404/403/500/abort/stale/rejection paths clear loading, settle dependent requests safely, preserve stale-response protection, and never display Event A data under Event B.

2. Fix oversized AV quantity validation in both session-detail and Matrix editors. Determine the supported maximum from repository evidence. If absent, stop for human review. Do not silently truncate, clamp, drop, or convert invalid input to null. Invalid values must show inline errors, issue no PATCH, and show no success toast. Blank remains null; valid positive integers persist.

Add behavioral tests for valid/mismatched event-session, 404/403/500, abort/stale, retry, no leakage, maximum/max+1/very-large/negative/decimal/malformed/blank/positive values, both editors, no PATCH/no false success, and reload persistence. Update progress and database review only if needed. Run focused tests, authorization/isolation tests, typecheck, targeted lint, build, and diff check. Commit:
fix: close Orca session isolation and quantity validation gaps
Report root causes, maximum evidence, files, tests, failures, risks, and whether live testing can resume.
```

### Gate 0

Do not proceed until both blockers are fixed, focused tests pass, and the maximum rule is evidence-based.

## PROMPT 1 — LIVE RELEASE GATE AND COMPLETED-SLICE REGRESSION

```text
Test the real Orca environment without broadening scope or silently fixing code. Mark every result PASS, FAIL, or BLOCKED.

Run: Matrix across all available events; ordinary and rapid A→B→A navigation; direct mismatched session URL; 404/403/500/retry; phone/tablet/desktop layout; all quantity edge cases in both editors; room/session/staff/AV persistence across Matrix, Run of Show, session detail, Command Center and reload; failed-save/network behavior; event isolation; and regression checks for completed Slice 0–4 AI Workspace behavior.

Record exact event names, URLs, viewport limits, request statuses, UI states, screenshots/logs, and environment limitations. Do not call a blocked test passed. If a defect appears, classify it and stop before expanding. Update progress. No implementation commit unless a separate approved follow-up is created.
```

### Gate 1

No unresolved release blocker; completed Slice 0–4 regression is documented; all blocked tests have explicit environmental reasons.

## PROMPT 2 — TRUST AND DATA INTEGRITY

```text
Implement the Immediate trust/data-integrity slice only. Reproduce and fix: import approval; roadmap status/workstream persistence; budget approval/editing and uploaded values; Run of Show typed-value persistence; contract-upload next step; top-level Event Directory aggregation; Catering/Contracts authorization/loading errors; and inaccurate command-center data.

Use independent tracks for persistence, authorization/error states, directory aggregation, and dashboard derivation. Add read-after-write tests, refresh tests, missing-event/denied-user/cross-event tests, and loading/empty/error/retry tests. Confirm dashboard metrics derive from real records. Do not mask failures as empty states or change unrelated modules. Commit:
fix: restore Orca core data integrity and authorization flows
```

### Gate 2

All core values survive reload; authorization/isolation passes; raw backend errors are replaced by intentional UI states; dashboard data is real.

## PROMPT 3 — EVENT SETUP AND IMPORT

```text
Implement the Immediate event-setup/import slice only. Add event search in creation/selection and direct entry after creation. Make import review explicit about required fields, mappings, skipped rows/columns, and errors before completion. Preserve owner, status, workstream/stage, notes/freeform values. Permit safe row/column skipping without discarding usable data. Add upload progress/loading for large files. Add concise first-use guidance for statuses, workstreams/stages, and critical-path behavior; do not build a broad education system.

Test valid imports, missing required fields, unmappable columns/rows, skipped data, owner mapping, notes, large-file loading, retry/failure, duplicate prevention, authorization, and read-after-write. Commit:
feat: improve Orca event setup and import confidence
```

### Gate 3

No useful imported value is silently discarded; review states are accurate; new events route directly into the event.

## PROMPT 4 — ROADMAP AND TASK FOUNDATION

```text
Implement only the Immediate roadmap/task foundation. Make bulk editing reliable and aligned with visible columns. Add explicit numeric 1–100 progress if repository evidence supports it, with Complete forcing 100%. Add a minimal task API/data contract for future external connections without building connectors. Add nested subtasks/checklists with owner, status, due date, and completion rollup. Keep it out of full project-management-suite scope.

Test bulk edit ordering, selection, progress boundaries, completion rollup, parent/child persistence, authorization, refresh, empty/error states, and duplicate submits. Commit:
feat: add Orca roadmap progress and task foundation
```

### Gate 4

Bulk edits and parent-child task state survive reload and remain event-scoped; no external connector is added.

## PROMPT 5 — BUDGET AND SESSION-LINKED COSTS

```text
Implement only the Immediate budget slice. Preserve line-item, paid, committed, uploaded, approval, and calculated values. Improve loading/error/retry behavior. Make command-center budget categories link to the correct filtered grid items and provide clear summary↔full-grid navigation. Add safe session-linked budget lines only where explicit or evidence-backed suggested matching exists; never attach one generic line to every AV/F&B requirement.

Test read-after-write, refresh, approval/edit flows, category links, loading/error/retry, amount precision, duplicate saves, authorization, and explicit link behavior. Commit:
feat: make Orca budget data trustworthy and session-linked
```

### Gate 5

Budget values and approvals survive reload; links open the correct records; no unsafe generic attachment exists.

## PROMPT 6 — SESSION OPERATIONS AND OUTPUTS

```text
Implement only the Immediate session-operations slice. Ensure typed session values update immediately and persist. Add room-set notes. Implement MVP session-level show flow with visible timing. Add Supplies and Signage categories, keeping unused categories visible as reminders. Produce complete role-specific exports for hotel, venue, caterer, AV, and internal staff. Separate internal operational agendas from public attendee agendas. Add organization-configurable terminology for Agenda, Run of Show, Matrix, and Show Flow.

Test create/edit/refresh, minute timing, unused-category visibility, exports against persisted records, internal/public data separation, terminology configuration, authorization, and empty/error/retry states. Do not build the future onsite app or BEO intelligence. Commit:
feat: complete Orca session operations and handoff outputs
```

### Gate 6

Session data and exports agree; public output excludes internal-only data; timing and required categories are visible.

## PROMPT 7 — F&B, DIETARY, AND ACCESSIBILITY

```text
Implement the Immediate F&B/dietary/accessibility slice only. Add auditable separate tax, service fee, discount/concession, original/negotiated pricing, custom/off-menu items, lump-sum discounts, item-type taxability, and service-charge rules. Add configurable structured dietary/allergen tags and menu-item contains/free-of/verification/chef-question/exact-label fields. Add menu filtering/sorting and unmet-need indicators. Surface session-level dietary, mobility, accessibility, timing, route/stage-access, and severe-allergy implications with actionable ownership. Add focused role-specific handoff exports and retain imported menus as an event/venue catalog with source and status.

Human/venue confirmation must be explicit; AI may not present inferred safety facts as verified. Do not build registration-person matching, AI menu recommendation, tax-law libraries, prior-year reusable menu libraries, or catering integrations.

Test calculations, overrides, rounding, taxability, verification state, tags, filters, unmet needs, alerts, exports, source/status, authorization, and read-after-write. Commit:
feat: make Orca F&B and accessibility decisions auditable
```

### Gate 7

Financial calculations are traceable; safety facts show verification state; operational owners can act on relevant needs.

## PROMPT 8 — DIRECTORY AND PLATFORM CONSISTENCY

```text
Implement only the Immediate directory/platform-consistency slice. Aggregate speakers and other role records into the top-level directory. Support profile-context role assignment and multiple roles per contact using canonical records. Apply shared capitalization, labels, navigation, drawer, loading/error/empty, and interaction patterns. Remove dead buttons, redundant Files/Docs sections, confusing dropdowns, and mismatched AV options. Ensure drawers can open the full workspace for deeper edits.

Use a shared-component audit and focused route/authorization tests. Verify no regressions in Matrix, Run of Show, session detail, budget, F&B, and AI Workspace. Commit:
fix: unify Orca directory and platform interaction patterns
```

### Gate 8

Directory data is complete and role-aware; shared surfaces behave consistently; no dead controls remain in audited scope.

## PROMPT 9 — COMMAND CENTER, BETA HARDENING, API FOUNDATION

```text
Implement only the Immediate command-center/beta/API slice. Finalize Session Readiness, Approval Center, Speaker Readiness, Staffing Coverage, and a simple AI Executive Briefing only from real data. Ensure KPIs/widgets are accurate. Make widget edit/resize controls understandable and reliable. Define clean internal API contracts and ownership for live updates without implementing external connectors or synchronization. Document and execute white-glove setup for first beta planners with structured feedback and known-issues tracking.

Test widgets against fixtures with real records, zero-data states, permissions, refresh, resize/edit behavior, stale/error states, AI-summary grounding, and API contract behavior. Commit:
feat: harden Orca command center and beta readiness
```

### Gate 9

Readiness and KPI widgets reflect real records; zero-data states are honest; beta setup and feedback evidence are recorded; no Future module is shipped.

## PROMPT 10 — FINAL IMMEDIATE-ROADMAP AUDIT

```text
Audit the 49 Immediate roadmap rows against the completed Slice 0–4 record, all prompt commits, tests, progress log, and live evidence. Build a row-to-slice matrix with status: shipped, regression-verified, blocked, accepted/deferred with rationale, or not implemented. Confirm no Future row was implemented accidentally. Re-run focused cross-cutting tests for authorization/isolation, persistence, loading/error/retry, empty states, “Not Needed,” dietary verification, exports, and completed AI Workspace behavior. Review migrations and database documentation. Do not implement new features unless a directly proven regression must be fixed.

Report release recommendation, remaining risks, blocked items, environment limitations, exact Future items deferred, and whether Orca is beta-ready. Commit documentation only if necessary:
docs: complete Orca immediate-roadmap audit
```

## Final completion gate

The work is complete only when every Immediate row is accounted for, current blockers are closed, completed slices remain intact, tests/evidence are documented, and Future work is explicitly deferred.
