# OrcaOS Remaining Immediate Work — Implementation Brief

Prepared August 5, 2026. This brief accompanies `ORCA_REMAINING_PROMPTS.md` and `outputs/orca-immediate-implementation-plan.md`.

## Mission

Finish the **49 Immediate** items in the planner-feedback roadmap that are not already complete, while closing the two confirmed release blockers. The goal is a trustworthy beta-ready Orca event workspace: imported planning data survives, operational records are actionable, financial values are auditable, dashboards reflect reality, and every failure is visible and recoverable.

## Required reading

1. Generic loop controller.
2. This brief.
3. `ORCA_REMAINING_PROMPTS.md`.
4. `outputs/orca-immediate-implementation-plan.md`.
5. `docs/implementation/orca-autonomous-progress.md`.
6. `docs/implementation/orca-database-review.md`, if present.
7. Roadmap spreadsheet if available in the repository or attached workspace.

## Source of truth

1. Explicit decisions and completed-work history in this brief.
2. Actual repository schema, services, routes, tests, and persisted behavior.
3. Active prompt.
4. Roadmap spreadsheet and planner feedback.
5. Mockups and inferred ideas.

When evidence conflicts, inspect the repository before deciding. Never treat an unfinished UI as proof that backend capability is absent.

## Current repository state

- Repository: existing `planner-os` Next.js/Prisma/PostgreSQL application.
- Branch: `feature-updates-initial-demos`, unless current repository evidence says otherwise.
- Do not merge or push.
- Do not reset, discard, or rewrite unrelated local work.
- Completed commits include `594211fa`, `08f62fa9`, and `b9d93ca9`; inspect actual history before editing.

Completed Slice 0–4 AI Workspace work and the Matrix/session repair work are preserved. They must be regression-tested, not rebuilt.

## Immediate blockers to run first

1. Cross-event session-detail URL can remain indefinitely on “Loading session…” when Event A’s session ID is requested under Event B. Dependent requests return 404, but the UI lacks a terminal error/retry state.
2. Oversized AV quantity such as `999999999` is truncated by native `maxlength`, then PATCHed as a smaller value and reported successful.

The first prompt must determine the supported maximum from repository evidence. If no maximum exists, stop for human review rather than inventing one.

## Current confirmed passes

Matrix loading across tested events, ordinary cross-event navigation, rapid switching, browser history, achievable narrow responsive layout, and room/session/staff/AV persistence across Matrix, session detail, and Command Center have passed live testing. Direct 320px/390px testing may remain environment-blocked if the browser has a 406px minimum width. Do not overstate that as a pass.

## Scope

### In scope now

- Release blockers and release-gate verification.
- Trust/data integrity and authorization.
- Event setup/import review and onboarding guidance.
- Roadmap bulk editing, progress, task contracts, subtasks/checklists.
- Budget reliability, navigation, and safe session-linked costs.
- Session-level show flow, room-set notes, Supplies/Signage, agendas, terminology, exports.
- F&B pricing/tax/service/discount logic, dietary/allergen coding, accessibility implications, menu catalog, role-specific handoffs.
- Directory aggregation, multi-role contacts, design-system/platform consistency, drawer escalation, dead-control cleanup.
- Real command-center readiness widgets/KPIs, widget controls, internal live-update API contracts, white-glove beta setup.

### Explicitly out of scope

All 31 Future roadmap items: external two-way integrations, invoice/quote intelligence, advanced budget analytics, hotel benefits, BEO import/comparison/revisions, reusable menu libraries/prior-year cloning, jurisdiction tax libraries, full registration/housing integration, speaker CRM, sponsor/exhibitor portals, native/full onsite, Voice integration, attendee app, broad AI agents, robust templates, live client reporting, timesheets, workforce management, advanced room-set/seating, marketing refinement, AI cost accounting, catering integrations, BEO domain filtering, AI menu recommendation, alternate presentation workflows, non-QR Voice, sponsor-specific session requirements.

No attendance, check-in, no-show, `checkedInAt`, or attendance-history work is allowed.

## Architecture rules

- Existing App Router, Prisma/PostgreSQL, canonical models, routes, services, and event authorization are authoritative.
- Every organization/event/session read and write is authorized.
- Server-confirmed state is the source of truth after mutations.
- Required loader failure must be visible and retryable, never a fake empty state.
- “Not Needed” must remain distinct from blank.
- Dietary/allergen claims require explicit verification status.
- Additive migrations only when proven necessary; document in the database review.
- Do not create parallel persistence for Matrix, F&B, or dashboards.
- Do not use arbitrary delays, silent coercion, hidden overflow, or swallowed errors as fixes.

## Slice order and stop gates

1. Release blockers and baseline gate. Stop until both blockers are fixed and tested.
2. Trust/data integrity. Stop until core read-after-write and isolation tests pass.
3. Event setup/import. Stop until skipped/mapped/failed data is explicit.
4. Roadmap/task foundation. Stop until parent-child and bulk-edit persistence passes.
5. Budget/session-linked costs. Stop until values and links survive reload.
6. Session operations/outputs. Stop until session records and exports agree.
7. F&B/dietary/accessibility. Stop until safety status and calculations are auditable.
8. Directory/platform consistency. Stop until shared interaction and error states pass.
9. Command center/beta hardening. Stop until KPIs are real and beta acceptance is documented.

Each prompt may create focused commits, but never merge or push. Update `docs/implementation/orca-autonomous-progress.md` after every prompt. Update `orca-database-review.md` only for actual schema/persistence decisions.

## Definition of done

All 49 Immediate rows are mapped to a completed or explicitly accepted slice. Completed historical work remains intact. Focused tests, typecheck, targeted lint, build where practical, diff checks, authorization/isolation checks, and live verification are recorded as PASS, FAIL, or BLOCKED. Future work is not silently implemented.

## Hard stops

Stop for human review if a maximum/rule cannot be established, a migration or data repair is proposed, authorization would change, destructive database work is needed, unrelated dirty work could be overwritten, environment credentials are required, or scope expands into a Future item.
